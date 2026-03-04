import type {
  RunConfig,
  SafetyPolicy,
  JourneySpec,
  StepSpec,
  JourneyResult,
  ArtifactRef,
  VideoStatus,
  StepResult,
} from "@web-qa-agent/shared";
import { evaluate } from "../safety/policy.js";
import { writeSafetyEvent } from "../safety/events.js";
import { safetyEventsPath } from "../run/paths.js";
import { createHarness, closeHarness } from "../playwright/harness.js";
import {
  attachRecorder,
  formatConsoleLogs,
  formatPageErrors,
} from "../playwright/recorder.js";
import { runStep, runStepSoft, type ActionMeta } from "../playwright/steps.js";
import { startTimer, stopTimer } from "../playwright/time.js";
import {
  consoleLogPath,
  pageErrorsPath,
  networkEventsPath,
  screenshotFailPath,
  stepScreenshotPath,
  toRelative,
} from "../artifacts/layout.js";
import { writeTextFile, writeJsonFile } from "../artifacts/writer.js";
import { toPlaywrightLocator } from "./selector.js";
import { assertPageHealthy, assertRenderedContent, assertElementVisible } from "./assertions.js";
import { takeSnapshot, detectChange } from "./observable.js";

/** Build ActionMeta from a StepSpec for embedding in StepResult. */
function buildActionMeta(stepSpec: StepSpec): ActionMeta {
  return {
    actionType: stepSpec.action,
    selector: stepSpec.selector ? { strategy: stepSpec.selector.strategy, primary: stepSpec.selector.primary } : undefined,
    label: stepSpec.description,
  };
}

/**
 * Execute a single planned journey through the Playwright harness.
 * One fresh browser context per journey. Steps are run sequentially
 * with per-step timeouts and a wall-clock journey deadline.
 */
