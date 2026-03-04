import type {
  RunConfig,
  SafetyPolicy,
  JourneyResult,
  StepResult,
  ArtifactRef,
  VideoStatus,
} from "@web-qa-agent/shared";
import { evaluate } from "../safety/policy.js";
import { writeSafetyEvent } from "../safety/events.js";
import { safetyEventsPath } from "../run/paths.js";
import { createHarness, closeHarness } from "./harness.js";
import {
  attachRecorder,
  formatConsoleLogs,
  formatPageErrors,
} from "./recorder.js";
import { runStep, runStepSoft } from "./steps.js";
import { startTimer, stopTimer } from "./time.js";
import { assertRenderedContent } from "../journeys/assertions.js";
import {
  consoleLogPath,
  pageErrorsPath,
  networkEventsPath,
  screenshotFailPath,
  screenshotSoftFailPath,
  stepScreenshotPath,
  toRelative,
} from "../artifacts/layout.js";
import { writeTextFile, writeJsonFile } from "../artifacts/writer.js";

export async function runSmokeJourney(
  config: RunConfig,
  policy: SafetyPolicy,
): Promise<JourneyResult> {
  const journeyId = "smoke";
  const journeyTimer = startTimer();
  const steps: StepResult[] = [];
  const artifacts: ArtifactRef[] = [];
  let httpStatus: number | undefined;
  let pageTitle: string | undefined;
  let videoStatus: VideoStatus | undefined;
  let failed = false;
  const warnings: string[] = [];

  // Safety check: evaluate NAVIGATE action — always log the decision
  const navAction = { type: "NAVIGATE" as const, label: config.url, url: config.url };
  const navDecision = evaluate(policy, navAction);
  await writeSafetyEvent(config.outDir, config.runId, navAction, navDecision);

  if (!navDecision.allowed) {
    const timing = stopTimer(journeyTimer);
    return {
      journeyId,
      name: "smoke",
      ...timing,
      status: "FAIL",
      steps: [
        {
          index: 0,
          name: "safety-check-navigate",
          status: "FAIL",
          ...timing,
          error: { message: `Navigation blocked by safety policy: ${navDecision.reason}` },
        },
      ],
      artifacts: [],
      safetyEventsPath: toRelative(config.outDir, safetyEventsPath(config.outDir)),
    };
  }

  const harness = await createHarness(config.playwright, config.outDir, journeyId);
  const recorder = attachRecorder(harness.page);
  let stepIndex = 0;

  try {
    // Step 1: goto
    const gotoStep = await runStep("goto", stepIndex++, async () => {
      const response = await harness.page.goto(config.url, {
        waitUntil: "domcontentloaded",
      });
      httpStatus = response?.status();
    }, { actionMeta: { actionType: "goto", label: "goto" } });
    steps.push(gotoStep);
    if (gotoStep.status === "FAIL") failed = true;

    if (config.playwright.stepScreenshots && !failed) {
      const ssPath = stepScreenshotPath(config.outDir, journeyId, gotoStep.index);
      await harness.page.screenshot({ path: ssPath });
      gotoStep.artifacts = [{ kind: "step_screenshot", path: toRelative(config.outDir, ssPath) }];
    }

    // Step 2: wait for readyState complete
    if (!failed) {
      const readyStep = await runStep("wait-ready-state", stepIndex++, async () => {
        await harness.page.waitForLoadState("load", { timeout: 10000 });
      }, { actionMeta: { actionType: "waitFor", label: "wait-ready-state" } });
      steps.push(readyStep);
      if (readyStep.status === "FAIL") failed = true;

      if (config.playwright.stepScreenshots && !failed) {
        const ssPath = stepScreenshotPath(config.outDir, journeyId, readyStep.index);
        await harness.page.screenshot({ path: ssPath });
        readyStep.artifacts = [{ kind: "step_screenshot", path: toRelative(config.outDir, ssPath) }];
      }
    }

    // Step 3: capture title
    if (!failed) {
      const titleStep = await runStep("capture-title", stepIndex++, async () => {
        pageTitle = await harness.page.title();
      }, { actionMeta: { actionType: "assert", label: "capture-title" } });
      steps.push(titleStep);
      if (titleStep.status === "FAIL") failed = true;
    }

    // Step 4: assert body is attached (hard fail if no <body> at all)
    if (!failed) {
      const bodyStep = await runStep("assert-body-attached", stepIndex++, async () => {
        await harness.page.waitForSelector("body", { state: "attached", timeout: 10_000 });
      }, { actionMeta: { actionType: "assert", label: "assert-body-attached" } });
      steps.push(bodyStep);
      if (bodyStep.status === "FAIL") failed = true;
    }

    // Step 5: assert rendered content (soft fail — 3-signal heuristic)
    if (!failed) {
      const contentStep = await runStepSoft("assert-rendered-content", stepIndex++, async () => {
        await assertRenderedContent(harness.page);
      }, { actionMeta: { actionType: "assert", label: "assert-rendered-content" } });
      steps.push(contentStep);
      if (contentStep.status === "SOFT_FAIL") {
        warnings.push(contentStep.error!.message);
        // Capture soft-fail screenshot
        try {
          const ssPath = screenshotSoftFailPath(config.outDir, journeyId);
          await harness.page.screenshot({ path: ssPath, fullPage: true });
          artifacts.push({ kind: "screenshot", path: toRelative(config.outDir, ssPath) });
        } catch {
          // Page may be in bad state
        }
      }
      if (contentStep.status === "FAIL") failed = true;
    }

    // Step 6: check HTTP status
    if (!failed) {
      const statusStep = await runStep("check-http-status", stepIndex++, async () => {
        if (httpStatus !== undefined && httpStatus >= 400) {
          throw new Error(`Main document returned HTTP ${httpStatus}`);
        }
      }, { actionMeta: { actionType: "assert", label: "check-http-status" } });
      steps.push(statusStep);
      if (statusStep.status === "FAIL") failed = true;
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

    // Write network events log
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
    name: "smoke",
    ...timing,
    status: failed ? "FAIL" : "PASS",
    steps,
    summary: {
      url: config.url,
      httpStatus,
      title: pageTitle,
    },
    artifacts,
    video: videoStatus,
    safetyEventsPath: toRelative(config.outDir, safetyEventsPath(config.outDir)),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
