export interface StageStats {
  smoke?: { status: "pass" | "fail" | "skip"; durationMs?: number };
  discovery?: { status: "pass" | "fail" | "skip"; pages?: number; actions?: number; candidates?: number };
  journeys?: { status: "pass" | "fail" | "skip"; executed: number; passed: number; failed: number; skipped: number; warned: number };
}

export interface RunSummary {
  runId: string;
  targetUrl: string;
  status: "running" | "passed" | "failed" | "stopped" | "error";
  startedAt: string;
  endedAt?: string;
  indexReady: boolean;
  options: RunOptions;
  repos?: Array<{ owner: string; repo: string; role: string; url: string }>;
  stages?: StageStats;
  projectSlug?: string;
}

export interface Project {
  slug: string;
  targetUrl: string;
  runCount: number;
  lastRunAt: string;
}

export interface RunOptions {
  smoke?: boolean;
  discover?: boolean;
  journeys?: string;
  headless?: boolean;
  maxPages?: number;
  maxDepth?: number;
}

export interface RunDetail extends RunSummary {
  exitCode?: number;
  runIndex?: RunIndex;
  repoMeta?: RepoMetaFile;
  stages?: StageStats;
}

export interface RunIndex {
  runId: string;
  targetUrl: string;
  envName: string;
  startedAt: string;
  endedAt?: string;
  journeys: RunIndexJourney[];
  discovery?: {
    siteMapPath: string;
    actionsPath: string;
    candidatesPath: string;
    discoveryMdPath: string;
  };
}

export interface RunIndexJourney {
  journeyId: string;
  name: string;
  status: "PASS" | "FAIL";
  durationMs: number;
  resultPath: string;
}

export interface JourneyResult {
  journeyId: string;
  name: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "PASS" | "FAIL";
  steps: StepResult[];
  summary?: { url: string; httpStatus?: number; title?: string };
  artifacts: ArtifactRef[];
  video?: { enabled: boolean; saved: boolean; reason?: string };
  safetyEventsPath?: string;
  warnings?: string[];
}

export interface StepResult {
  index: number;
  name: string;
  status: "PASS" | "FAIL" | "SOFT_FAIL" | "SKIP";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  error?: { message: string; stack?: string };
  failureKind?: string;
  artifacts?: ArtifactRef[];
  actionType?: "goto" | "click" | "fill" | "waitFor" | "assert";
  selector?: { strategy: string; primary: string };
  label?: string;
}

export interface ArtifactRef {
  kind: string;
  path: string;
}

export type SSEEvent =
  | { type: "line"; text: string }
  | { type: "status"; status: string; exitCode?: number }
  | { type: "indexReady" }
  | { type: "repoMetaReady" }
  | { type: "ownershipReady" }
  | { type: "stagesReady" }
  | { type: "issuesReady" };

// --- GitHub integration types ---

export interface DetectedStack {
  frameworks: string[];
  runtimes: string[];
  languages: string[];
}

export interface KeyFile {
  path: string;
  kind: string;
}

export interface RepoMeta {
  owner: string;
  repo: string;
  role: string;
  url: string;
  description: string | null;
  defaultBranch: string;
  latestSha: string;
  latestCommitDate: string;
  latestCommitMessage: string;
  language: string | null;
  topics: string[];
  stack: DetectedStack;
  keyFiles: KeyFile[];
  fetchedAt: string;
}

export interface RepoMetaFile {
  repos: RepoMeta[];
  fetchedAt: string;
}

export interface OwnershipHint {
  journeyId: string;
  journeyName: string;
  failedUrl?: string;
  httpMethod?: string;
  httpStatus?: number;
  likelyRepo: string;
  reason: string;
  relatedFiles: string[];
  confidence: "high" | "medium" | "low";
}

export interface OwnershipHintsFile {
  hints: OwnershipHint[];
  computedAt: string;
}

// --- Triage types ---

export interface Occurrence {
  journeyId: string;
  journeyName: string;
  stepIndex: number;
  stepName: string;
  status: "FAIL" | "SOFT_FAIL";
  errorMessage: string;
  failureKind?: string;
  url?: string;
  httpStatus?: number;
  artifacts: ArtifactRef[];
}

export interface Issue {
  issueId: string;
  signature: string;
  severity: "S0" | "S1" | "S2" | "S3";
  title: string;
  occurrences: Occurrence[];
  count: number;
  firstSeen: string;
  evidenceLinks: ArtifactRef[];
  ownershipHint?: {
    likelyRepo: string;
    confidence: string;
    reason: string;
  };
}

export interface IssuesFile {
  issues: Issue[];
  totalOccurrences: number;
  totalIssues: number;
  computedAt: string;
}

