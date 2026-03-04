import type { SafetyAction, SafetyDecision, SafetyEvent } from "@web-qa-agent/shared";
import { appendLine } from "../artifacts/writer.js";
import { safetyEventsPath } from "../run/paths.js";

export function createEvent(
  runId: string,
  action: SafetyAction,
  decision: SafetyDecision,
): SafetyEvent {
  return {
    timestamp: new Date().toISOString(),
    runId,
    action,
    decision,
  };
}

export function serializeEvent(event: SafetyEvent): string {
  return JSON.stringify(event);
}

/** Create and persist a safety event in one call. */
export async function writeSafetyEvent(
  outDir: string,
  runId: string,
  action: SafetyAction,
  decision: SafetyDecision,
): Promise<void> {
  const event = createEvent(runId, action, decision);
  await appendLine(safetyEventsPath(outDir), serializeEvent(event));
}
