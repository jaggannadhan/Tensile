import type {
  PageNode,
  ActionTarget,
  CandidateJourney,
  ExcludedCandidate,
} from "@web-qa-agent/shared";
import { normalizeUrl } from "./normalize.js";

const MAX_SPA_CANDIDATES = 10;
const MAX_TOTAL_CANDIDATES = 25;

// ── Penalty/bonus regex patterns ──────────────────────────────────────────

const TIMESTAMP_STATUS_RE =
  /\b(last\s+build|build\s+status|updated|last\s+updated|published|released|version|v\d+(\.\d+)+)\b/i;

const RELATIVE_TIME_RE =
  /\b(\d+\s+(sec(onds?)?|min(utes?)?|hours?|days?|weeks?|months?|years?)\s+ago)\b/i;

const TEMPORAL_RE = /\b(yesterday|today|tomorrow|just\s+now)\b/i;

const TIME_PATTERN_RE = /\b\d{1,2}:\d{2}\b/;
const DATE_ISO_RE = /\b\d{4}-\d{2}-\d{2}\b/;
const DATE_SLASH_RE = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;

const FOOTER_LEGAL_RE =
  /\b(privacy|terms|cookie|copyright|©|all\s+rights\s+reserved|license)\b/i;

const SOCIAL_SHARE_RE =
  /\b(twitter|x\.com|facebook|linkedin|share)\b/i;

const MENU_TOGGLE_RE = /^(menu|close|open|toggle|hamburger|nav)\b/i;

const PRIMARY_UI_ROLES = new Set(["button", "tab", "menuitem", "link"]);
const PRIMARY_UI_TAGS = new Set(["button", "a"]);

// ── Scoring ───────────────────────────────────────────────────────────────

export interface ScoredCandidate {
  action: ActionTarget;
  score: number;
  flags: string[];
}

/**
 * Score an ActionTarget for SPA candidate quality.
 * Higher = more likely to be a meaningful, testable UI target.
 * Returns score (0-based, typically 40-130) and flag strings for diagnostics.
 */
function scoreSpaCandidate(target: ActionTarget): { score: number; flags: string[] } {
  const label = target.humanLabel;
  const el = target.element;
  const flags: string[] = [];

  // Base: confidence mapped to 0-100
  let score = target.confidence * 100;

  // ── Bonuses ──

  // Selector quality: role+name strategy (aria-label selector)
  if (target.selector.startsWith("[aria-label=")) {
    score += 20;
    flags.push("+role_name");
  }

  // data-testid / data-test / data-cy present
  if (target.selector.startsWith("[data-testid=") || target.selector.startsWith("[data-test=") || target.selector.startsWith("[data-cy=")) {
    score += 18;
    flags.push("+testid");
  } else if (target.selector.startsWith("#")) {
    score += 12;
    flags.push("+id");
  }

  // href present (for NAVIGATE / link)
  if (el.href) {
    score += 10;
    flags.push("+href");
  }

  // Label length sweet spot (4-28 chars)
  if (label.length >= 4 && label.length <= 28) {
    score += 10;
    flags.push("+label_len");
  }

  // Title case words (at least 1 capitalized token that isn't ALL CAPS)
  const tokens = label.split(/\s+/);
  const hasTitleCase = tokens.some((t) => t.length > 1 && /^[A-Z][a-z]/.test(t));
  if (hasTitleCase) {
    score += 8;
    flags.push("+title_case");
  }

  // Visible element
  if (el.isVisible) {
    score += 5;
    flags.push("+visible");
  }

  // Primary UI element (button, a, role=tab, role=menuitem)
  if (PRIMARY_UI_TAGS.has(el.tagName) || (el.role && PRIMARY_UI_ROLES.has(el.role))) {
    score += 4;
    flags.push("+primary_ui");
  }

  // ── Penalties ──

  // Timestamp / status / version
  if (TIMESTAMP_STATUS_RE.test(label)) {
    score -= 30;
    flags.push("-timestamp_status");
  }

  // Relative time tokens ("3 days ago")
  if (RELATIVE_TIME_RE.test(label)) {
    score -= 18;
    flags.push("-relative_time");
  }

  // Temporal words
  if (TEMPORAL_RE.test(label)) {
    score -= 18;
    flags.push("-temporal");
  }

  // Time patterns (e.g., "14:30")
  if (TIME_PATTERN_RE.test(label)) {
    score -= 18;
    flags.push("-time_pattern");
  }

  // Date patterns
  if (DATE_ISO_RE.test(label) || DATE_SLASH_RE.test(label)) {
    score -= 18;
    flags.push("-date_pattern");
  }

  // Mostly numeric (>50% digits)
  const digitCount = (label.match(/\d/g) ?? []).length;
  if (label.length > 0 && digitCount / label.length > 0.5) {
    score -= 18;
    flags.push("-mostly_numeric");
  }

  // Footer / legal boilerplate
  if (FOOTER_LEGAL_RE.test(label)) {
    score -= 16;
    flags.push("-footer_legal");
  }

  // Menu / toggle with low intent
  if (MENU_TOGGLE_RE.test(label)) {
    score -= 12;
    flags.push("-menu_toggle");
  }

  // Social / share (mild)
  if (SOCIAL_SHARE_RE.test(label)) {
    score -= 10;
    flags.push("-social_share");
  }

  // Very long label (>60 chars)
  if (label.length > 60) {
    score -= 10;
    flags.push("-long_label");
  }

  // Very short label (<3 chars)
  if (label.length < 3) {
    score -= 8;
    flags.push("-short_label");
  }

  return { score, flags };
}