// --- Layout state types ---

export type SelectedEntity =
  | { type: "journey"; journeyId: string; resultPath: string }
  | { type: "issue"; issueId: string };

export type MainTab = "journeys" | "issues";
export type InspectorTab = "details" | "console" | "coverage" | "artifacts" | "planner";

export interface PlannerCandidate {
  id: string;
  name: string;
  priority: string;
  score: number;
  adjustedScore: number;
}

export interface PlannerSkippedCandidate extends PlannerCandidate {
  reason: string;
}

export interface PlannerSelection {
  mode: string;
  param: string;
  totalCandidates: number;
  selected: PlannerCandidate[];
  skippedByScore: PlannerSkippedCandidate[];
}

// --- Excluded candidate types ---

export type ExcludedCandidateReason =
  | "DESTRUCTIVE_LABEL"
  | "DISABLED"
  | "DUPLICATE_INTENT"
  | "LOW_CONFIDENCE_SELECTOR"
  | "TIMESTAMP_STATUS"
  | "READ_ONLY_BLOCKED"
  | "CAP_LIMIT"
  | "OTHER";

export interface ExcludedCandidate {
  selector: string;
  humanLabel: string;
  actionType: string;
  reason: ExcludedCandidateReason;
  score?: number;
  pageUrl: string;
}

// --- Healer / Modify Flow types ---

export interface SelectorSpec {
  primary: string;
  fallbacks: string[];
  strategy: string;
}

export interface StepSpec {
  action: string;
  selector?: SelectorSpec;
  url?: string;
  value?: string;
  description: string;
}

export interface JourneySpec {
  id: string;
  name: string;
  priority: string;
  steps: StepSpec[];
  tags: string[];
  notes: string;
  sourceId: string;
  truncated: boolean;
  safetyPreCheck: string;
  blockReason?: string;
}

export interface ExecutedJourneyRecord {
  spec: JourneySpec;
  resultPath: string;
}

export interface StepEditPatch {
  stepIndex: number;
  from: { selector?: SelectorSpec; label?: string };
  to: { selector: SelectorSpec; label?: string };
  reason?: string;
  editedAt: string;
  editedBy?: string;
}

export interface PinnedTestSummary {
  testId: string;
  name: string;
  createdAt: string;
  baseRunId: string;
  baseJourneyId: string;
  patchCount: number;
  tags: string[];
}

export interface PinnedTest {
  testId: string;
  projectSlug: string;
  name: string;
  createdAt: string;
  baseRunId: string;
  baseJourneyId: string;
  journeySpec: JourneySpec;
  patches: StepEditPatch[];
  tags: string[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActionTarget {
  pageUrl: string;
  actionType: string;
  selector: string;
  selectorCandidates: string[];
  humanLabel: string;
  element: {
    tagName: string;
    role?: string;
    inputType?: string;
    href?: string;
    isVisible: boolean;
    isDisabled: boolean;
  };
  riskFlags: {
    looksDestructive: boolean;
    requiresAuth: boolean;
  };
  confidence: number;
  bbox?: BoundingBox;
}

export interface ScoreBreakdownEntry {
  key: string;
  delta: number;
  note: string;
}

export interface TargetSuggestion extends ActionTarget {
  score: number;
  reasons: string[];
  breakdown: ScoreBreakdownEntry[];
}

export interface OverlayItem {
  id: string;
  bbox: BoundingBox | null;
  found: boolean;
}

export interface OverlayData {
  screenshotUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  items: OverlayItem[];
}

// --- Coverage types ---

export interface CoverageResponse {
  runId: string;
  targetUrl: string;
  stages: { smoke: boolean; discovery: boolean; journeys: boolean };
  counts: {
    pagesVisited: number;
    actionsDiscovered: number;
    suggestedTests: number;
    executedTests: number;
    clicksPerformed: number;
  };
  pagesVisited: Array<{ url: string; depth: number; title?: string }>;
  actionsByType: Record<string, number>;
  suggestedTests: Array<{ id: string; name: string; priority?: string; score?: number; tags?: string[] }>;
  executedTests: Array<{ journeyId: string; name: string; status: string; durationMs?: number }>;
  clicksPerformed: Array<{
    journeyId: string;
    journeyName: string;
    stepIndex: number;
    label: string;
    selector: { strategy: string; query: string } | null;
    status: string;
    pageUrl?: string;
  }>;
  coverageByPage: Array<{
    pageUrl: string;
    journeys: Array<{ journeyId: string; journeyName: string }>;
    clickLabels: string[];
  }>;
  explain: { suggested: string; executed: string };
}
