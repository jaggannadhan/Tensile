import type { ActionType, SafetyAction } from "@web-qa-agent/shared";

export const READONLY_ALLOWED: ReadonlySet<ActionType> = new Set([
  "NAVIGATE",
  "CLICK",
  "WAIT",
  "PRESS_KEY",
  "DOWNLOAD",
]);

export const DESTRUCTIVE_ACTIONS: ReadonlySet<ActionType> = new Set([
  "DELETE",
  "PURCHASE",
  "UPDATE_SETTINGS",
  "SUBMIT_FORM",
  "UPLOAD",
]);

export function createAction(
  type: ActionType,
  label?: string,
  url?: string,
): SafetyAction {
  return { type, label, url };
}