/**
 * Score a non-SPA candidate (nav link, etc.) for ranking.
 * Simpler than SPA scoring — starts at 50, applies label-based bonuses and penalties.
 */
function scoreNonSpaCandidate(label: string, link?: ActionTarget): number {
  let score = 50;

  // Selector quality bonuses
  if (link) {
    if (link.element.href) score += 10;
    if (
      link.selector.startsWith("[data-testid=") ||
      link.selector.startsWith("[data-test=") ||
      link.selector.startsWith("[data-cy=") ||
      link.selector.startsWith("#")
    ) {
      score += 10;
    }
  }

  // Label length sweet spot
  if (label.length >= 4 && label.length <= 28) score += 10;

  // Apply timestamp/status penalties (same patterns as SPA scoring)
  if (TIMESTAMP_STATUS_RE.test(label)) score -= 30;
  if (RELATIVE_TIME_RE.test(label)) score -= 18;
  if (TEMPORAL_RE.test(label)) score -= 18;
  if (TIME_PATTERN_RE.test(label)) score -= 18;
  if (DATE_ISO_RE.test(label) || DATE_SLASH_RE.test(label)) score -= 18;
  if (FOOTER_LEGAL_RE.test(label)) score -= 16;

  return score;
}

/**
 * Check if a target should be hard-excluded from SPA candidates.
 */
function shouldExclude(target: ActionTarget): boolean {
  const label = target.humanLabel;

  // Empty label with no identifying attributes
  if (
    label.length === 0 &&
    !target.selector.startsWith("[aria-label=") &&
    !target.selector.startsWith("[data-testid=") &&
    !target.selector.startsWith("[data-test=") &&
    !target.selector.startsWith("[data-cy=") &&
    !target.selector.startsWith("#")
  ) {
    return true;
  }

  return false;
}

/**
 * Check if an href is suitable for direct goto navigation.
 * Returns false for fragment-only, javascript:, and empty hrefs.
 */
function isGotoableHref(href: string | undefined): boolean {
  if (!href) return false;
  if (href === "#" || href.startsWith("#")) return false;
  if (href.startsWith("javascript:")) return false;
  if (href.length === 0) return false;
  return true;
}

// ── Diagnostics ───────────────────────────────────────────────────────────

