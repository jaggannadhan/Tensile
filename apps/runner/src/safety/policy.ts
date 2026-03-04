import type { SafetyAction, SafetyDecision, SafetyPolicy } from "@web-qa-agent/shared";
import { READONLY_ALLOWED, DESTRUCTIVE_ACTIONS } from "./actions.js";
import { HARD_BLOCK_PATTERNS, matchesAnyPattern } from "./denylist.js";

export function buildPolicy(
  readOnly: boolean,
  denylist: string[],
  allowlist: string[],
): SafetyPolicy {
  return {
    readOnly,
    denylist,
    allowlist,
    hardBlockPatterns: [...HARD_BLOCK_PATTERNS],
  };
}

export function evaluate(policy: SafetyPolicy, action: SafetyAction): SafetyDecision {
  const label = action.label ?? "";

  // Rule 1: Hard-block patterns — cannot be overridden
  const hardMatch = matchesAnyPattern(label, policy.hardBlockPatterns);
  if (hardMatch) {
    return {
      allowed: false,
      reason: `Hard-blocked: label matches "${hardMatch}"`,
      ruleId: "HARD_BLOCK",
      severity: "block",
    };
  }

  // Rule 2: Denylist label patterns
  const denyMatch = matchesAnyPattern(label, policy.denylist);
  if (denyMatch) {
    // Check if explicitly allowlisted by type
    if (policy.allowlist.includes(action.type) && !policy.readOnly) {
      return {
        allowed: true,
        reason: `Denylist pattern "${denyMatch}" matched, but action type ${action.type} is allowlisted and readOnly=false`,
        ruleId: "DENYLIST_OVERRIDE",
        severity: "warn",
      };
    }
    return {
      allowed: false,
      reason: `Denied: label matches denylist pattern "${denyMatch}"`,
      ruleId: "DENYLIST_LABEL",
      severity: "block",
    };
  }

  // Rule 3: Read-only mode
  if (policy.readOnly) {
    if (READONLY_ALLOWED.has(action.type)) {
      return {
        allowed: true,
        reason: `Allowed in read-only mode: ${action.type}`,
        ruleId: "READONLY_ALLOW",
        severity: "info",
      };
    }
    // Check allowlist override in read-only mode
    if (policy.allowlist.includes(action.type)) {
      return {
        allowed: true,
        reason: `Overridden: ${action.type} is allowlisted (readOnly=true, recorded as OVERRIDE)`,
        ruleId: "READONLY_OVERRIDE",
        severity: "warn",
      };
    }
    return {
      allowed: false,
      reason: `Blocked in read-only mode: ${action.type} is not in the safe set`,
      ruleId: "READONLY_BLOCK",
      severity: "block",
    };
  }

  // Rule 4: Non-read-only — check destructive actions
  if (DESTRUCTIVE_ACTIONS.has(action.type)) {
    if (policy.allowlist.includes(action.type)) {
      return {
        allowed: true,
        reason: `Destructive action ${action.type} allowed via allowlist`,
        ruleId: "DESTRUCTIVE_ALLOWLISTED",
        severity: "warn",
      };
    }
    return {
      allowed: false,
      reason: `Destructive action ${action.type} blocked: not in allowlist`,
      ruleId: "DESTRUCTIVE_BLOCK",
      severity: "block",
    };
  }

  // Rule 5: Default allow
  return {
    allowed: true,
    reason: `Action ${action.type} allowed by default policy`,
    ruleId: "DEFAULT_ALLOW",
    severity: "info",
  };
}
