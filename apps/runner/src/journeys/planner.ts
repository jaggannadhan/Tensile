import type {
  CandidateJourney,
  CandidateStep,
  JourneyConfig,
  JourneySpec,
  StepSpec,
  SafetyPolicy,
  SafetyAction,
  ActionType,
} from "@web-qa-agent/shared";
import { evaluate } from "../safety/policy.js";
import { resolveSelector } from "./selector.js";
import type { PlanResult, PlannerSelection } from "./types.js";

// ── Hard-cap patterns for score adjustment ──────────────────────────────────

const TIMESTAMP_STATUS_CAP_RE =
  /\b(last\s+build|build\s+status|updated|last\s+updated|published|released|version|v\d+(\.\d+)+|\d+\s+(sec(onds?)?|min(utes?)?|hours?|days?|weeks?|months?|years?)\s+ago|yesterday|today|tomorrow|just\s+now|\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i;

const FOOTER_LEGAL_CAP_RE =
  /\b(privacy|terms|cookie|copyright|©|all\s+rights\s+reserved|license)\b/i;

/**
 * Extract the quoted label from a candidate name (e.g. 'Click "Foo"' → "Foo").
 * Falls back to the full name if no quotes found.
 */
function extractLabel(name: string): string {
  const m = name.match(/"([^"]+)"$/);
  return m ? m[1] : name;
}

/**
 * Compute adjusted score with hard caps for timestamp/status and footer/legal content.
 * Even if a candidate has high bonuses, these patterns cap the maximum score.
 */
function computeAdjustedScore(candidate: CandidateJourney): number {
  let score = candidate.score ?? 50;
  const label = extractLabel(candidate.name);

  // Hard cap: timestamp/status → max 40
  if (TIMESTAMP_STATUS_CAP_RE.test(label)) {
    score = Math.min(score, 40);
  }

  // Hard cap: footer/legal → max 35
  if (FOOTER_LEGAL_CAP_RE.test(label)) {
    score = Math.min(score, 35);
  }

  return score;
}

/** Map CandidateStep.action to SafetyAction.type. */
function candidateActionToSafetyType(action: CandidateStep["action"]): ActionType {
  switch (action) {
    case "goto": return "NAVIGATE";
    case "click": return "CLICK";
    case "fill": return "FILL";
    case "assert": return "WAIT";
  }
}

/** Build a SafetyAction from a CandidateStep. */
function buildSafetyAction(step: CandidateStep): SafetyAction {
  return {
    type: candidateActionToSafetyType(step.action),
    label: step.description,
    url: step.action === "goto" ? step.target : undefined,
    selector: step.action !== "goto" ? step.target : undefined,
  };
}

/** Convert a CandidateStep into a StepSpec with resolved selector and safety pre-check. */
function resolveStep(step: CandidateStep, policy: SafetyPolicy): StepSpec {
  const safetyAction = buildSafetyAction(step);
  const safetyDecision = evaluate(policy, safetyAction);

  const stepSpec: StepSpec = {
    action: step.action === "assert" ? "assert"
      : step.action === "goto" ? "goto"
      : step.action === "click" ? "click"
      : "fill",
    description: step.description,
    safetyAction,
    safetyDecision,
  };

  if (step.action === "goto" && step.target) {
    stepSpec.url = step.target;
    stepSpec.selector = resolveSelector(step.target);
  } else if (step.target) {
    stepSpec.selector = resolveSelector(step.target);
  }

  if (step.value !== undefined) {
    stepSpec.value = step.value;
  }

  return stepSpec;
}