export interface CandidateDiagnostics {
  pagesVisited: number;
  linksFound: number;
  actionsTotal: number;
  actionsOnRoot: number;
  rootUrlUsed: string;
  actionsMapKeys: string[];
  navLinkCandidates: number;
  spaModeTriggered: boolean;
  spaTriggerReason: string;
  spaEligible: {
    totalOnRoot: number;
    typeEligible: number;
    excludedDestructive: number;
    excludedDisabled: number;
    excludedDuplicate: number;
    excludedEmpty: number;
    finalSpaCandidates: number;
  };
  topCandidateLabels: string[];
  topScoredCandidates: ScoredCandidate[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Tolerant URL lookup for actions — tries exact match first,
 * then the opposite trailing-slash variant.
 */
function getActionsForPage(actions: ActionTarget[], pageUrl: string): ActionTarget[] {
  const exact = actions.filter((a) => a.pageUrl === pageUrl);
  if (exact.length > 0) return exact;

  const alt = pageUrl.endsWith("/")
    ? pageUrl.slice(0, -1)
    : pageUrl + "/";
  return actions.filter((a) => a.pageUrl === alt);
}

// ── Main ──────────────────────────────────────────────────────────────────

/**
 * Generate candidate journeys from discovered pages and action targets.
 * Pure function — no browser access needed.
 * Returns candidates and diagnostics for reporting.
 */
export function generateCandidates(
  pages: PageNode[],
  actions: ActionTarget[],
  startUrl: string,
): { candidates: CandidateJourney[]; excluded: ExcludedCandidate[]; diagnostics: CandidateDiagnostics } {
  const journeys: CandidateJourney[] = [];
  let idCounter = 0;
  const nextId = () => `candidate-${++idCounter}`;

  // Canonicalize startUrl to match how crawler.ts normalizes pageUrl on ActionTargets
  const canonicalRoot = normalizeUrl(startUrl, false) || startUrl;

  // Tolerant lookup: try canonical first, fallback to trailing-slash variant
  const homeActions = getActionsForPage(actions, canonicalRoot);

  // Collect unique pageUrl keys for diagnostics
  const actionPageUrls = [...new Set(actions.map((a) => a.pageUrl))];

  // P0: Home → top nav links (up to 5)
  const navLinks = homeActions
    .filter(
      (a) =>
        (a.actionType === "NAVIGATE" || a.actionType === "CLICK") &&
        a.element.tagName === "a" &&
        a.element.isVisible &&
        !a.element.isDisabled,
    )
    .slice(0, 5);

  for (const link of navLinks) {
    journeys.push({
      id: nextId(),
      name: `Navigate to "${truncate(link.humanLabel, 40)}"`,
      priority: "P0",
      score: scoreNonSpaCandidate(link.humanLabel, link),
      steps: [
        { action: "goto", target: startUrl, description: "Go to home page" },
        {
          action: "click",
          target: link.selector,
          description: `Click "${truncate(link.humanLabel, 40)}"`,
        },
        { action: "assert", description: "Page loaded successfully" },
      ],
      tags: ["navigation", "smoke"],
      notes: "Auto-generated: top nav link from home page",
    });
  }

  // P1: Home → search (if search input exists)
  const searchInput = homeActions.find(
    (a) =>
      a.actionType === "FILL" &&
      (a.humanLabel.toLowerCase().includes("search") ||
        a.element.inputType === "search" ||
        a.element.role === "searchbox"),
  );

  if (searchInput) {
    journeys.push({
      id: nextId(),
      name: "Search from home page",
      priority: "P1",
      score: 60,
      steps: [
        { action: "goto", target: startUrl, description: "Go to home page" },
        {
          action: "fill",
          target: searchInput.selector,
          value: "test",
          description: "Enter search term",
        },
        { action: "assert", description: "Search results displayed" },
      ],
      tags: ["search", "functional"],
      notes: "Auto-generated: search functionality detected on home page",
    });
  }

  // P1: Home → login (if sign-in link exists)
  const loginLink = homeActions.find(
    (a) =>
      a.riskFlags.requiresAuth ||
      /sign.?in|log.?in|login/i.test(a.humanLabel),
  );

  if (loginLink) {
    journeys.push({
      id: nextId(),
      name: "Navigate to sign-in",
      priority: "P1",
      score: 55,
      steps: [
        { action: "goto", target: startUrl, description: "Go to home page" },
        {
          action: "click",
          target: loginLink.selector,
          description: `Click "${truncate(loginLink.humanLabel, 40)}"`,
        },
        { action: "assert", description: "Sign-in page displayed" },
      ],
      tags: ["auth", "navigation"],
      notes: "Auto-generated: sign-in link detected on home page",
    });
  }

  // P2: Pages with forms (noted as blocked in read-only)
  const formActions = actions.filter((a) => a.actionType === "SUBMIT_FORM");
  const seenFormPages = new Set<string>();

  for (const formAction of formActions) {
    if (seenFormPages.has(formAction.pageUrl)) continue;
    seenFormPages.add(formAction.pageUrl);

    journeys.push({
      id: nextId(),
      name: `Form on "${truncate(formAction.humanLabel, 40)}"`,
      priority: "P2",
      score: 30,
      steps: [
        {
          action: "goto",
          target: formAction.pageUrl,
          description: "Navigate to form page",
        },
        { action: "assert", target: formAction.selector, description: "Form is visible" },
      ],
      tags: ["form", "write-action"],
      notes:
        "Auto-generated: form detected. Blocked in read-only mode — requires allowlist override.",
    });
  }

  // SPA fallback: generate in-page click candidates when multi-page candidates are insufficient
  const navCandidateCount = navLinks.length;
  const pagesVisited = pages.length;

  let spaTriggerReason = "";
  const needsSpaFallback =
    pagesVisited <= 1 ||
    (pagesVisited <= 2 && navCandidateCount === 0);

  if (needsSpaFallback) {
    if (pagesVisited <= 1) {
      spaTriggerReason = `pagesVisited=${pagesVisited} (<=1)`;
    } else {
      spaTriggerReason = `pagesVisited=${pagesVisited} (<=2) AND navLinkCandidates=0`;
    }
  }

  // Initialize SPA diagnostic counters
  const spaEligible: CandidateDiagnostics["spaEligible"] = {
    totalOnRoot: homeActions.length,
    typeEligible: 0,
    excludedDestructive: 0,
    excludedDisabled: 0,
    excludedDuplicate: 0,
    excludedEmpty: 0,
    finalSpaCandidates: 0,
  };

  let topScoredCandidates: ScoredCandidate[] = [];
  const excluded: ExcludedCandidate[] = [];

  if (needsSpaFallback) {
    // Collect selectors already used in existing candidates to avoid duplicates
    const usedSelectors = new Set<string>();
    for (const j of journeys) {
      for (const s of j.steps) {
        if (s.action === "click" && s.target) usedSelectors.add(s.target);
      }
    }

    const spaResult = generateSpaCandidates(
      homeActions,
      startUrl,
      usedSelectors,
    );
    Object.assign(spaEligible, spaResult.eligible);
    topScoredCandidates = spaResult.scoredForDiagnostics;
    excluded.push(...spaResult.excluded);

    let spaCounter = 0;
    for (const spa of spaResult.candidates) {
      spaCounter++;
      journeys.push({
        ...spa,
        id: `candidate-spa-${spaCounter}`,
      });
    }
  }

  // Cap total candidates, prioritizing P0 > P1 > P2
  if (journeys.length > MAX_TOTAL_CANDIDATES) {
    const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
    journeys.sort(
      (a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3),
    );
    const capped = journeys.splice(MAX_TOTAL_CANDIDATES);
    for (const c of capped) {
      const selector = c.steps.find((s) => s.action === "click")?.target ?? "";
      excluded.push({ selector, humanLabel: c.name, actionType: "CLICK", reason: "CAP_LIMIT", score: c.score, pageUrl: c.steps[0]?.target ?? startUrl });
    }
  }

  // Build diagnostics
  const topCandidateLabels = journeys
    .slice(0, 10)
    .map((j) => j.name.replace(/^(Click|Navigate to|Go to) "/, "").replace(/"$/, ""));

  const diagnostics: CandidateDiagnostics = {
    pagesVisited,
    linksFound: actions.filter((a) => a.actionType === "NAVIGATE").length,
    actionsTotal: actions.length,
    actionsOnRoot: homeActions.length,
    rootUrlUsed: canonicalRoot,
    actionsMapKeys: actionPageUrls.slice(0, 3),
    navLinkCandidates: navCandidateCount,
    spaModeTriggered: needsSpaFallback,
    spaTriggerReason: needsSpaFallback ? spaTriggerReason : "not triggered",
    spaEligible,
    topCandidateLabels,
    topScoredCandidates,
  };

  return { candidates: journeys, excluded, diagnostics };
}

// ── SPA candidate generation ──────────────────────────────────────────────

/**
 * Generate SPA-specific candidates from in-page click targets.
 * Uses comprehensive scoring to prioritize meaningful UI targets
 * and deprioritize timestamps, status text, and boilerplate.
 */
function generateSpaCandidates(
  homeActions: ActionTarget[],
  startUrl: string,
  usedSelectors: Set<string>,
): {
  candidates: CandidateJourney[];
  excluded: ExcludedCandidate[];
  eligible: CandidateDiagnostics["spaEligible"];
  scoredForDiagnostics: ScoredCandidate[];
} {
  const eligible: CandidateDiagnostics["spaEligible"] = {
    totalOnRoot: homeActions.length,
    typeEligible: 0,
    excludedDestructive: 0,
    excludedDisabled: 0,
    excludedDuplicate: 0,
    excludedEmpty: 0,
    finalSpaCandidates: 0,
  };

  const excluded: ExcludedCandidate[] = [];

  // Step 1: Filter to CLICK/NAVIGATE action types
  const typeFiltered = homeActions.filter(
    (a) => a.actionType === "CLICK" || a.actionType === "NAVIGATE",
  );
  eligible.typeEligible = typeFiltered.length;

  // Step 2: Exclude destructive, disabled, duplicate, empty — track each category
  const clickable: ActionTarget[] = [];
  for (const a of typeFiltered) {
    if (a.riskFlags.looksDestructive) {
      eligible.excludedDestructive++;
      excluded.push({ selector: a.selector, humanLabel: a.humanLabel, actionType: a.actionType, reason: "DESTRUCTIVE_LABEL", pageUrl: a.pageUrl });
      continue;
    }
    if (a.element.isDisabled) {
      eligible.excludedDisabled++;
      excluded.push({ selector: a.selector, humanLabel: a.humanLabel, actionType: a.actionType, reason: "DISABLED", pageUrl: a.pageUrl });
      continue;
    }
    if (usedSelectors.has(a.selector)) {
      eligible.excludedDuplicate++;
      excluded.push({ selector: a.selector, humanLabel: a.humanLabel, actionType: a.actionType, reason: "DUPLICATE_INTENT", pageUrl: a.pageUrl });
      continue;
    }
    if (shouldExclude(a)) {
      eligible.excludedEmpty++;
      excluded.push({ selector: a.selector, humanLabel: a.humanLabel, actionType: a.actionType, reason: "LOW_CONFIDENCE_SELECTOR", pageUrl: a.pageUrl });
      continue;
    }
    clickable.push(a);
  }

  // Step 3: Score all eligible targets
  const scored: ScoredCandidate[] = clickable.map((a) => {
    const { score, flags } = scoreSpaCandidate(a);
    return { action: a, score, flags };
  });

  scored.sort((a, b) => b.score - a.score);

  // Keep top 10 for diagnostics (before selection)
  const scoredForDiagnostics = scored.slice(0, 10);

  // Step 4: Take top N
  const top = scored.slice(0, MAX_SPA_CANDIDATES);
  eligible.finalSpaCandidates = top.length;

  // Track candidates that didn't make the cut due to scoring
  for (const s of scored.slice(MAX_SPA_CANDIDATES)) {
    const reason = s.flags.some((f) => f === "-timestamp_status" || f === "-relative_time" || f === "-temporal" || f === "-time_pattern" || f === "-date_pattern")
      ? "TIMESTAMP_STATUS" as const
      : "OTHER" as const;
    excluded.push({ selector: s.action.selector, humanLabel: s.action.humanLabel, actionType: s.action.actionType, reason, score: Math.round(s.score), pageUrl: s.action.pageUrl });
  }

  // Step 5: Generate candidate journeys with appropriate step type
  const candidates = top.map(({ action, score, flags }) => {
    const label = truncate(action.humanLabel, 40);
    const useGoto =
      action.actionType === "NAVIGATE" &&
      isGotoableHref(action.element.href);

    const interactionStep = useGoto
      ? {
          action: "goto" as const,
          target: action.element.href!,
          description: `Go to "${label}"`,
        }
      : {
          action: "click" as const,
          target: action.selector,
          description: `Click "${label}"`,
        };

    const journeyName = useGoto
      ? `Go to "${label}"`
      : `Click "${label}"`;

    const topFlags = flags.slice(0, 3).join(", ");

    return {
      id: "", // will be overwritten by caller
      name: journeyName,
      priority: score >= 85 ? "P0" as const : "P1" as const,
      score: Math.round(score),
      steps: [
        { action: "goto" as const, target: startUrl, description: "Go to app" },
        interactionStep,
        { action: "assert" as const, description: "Page responded to interaction" },
      ],
      tags: ["discovered", "spa", useGoto ? "navigate" : "click"],
      notes: `Auto-generated: score=${Math.round(score)}${topFlags ? `, flags: ${topFlags}` : ""}`,
    };
  });

  return { candidates, excluded, eligible, scoredForDiagnostics };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
