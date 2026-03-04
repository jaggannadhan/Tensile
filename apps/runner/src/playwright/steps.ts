import type { StepResult, StepFailureKind, StepAction } from "@web-qa-agent/shared";
import { startTimer, stopTimer } from "./time.js";

/** Throw this from soft assertions to produce SOFT_FAIL instead of FAIL. */
export class SoftAssertionError extends Error {
  readonly isSoft = true;
  constructor(message: string) {
    super(message);
    this.name = "SoftAssertionError";
  }
}

export interface ActionMeta {
  actionType: StepAction;
  selector?: { strategy: string; primary: string };
  label?: string;
}

export interface RunStepOptions {
  /** Per-step timeout in ms. If the fn takes longer, it is rejected. */
  timeoutMs?: number;
  /** If set, the step is skipped without calling fn. */
  skipReason?: string;
  /** Action metadata embedded into the StepResult for coverage analysis. */
  actionMeta?: ActionMeta;
}

/**
 * Execute a step function and return a StepResult.
 * - On success: status PASS
 * - On failure: status FAIL with error + failureKind
 * - If skipReason provided: status SKIP, fn not called
 */
export async function runStep(
  name: string,
  index: number,
  fn: () => Promise<void>,
  options?: RunStepOptions,
): Promise<StepResult> {
  const meta = options?.actionMeta
    ? { actionType: options.actionMeta.actionType, selector: options.actionMeta.selector, label: options.actionMeta.label }
    : {};

  if (options?.skipReason) {
    const timer = startTimer();
    const timing = stopTimer(timer);
    return {
      index,
      name,
      status: "SKIP",
      ...timing,
      error: { message: options.skipReason },
      failureKind: "SAFETY_BLOCKED",
      ...meta,
    };
  }

  const timer = startTimer();
  try {
    if (options?.timeoutMs) {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Step "${name}" timed out after ${options.timeoutMs}ms`)),
            options.timeoutMs,
          ),
        ),
      ]);
    } else {
      await fn();
    }
    const timing = stopTimer(timer);
    return {
      index,
      name,
      status: "PASS",
      ...timing,
      ...meta,
    };
  } catch (err) {
    const timing = stopTimer(timer);
    const message = (err as Error).message;
    return {
      index,
      name,
      status: "FAIL",
      ...timing,
      error: {
        message,
        stack: (err as Error).stack,
      },
      failureKind: classifyError(message),
      ...meta,
    };
  }
}

/**
 * Like runStep, but catches SoftAssertionError as SOFT_FAIL.
 * Regular errors still produce FAIL.
 */
export async function runStepSoft(
  name: string,
  index: number,
  fn: () => Promise<void>,
  options?: RunStepOptions,
): Promise<StepResult> {
  const meta = options?.actionMeta
    ? { actionType: options.actionMeta.actionType, selector: options.actionMeta.selector, label: options.actionMeta.label }
    : {};

  if (options?.skipReason) {
    const timer = startTimer();
    const timing = stopTimer(timer);
    return {
      index,
      name,
      status: "SKIP",
      ...timing,
      error: { message: options.skipReason },
      failureKind: "SAFETY_BLOCKED",
      ...meta,
    };
  }

  const timer = startTimer();
  try {
    if (options?.timeoutMs) {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Step "${name}" timed out after ${options.timeoutMs}ms`)),
            options.timeoutMs,
          ),
        ),
      ]);
    } else {
      await fn();
    }
    const timing = stopTimer(timer);
    return {
      index,
      name,
      status: "PASS",
      ...timing,
      ...meta,
    };
  } catch (err) {
    const timing = stopTimer(timer);
    const message = (err as Error).message;
    const isSoft = err instanceof SoftAssertionError;
    return {
      index,
      name,
      status: isSoft ? "SOFT_FAIL" : "FAIL",
      ...timing,
      error: {
        message,
        stack: (err as Error).stack,
      },
      failureKind: classifyError(message),
      ...meta,
    };
  }
}

function classifyError(message: string): StepFailureKind {
  if (message.includes("timed out")) return "TIMEOUT";
  if (message.includes("No element found") || message.includes("waiting for locator")) return "SELECTOR_NOT_FOUND";
  if (message.includes("net::") || message.includes("Navigation")) return "NAVIGATION_ERROR";
  if (message.includes("NO_OBSERVABLE_CHANGE")) return "NO_OBSERVABLE_CHANGE";
  if (message.includes("Assertion failed") || message.includes("assert")) return "ASSERTION_FAILED";
  if (message.includes("safety") || message.includes("blocked")) return "SAFETY_BLOCKED";
  return "UNKNOWN";
}
