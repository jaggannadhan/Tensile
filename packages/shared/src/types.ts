export const ACTION_TYPES = [
  "NAVIGATE",
  "CLICK",
  "FILL",
  "SELECT",
  "PRESS_KEY",
  "WAIT",
  "SUBMIT_FORM",
  "DOWNLOAD",
  "UPLOAD",
  "DELETE",
  "UPDATE_SETTINGS",
  "PURCHASE",
  "LOGOUT",
  "OTHER",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export interface SafetyAction {
  type: ActionType;
  label?: string;
  url?: string;
  selector?: string;
  meta?: Record<string, unknown>;
}

export type Severity = "info" | "warn" | "block";

export interface SafetyDecision {
  allowed: boolean;
  reason: string;
  ruleId: string;
  severity: Severity;
}

export interface SafetyEvent {
  timestamp: string;
  runId: string;
  action: SafetyAction;
  decision: SafetyDecision;
}

export interface SafetyPolicy {
  readOnly: boolean;
  denylist: string[];
  allowlist: string[];
  hardBlockPatterns: string[];
}

export type LlmProvider = "openai" | "anthropic" | "none";

export interface JiraConfig {
  enabled: boolean;
  baseUrl?: string;
  project?: string;
  email?: string;
}

export interface LlmConfig {
  provider: LlmProvider;
  model?: string;
}

export type BrowserType = "chromium" | "firefox" | "webkit";

export interface PlaywrightConfig {
  smoke: boolean;
  browser: BrowserType;
  headless: boolean;
  timeoutMs: number;
  trace: boolean;
  video: boolean;
  networkEvents: boolean;
  stepScreenshots: boolean;
}

// --- Module 3: Discovery config ---

export type DiscoveryMode = "fast" | "thorough";

export interface DiscoveryConfig {
  discover: boolean;
  maxDepth: number;
  sameOriginOnly: boolean;
  includeQueryParams: boolean;
  actionLimitPerPage: number;
  discoveryTimeoutMs: number;
  discoveryMode: DiscoveryMode;
  saveScreenshots: boolean;
}

export interface RunConfig {
  runId: string;
  url: string;
  outDir: string;
  env: string;
  readOnly: boolean;
  allowlist: string[];
  denylist: string[];
  maxPages: number;
  uiConcurrency: number;
  rerunFailures: number;
  jira: JiraConfig;
  llm: LlmConfig;
  playwright: PlaywrightConfig;
  discovery: DiscoveryConfig;
  journey: JourneyConfig;
  startedAt: string;
}

// --- Module 2: Result data models ---

export interface NetworkEvent {
  ts: string;
  type: "response" | "requestfailed";
  url: string;
  method?: string;
  status?: number;
  resourceType?: string;
  fromServiceWorker?: boolean;
  failureText?: string;
  timingMs?: number;
}

export type ArtifactKind =
  | "trace"
  | "video"
  | "screenshot"
  | "har"
  | "network_events"
  | "console"
  | "pageerrors"
  | "step_screenshot";

export interface ArtifactRef {
  kind: ArtifactKind;
  path: string; // relative to outDir
}

export type StepStatus = "PASS" | "FAIL" | "SOFT_FAIL" | "SKIP";

export type StepFailureKind =
  | "TIMEOUT"
  | "SELECTOR_NOT_FOUND"
  | "NAVIGATION_ERROR"
  | "ASSERTION_FAILED"
  | "NO_OBSERVABLE_CHANGE"
  | "SAFETY_BLOCKED"
  | "UNKNOWN";

export interface StepResult {
  index: number;
  name: string;
  status: StepStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  error?: { message: string; stack?: string };
  failureKind?: StepFailureKind;
  artifacts?: ArtifactRef[];
  /** Action metadata — embedded at creation time for coverage analysis */
  actionType?: StepAction;
  selector?: { strategy: string; primary: string };
  label?: string;
}

export type JourneyStatus = "PASS" | "FAIL";

export interface VideoStatus {
  enabled: boolean;
  saved: boolean;
  reason?: string;
}

export interface JourneyResult {
  journeyId: string;
  name: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: JourneyStatus;
  steps: StepResult[];
  summary?: { url: string; httpStatus?: number; title?: string };
  artifacts: ArtifactRef[];
  video?: VideoStatus;
  safetyEventsPath?: string;
  warnings?: string[];
}

export interface RunIndexJourney {
  journeyId: string;
  name: string;
  status: JourneyStatus;
  durationMs: number;
  resultPath: string;
}

export interface RunIndex {
  runId: string;
  targetUrl: string;
  envName: string;
  startedAt: string;
  endedAt?: string;
  journeys: RunIndexJourney[];
  notes?: string[];
  discovery?: {
    siteMapPath: string;
    actionsPath: string;
    candidatesPath: string;
    discoveryMdPath: string;
  };
}

// --- Module 3: Discovery result data models ---

export interface PageNode {
  url: string;
  discoveredFrom: string;
  depth: number;
  firstSeenAt: string;
  title?: string;
  httpStatus?: number;
  errorCount: number;
  actionCount: number;
}

export interface ActionTargetElement {
  tagName: string;
  role?: string;
  inputType?: string;
  href?: string;
  isVisible: boolean;
  isDisabled: boolean;
}

export interface ActionTargetRiskFlags {
  looksDestructive: boolean;
  requiresAuth: boolean;
}

export type ActionTargetType = "CLICK" | "FILL" | "SUBMIT_FORM" | "SELECT" | "NAVIGATE";

export interface ActionTarget {
  pageUrl: string;
  actionType: ActionTargetType;
  selector: string;
  selectorCandidates: string[];
  humanLabel: string;
  element: ActionTargetElement;
  riskFlags: ActionTargetRiskFlags;
  confidence: number;
}

export type JourneyPriority = "P0" | "P1" | "P2";

export interface CandidateStep {
  action: "goto" | "click" | "fill" | "assert";
  target?: string;
  value?: string;
  description: string;
}

export interface CandidateJourney {
  id: string;
  name: string;
  priority: JourneyPriority;
  steps: CandidateStep[];
  tags: string[];
  notes: string;
  score?: number;
}

export interface DiscoveryResult {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  pagesDiscovered: number;
  pagesVisited: number;
  maxPages: number;
  maxDepth: number;
  linksFound: number;
  actionsFound: number;
  blockedNavigations: number;
  siteMapPath: string;
  actionsPath: string;
  candidatesPath: string;
  discoveryMdPath: string;
}

// --- Module 4: Journey execution types ---

export type JourneysMode = "topN" | "critical" | "file";

export interface JourneyConfig {
  journeys: string;
  journeysMode: JourneysMode;
  journeysParam: string;
  journeyTimeoutMs: number;
  stepTimeoutMs: number;
  maxStepsPerJourney: number;
  observableChange: boolean;
  clickWaitMs: number;
  assertNetworkActivity: boolean;
}

export type StepAction = "goto" | "click" | "fill" | "waitFor" | "assert";

export type SelectorStrategy = "data-testid" | "id" | "aria" | "role" | "text" | "css" | "url";

export interface SelectorSpec {
  primary: string;
  fallbacks: string[];
  strategy: SelectorStrategy;
}

export interface StepSpec {
  action: StepAction;
  selector?: SelectorSpec;
  url?: string;
  value?: string;
  description: string;
  safetyAction?: SafetyAction;
  safetyDecision?: SafetyDecision;
}

export interface JourneySpec {
  id: string;
  name: string;
  priority: JourneyPriority;
  steps: StepSpec[];
  tags: string[];
  notes: string;
  sourceId: string;
  truncated: boolean;
  safetyPreCheck: "PASS" | "BLOCKED";
  blockReason?: string;
}

export interface ExecutedJourneyRecord {
  spec: JourneySpec;
  resultPath: string;
}

// --- Module 5: Excluded candidate tracking ---

export const EXCLUDED_CANDIDATE_REASONS = [
  "DESTRUCTIVE_LABEL",
  "DISABLED",
  "DUPLICATE_INTENT",
  "LOW_CONFIDENCE_SELECTOR",
  "TIMESTAMP_STATUS",
  "READ_ONLY_BLOCKED",
  "CAP_LIMIT",
  "OTHER",
] as const;

export type ExcludedCandidateReason = (typeof EXCLUDED_CANDIDATE_REASONS)[number];

export interface ExcludedCandidate {
  selector: string;
  humanLabel: string;
  actionType: ActionTargetType;
  reason: ExcludedCandidateReason;
  score?: number;
  pageUrl: string;
}

// --- Module 6: Healer / Modify Flow ---

export interface StepEditPatch {
  stepIndex: number;
  from: { selector?: SelectorSpec; label?: string };
  to: { selector: SelectorSpec; label?: string };
  reason?: string;
  editedAt: string;
  editedBy?: string;
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
  safetySnapshot?: SafetyPolicy;
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