/** Select which candidates to run based on mode and params. */
function selectCandidates(
  candidates: CandidateJourney[],
  mode: JourneyConfig["journeysMode"],
  param: string,
): {
  selected: CandidateJourney[];
  skippedBySelection: Array<{ id: string; name: string; reason: string }>;
  selection: PlannerSelection;
} {
  const skippedBySelection: Array<{ id: string; name: string; reason: string }> = [];

  if (mode === "critical") {
    const selected = candidates.filter((c) => c.priority === "P0");
    const skipped = candidates.filter((c) => c.priority !== "P0");
    for (const s of skipped) {
      skippedBySelection.push({ id: s.id, name: s.name, reason: `Priority ${s.priority} excluded by "critical" mode` });
    }
    const selection: PlannerSelection = {
      mode: "critical",
      param,
      totalCandidates: candidates.length,
      selected: selected.map((c) => ({
        id: c.id, name: c.name, priority: c.priority,
        score: c.score ?? 50, adjustedScore: computeAdjustedScore(c),
      })),
      skippedByScore: skipped.map((c) => ({
        id: c.id, name: c.name, priority: c.priority,
        score: c.score ?? 50, adjustedScore: computeAdjustedScore(c),
        reason: `Priority ${c.priority} excluded by "critical" mode`,
      })),
    };
    return { selected, skippedBySelection, selection };
  }

  if (mode === "topN") {
    const n = Math.max(0, Number.parseInt(param, 10) || 3);
    const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

    // Score every candidate with adjusted score (hard caps applied)
    const scored = candidates.map((c) => ({
      candidate: c,
      rawScore: c.score ?? 50,
      adjustedScore: computeAdjustedScore(c),
    }));

    // Sort: adjustedScore desc → priority asc → raw score desc
    scored.sort((a, b) => {
      if (a.adjustedScore !== b.adjustedScore) return b.adjustedScore - a.adjustedScore;
      const pa = priorityOrder[a.candidate.priority] ?? 3;
      const pb = priorityOrder[b.candidate.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      return b.rawScore - a.rawScore;
    });

    // Split preferred (adjustedScore >= 50) vs fallback (< 50)
    const preferred = scored.filter((x) => x.adjustedScore >= 50);
    const fallback = scored.filter((x) => x.adjustedScore < 50);

    // Fill from preferred first, then fallback only if needed
    const pool = [...preferred, ...fallback];
    const selected = pool.slice(0, n).map((x) => x.candidate);
    const skipped = pool.slice(n);

    for (const x of skipped) {
      skippedBySelection.push({
        id: x.candidate.id,
        name: x.candidate.name,
        reason: `Excluded by topN:${n} (adjustedScore=${x.adjustedScore})`,
      });
    }

    const selection: PlannerSelection = {
      mode: "topN",
      param,
      totalCandidates: candidates.length,
      selected: pool.slice(0, n).map((x) => ({
        id: x.candidate.id, name: x.candidate.name, priority: x.candidate.priority,
        score: x.rawScore, adjustedScore: x.adjustedScore,
      })),
      skippedByScore: skipped.map((x) => ({
        id: x.candidate.id, name: x.candidate.name, priority: x.candidate.priority,
        score: x.rawScore, adjustedScore: x.adjustedScore,
        reason: `Excluded by topN:${n} (adjustedScore=${x.adjustedScore})`,
      })),
    };

    return { selected, skippedBySelection, selection };
  }

  // mode === "file": use all candidates
  const selection: PlannerSelection = {
    mode: "file",
    param,
    totalCandidates: candidates.length,
    selected: candidates.map((c) => ({
      id: c.id, name: c.name, priority: c.priority,
      score: c.score ?? 50, adjustedScore: computeAdjustedScore(c),
    })),
    skippedByScore: [],
  };
  return { selected: candidates, skippedBySelection, selection };
}

/**
 * Plan journey execution: select candidates, resolve steps, apply limits, pre-check safety.
 */
export function planJourneys(
  candidates: CandidateJourney[],
  config: JourneyConfig,
  policy: SafetyPolicy,
): PlanResult {
  const { selected, skippedBySelection, selection } = selectCandidates(
    candidates,
    config.journeysMode,
    config.journeysParam,
  );

  const specs: JourneySpec[] = [];
  const skipped = [...skippedBySelection];

  for (const candidate of selected) {
    let steps = candidate.steps.map((s) => resolveStep(s, policy));

    // Truncate to maxStepsPerJourney
    const truncated = steps.length > config.maxStepsPerJourney;
    if (truncated) {
      steps = steps.slice(0, config.maxStepsPerJourney);
    }

    // Safety pre-check: if the first goto step is blocked, skip the journey
    const firstGoto = steps.find((s) => s.action === "goto");
    let safetyPreCheck: "PASS" | "BLOCKED" = "PASS";
    let blockReason: string | undefined;

    if (firstGoto?.safetyDecision && !firstGoto.safetyDecision.allowed) {
      safetyPreCheck = "BLOCKED";
      blockReason = `Navigation blocked: ${firstGoto.safetyDecision.reason}`;
    }

    specs.push({
      id: candidate.id,
      name: candidate.name,
      priority: candidate.priority,
      steps,
      tags: candidate.tags,
      notes: candidate.notes,
      sourceId: candidate.id,
      truncated,
      safetyPreCheck,
      blockReason,
    });
  }

  return { specs, skipped, selection };
}