export async function executeJourney(
  spec: JourneySpec,
  config: RunConfig,
  policy: SafetyPolicy,
): Promise<JourneyResult> {
  const journeyId = spec.id;
  const journeyTimer = startTimer();
  const steps: StepResult[] = [];
  const artifacts: ArtifactRef[] = [];
  let videoStatus: VideoStatus | undefined;
  let failed = false;
  const warnings: string[] = [];

  // If pre-check blocked the journey, return immediately
  if (spec.safetyPreCheck === "BLOCKED") {
    const timing = stopTimer(journeyTimer);
    return {
      journeyId,
      name: spec.name,
      ...timing,
      status: "FAIL",
      steps: [
        {
          index: 0,
          name: "safety-pre-check",
          status: "FAIL",
          ...timing,
          error: { message: spec.blockReason ?? "Journey blocked by safety pre-check" },
          failureKind: "SAFETY_BLOCKED",
        },
      ],
      artifacts: [],
      safetyEventsPath: toRelative(config.outDir, safetyEventsPath(config.outDir)),
    };
  }

  const journeyDeadline = Date.now() + config.journey.journeyTimeoutMs;
  const harness = await createHarness(config.playwright, config.outDir, journeyId);
  const recorder = attachRecorder(harness.page);
  let stepIndex = 0;

  try {
    for (const stepSpec of spec.steps) {
      // Check journey wall-clock deadline
      const remaining = journeyDeadline - Date.now();
      if (remaining <= 0) {
        steps.push(makeTimeoutStep(stepIndex++, stepSpec, "Journey timeout exceeded"));
        failed = true;
        break;
      }

      const stepTimeoutMs = Math.min(config.journey.stepTimeoutMs, remaining);

      // Safety re-eval per step (in case policy context changes)
      if (stepSpec.safetyAction) {
        const decision = evaluate(policy, stepSpec.safetyAction);
        await writeSafetyEvent(config.outDir, config.runId, stepSpec.safetyAction, decision);

        if (!decision.allowed) {
          const result = await runStep(stepSpec.description, stepIndex++, async () => {}, {
            skipReason: `Safety blocked: ${decision.reason}`,
            actionMeta: buildActionMeta(stepSpec),
          });
          steps.push(result);
          // For goto steps, a safety block fails the journey
          if (stepSpec.action === "goto") {
            failed = true;
            break;
          }
          continue;
        }
      }

      const result = await dispatchStep(
        stepSpec,
        stepIndex,
        stepTimeoutMs,
        harness.page,
        recorder,
        config,
      );
      steps.push(result);

      // Collect warnings from SOFT_FAIL steps
      if (result.status === "SOFT_FAIL" && result.error) {
        warnings.push(result.error.message);
      }

      // Step screenshots
      if (config.playwright.stepScreenshots && (result.status === "PASS" || result.status === "SOFT_FAIL")) {
        try {
          const ssPath = stepScreenshotPath(config.outDir, journeyId, result.index);
          await harness.page.screenshot({ path: ssPath });
          result.artifacts = [{ kind: "step_screenshot", path: toRelative(config.outDir, ssPath) }];
        } catch {
          // Page may be in bad state
        }
      }

      stepIndex++;

      if (result.status === "FAIL") {
        failed = true;
        break;
      }
    }

    // Capture failure screenshot
    if (failed) {
      const ssPath = screenshotFailPath(config.outDir, journeyId);
      try {
        await harness.page.screenshot({ path: ssPath, fullPage: true });
        artifacts.push({ kind: "screenshot", path: toRelative(config.outDir, ssPath) });
      } catch {
        // Page may be in bad state
      }
    }
  } finally {
    // Write console log
    const clPath = consoleLogPath(config.outDir, journeyId);
    await writeTextFile(clPath, formatConsoleLogs(recorder.consoleLogs));
    artifacts.push({ kind: "console", path: toRelative(config.outDir, clPath) });

    // Write page errors
    const pePath = pageErrorsPath(config.outDir, journeyId);
    await writeTextFile(pePath, formatPageErrors(recorder.pageErrors));
    artifacts.push({ kind: "pageerrors", path: toRelative(config.outDir, pePath) });

    // Write network events
    if (config.playwright.networkEvents) {
      const nePath = networkEventsPath(config.outDir, journeyId);
      await writeJsonFile(nePath, recorder.networkEvents);
      artifacts.push({ kind: "network_events", path: toRelative(config.outDir, nePath) });
    }

    // Close harness (saves trace + video)
    const harnessResult = await closeHarness(harness);
    artifacts.push(...harnessResult.artifacts);
    videoStatus = harnessResult.video;
  }

  const timing = stopTimer(journeyTimer);

  return {
    journeyId,
    name: spec.name,
    ...timing,
    status: failed ? "FAIL" : "PASS",
    steps,
    artifacts,
    video: videoStatus,
    safetyEventsPath: toRelative(config.outDir, safetyEventsPath(config.outDir)),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/** Dispatch a single step based on its action type. */
async function dispatchStep(
  stepSpec: StepSpec,
  index: number,
  timeoutMs: number,
  page: import("playwright").Page,
  recorder: import("../playwright/recorder.js").RecorderState,
  config: RunConfig,
): Promise<StepResult> {
  const actionMeta = buildActionMeta(stepSpec);

  switch (stepSpec.action) {
    case "goto":
      return runStep(stepSpec.description, index, async () => {
        if (!stepSpec.url) throw new Error("goto step missing url");
        const response = await page.goto(stepSpec.url, {
          waitUntil: "domcontentloaded",
        });
        const status = response?.status();
        if (status !== undefined && status >= 400) {
          throw new Error(`Navigation returned HTTP ${status}`);
        }
      }, { timeoutMs, actionMeta });

    case "click":
      return runStep(stepSpec.description, index, async () => {
        if (!stepSpec.selector) throw new Error("click step missing selector");

        // Snapshot before click for observable change detection
        const before = config.journey.observableChange
          ? await takeSnapshot(page, recorder)
          : undefined;

        const clicked = await tryClickWithFallbacks(
          page,
          stepSpec.selector.primary,
          stepSpec.selector.fallbacks,
          timeoutMs,
        );

        if (!clicked) {
          throw new Error(`No element found for selector: ${stepSpec.selector.primary}`);
        }

        // Observable change detection: wait then compare
        if (before) {
          await page.waitForTimeout(config.journey.clickWaitMs);
          const after = await takeSnapshot(page, recorder);
          const change = detectChange(before, after);

          if (!change.changed) {
            throw new Error(`NO_OBSERVABLE_CHANGE: ${change.details}`);
          }
        }
      }, { timeoutMs, actionMeta });

    case "fill":
      return runStep(stepSpec.description, index, async () => {
        if (!stepSpec.selector) throw new Error("fill step missing selector");
        const locatorStr = toPlaywrightLocator(stepSpec.selector);
        const locator = page.locator(locatorStr);
        await locator.waitFor({ state: "visible", timeout: timeoutMs });
        await locator.fill(stepSpec.value ?? "");
      }, { timeoutMs, actionMeta });

    case "waitFor":
      return runStep(stepSpec.description, index, async () => {
        if (!stepSpec.selector) throw new Error("waitFor step missing selector");
        const locatorStr = toPlaywrightLocator(stepSpec.selector);
        await page.locator(locatorStr).waitFor({ state: "visible", timeout: timeoutMs });
      }, { timeoutMs, actionMeta });

    case "assert":
      return runStepSoft(stepSpec.description, index, async () => {
        // Hard: body attached + no error title patterns
        await assertPageHealthy(page);
        // Selector-aware: if the step has a target selector, check it (soft)
        if (stepSpec.selector) {
          await assertElementVisible(page, stepSpec.selector.primary, timeoutMs);
        } else {
          // Generic: viewport-sized rendered content (soft)
          await assertRenderedContent(page);
        }
      }, { timeoutMs, actionMeta });

    default: {
      const _exhaustive: never = stepSpec.action;
      throw new Error(`Unknown step action: ${_exhaustive}`);
    }
  }
}

/** Try clicking the primary selector, then fallbacks in order. Returns true if any succeeded. */
async function tryClickWithFallbacks(
  page: import("playwright").Page,
  primary: string,
  fallbacks: string[],
  timeoutMs: number,
): Promise<boolean> {
  // Try primary first
  const primaryLocator = page.locator(primary);
  try {
    await primaryLocator.waitFor({ state: "visible", timeout: Math.min(timeoutMs, 5000) });
    await primaryLocator.click();
    return true;
  } catch {
    // Primary failed, try fallbacks
  }

  for (const fallback of fallbacks) {
    try {
      const locator = page.locator(fallback);
      await locator.waitFor({ state: "visible", timeout: Math.min(timeoutMs, 3000) });
      await locator.click();
      return true;
    } catch {
      // Try next fallback
    }
  }

  return false;
}

/** Create a StepResult for a step that exceeded the journey deadline. */
function makeTimeoutStep(index: number, stepSpec: StepSpec, message: string): StepResult {
  const timer = startTimer();
  const timing = stopTimer(timer);
  return {
    index,
    name: stepSpec.description,
    status: "FAIL",
    ...timing,
    error: { message },
    failureKind: "TIMEOUT",
    ...buildActionMeta(stepSpec),
  };
}
