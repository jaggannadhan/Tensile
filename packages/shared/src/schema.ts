import { z } from "zod";
import { ACTION_TYPES } from "./types.js";

export const SafetyActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  label: z.string().optional(),
  url: z.string().optional(),
  selector: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});

export const SafetyDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  ruleId: z.string(),
  severity: z.enum(["info", "warn", "block"]),
});

export const SafetyEventSchema = z.object({
  timestamp: z.string(),
  runId: z.string(),
  action: SafetyActionSchema,
  decision: SafetyDecisionSchema,
});

export const SafetyPolicySchema = z.object({
  readOnly: z.boolean(),
  denylist: z.array(z.string()),
  allowlist: z.array(z.string()),
  hardBlockPatterns: z.array(z.string()),
});

export const JiraConfigSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().url().optional(),
  project: z.string().optional(),
  email: z.string().email().optional(),
});

export const LlmConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "none"]),
  model: z.string().optional(),
});

export const PlaywrightConfigSchema = z.object({
  smoke: z.boolean(),
  browser: z.enum(["chromium", "firefox", "webkit"]),
  headless: z.boolean(),
  timeoutMs: z.number().int().positive(),
  trace: z.boolean(),
  video: z.boolean(),
  networkEvents: z.boolean(),
  stepScreenshots: z.boolean(),
});

export const DiscoveryConfigSchema = z.object({
  discover: z.boolean(),
  maxDepth: z.number().int().nonnegative(),
  sameOriginOnly: z.boolean(),
  includeQueryParams: z.boolean(),
  actionLimitPerPage: z.number().int().positive(),
  discoveryTimeoutMs: z.number().int().positive(),
  discoveryMode: z.enum(["fast", "thorough"]),
  saveScreenshots: z.boolean(),
});

export const RunConfigSchema = z.object({
  runId: z.string().uuid(),
  url: z.string().url("url must be a valid URL"),
  outDir: z.string().min(1, "outDir is required"),
  env: z.string().min(1),
  readOnly: z.boolean(),
  allowlist: z.array(z.string()),
  denylist: z.array(z.string()),
  maxPages: z.number().int().positive(),
  uiConcurrency: z.number().int().positive(),
  rerunFailures: z.number().int().nonnegative(),
  jira: JiraConfigSchema,
  llm: LlmConfigSchema,
  playwright: PlaywrightConfigSchema,
  discovery: DiscoveryConfigSchema,
  journey: z.lazy(() => JourneyConfigSchema),
  startedAt: z.string().datetime(),
});

// --- Module 2: Result schemas ---

export const NetworkEventSchema = z.object({
  ts: z.string(),
  type: z.enum(["response", "requestfailed"]),
  url: z.string(),
  method: z.string().optional(),
  status: z.number().int().optional(),
  resourceType: z.string().optional(),
  fromServiceWorker: z.boolean().optional(),
  failureText: z.string().optional(),
  timingMs: z.number().optional(),
});

export const ArtifactRefSchema = z.object({
  kind: z.enum([
    "trace",
    "video",
    "screenshot",
    "har",
    "network_events",
    "console",
    "pageerrors",
    "step_screenshot",
  ]),
  path: z.string(),
});

export const VideoStatusSchema = z.object({
  enabled: z.boolean(),
  saved: z.boolean(),
  reason: z.string().optional(),
});

export const StepFailureKindSchema = z.enum([
  "TIMEOUT", "SELECTOR_NOT_FOUND", "NAVIGATION_ERROR",
  "ASSERTION_FAILED", "NO_OBSERVABLE_CHANGE", "SAFETY_BLOCKED", "UNKNOWN",
]);

export const StepResultSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string(),
  status: z.enum(["PASS", "FAIL", "SOFT_FAIL", "SKIP"]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  error: z.object({ message: z.string(), stack: z.string().optional() }).optional(),
  failureKind: StepFailureKindSchema.optional(),
  artifacts: z.array(ArtifactRefSchema).optional(),
});

export const JourneyResultSchema = z.object({
  journeyId: z.string(),
  name: z.string(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  status: z.enum(["PASS", "FAIL"]),
  steps: z.array(StepResultSchema),
  summary: z
    .object({
      url: z.string(),
      httpStatus: z.number().int().optional(),
      title: z.string().optional(),
    })
    .optional(),
  artifacts: z.array(ArtifactRefSchema),
  video: VideoStatusSchema.optional(),
  safetyEventsPath: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

export const RunIndexSchema = z.object({
  runId: z.string(),
  targetUrl: z.string(),
  envName: z.string(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  journeys: z.array(
    z.object({
      journeyId: z.string(),
      name: z.string(),
      status: z.enum(["PASS", "FAIL"]),
      durationMs: z.number().nonnegative(),
      resultPath: z.string(),
    }),
  ),
  notes: z.array(z.string()).optional(),
  discovery: z.object({
    siteMapPath: z.string(),
    actionsPath: z.string(),
    candidatesPath: z.string(),
    discoveryMdPath: z.string(),
  }).optional(),
});

// --- Module 3: Discovery result schemas ---

export const PageNodeSchema = z.object({
  url: z.string(),
  discoveredFrom: z.string(),
  depth: z.number().int().nonnegative(),
  firstSeenAt: z.string(),
  title: z.string().optional(),
  httpStatus: z.number().int().optional(),
  errorCount: z.number().int().nonnegative(),
  actionCount: z.number().int().nonnegative(),
});

export const ActionTargetSchema = z.object({
  pageUrl: z.string(),
  actionType: z.enum(["CLICK", "FILL", "SUBMIT_FORM", "SELECT", "NAVIGATE"]),
  selector: z.string(),
  selectorCandidates: z.array(z.string()),
  humanLabel: z.string(),
  element: z.object({
    tagName: z.string(),
    role: z.string().optional(),
    inputType: z.string().optional(),
    href: z.string().optional(),
    isVisible: z.boolean(),
    isDisabled: z.boolean(),
  }),
  riskFlags: z.object({
    looksDestructive: z.boolean(),
    requiresAuth: z.boolean(),
  }),
  confidence: z.number().min(0).max(1),
});

export const CandidateStepSchema = z.object({
  action: z.enum(["goto", "click", "fill", "assert"]),
  target: z.string().optional(),
  value: z.string().optional(),
  description: z.string(),
});

export const CandidateJourneySchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.enum(["P0", "P1", "P2"]),
  steps: z.array(CandidateStepSchema),
  tags: z.array(z.string()),
  notes: z.string(),
  score: z.number().optional(),
});

export const DiscoveryResultSchema = z.object({
  startedAt: z.string(),
  endedAt: z.string(),
  durationMs: z.number().nonnegative(),
  pagesDiscovered: z.number().int().nonnegative(),
  pagesVisited: z.number().int().nonnegative(),
  maxPages: z.number().int().nonnegative(),
  maxDepth: z.number().int().nonnegative(),
  linksFound: z.number().int().nonnegative(),
  actionsFound: z.number().int().nonnegative(),
  blockedNavigations: z.number().int().nonnegative(),
  siteMapPath: z.string(),
  actionsPath: z.string(),
  candidatesPath: z.string(),
  discoveryMdPath: z.string(),
});

// --- Module 4: Journey execution schemas ---

export const JourneyConfigSchema = z.object({
  journeys: z.string(),
  journeysMode: z.enum(["topN", "critical", "file"]),
  journeysParam: z.string(),
  journeyTimeoutMs: z.number().int().positive(),
  stepTimeoutMs: z.number().int().positive(),
  maxStepsPerJourney: z.number().int().positive(),
  observableChange: z.boolean(),
  clickWaitMs: z.number().int().nonnegative(),
  assertNetworkActivity: z.boolean(),
});

export const SelectorSpecSchema = z.object({
  primary: z.string(),
  fallbacks: z.array(z.string()),
  strategy: z.enum(["data-testid", "id", "aria", "role", "text", "css", "url"]),
});

export const StepSpecSchema = z.object({
  action: z.enum(["goto", "click", "fill", "waitFor", "assert"]),
  selector: SelectorSpecSchema.optional(),
  url: z.string().optional(),
  value: z.string().optional(),
  description: z.string(),
  safetyAction: SafetyActionSchema.optional(),
  safetyDecision: SafetyDecisionSchema.optional(),
});

export const JourneySpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.enum(["P0", "P1", "P2"]),
  steps: z.array(StepSpecSchema),
  tags: z.array(z.string()),
  notes: z.string(),
  sourceId: z.string(),
  truncated: z.boolean(),
  safetyPreCheck: z.enum(["PASS", "BLOCKED"]),
  blockReason: z.string().optional(),
});

export const ExecutedJourneyRecordSchema = z.object({
  spec: JourneySpecSchema,
  resultPath: z.string(),
});

// --- Module 5: Excluded candidate schema ---

export const ExcludedCandidateReasonSchema = z.enum([
  "DESTRUCTIVE_LABEL",
  "DISABLED",
  "DUPLICATE_INTENT",
  "LOW_CONFIDENCE_SELECTOR",
  "TIMESTAMP_STATUS",
  "READ_ONLY_BLOCKED",
  "CAP_LIMIT",
  "OTHER",
]);

export const ExcludedCandidateSchema = z.object({
  selector: z.string(),
  humanLabel: z.string(),
  actionType: z.enum(["CLICK", "FILL", "SUBMIT_FORM", "SELECT", "NAVIGATE"]),
  reason: ExcludedCandidateReasonSchema,
  score: z.number().optional(),
  pageUrl: z.string(),
});

// --- Module 6: Healer / Modify Flow schemas ---

export const StepEditPatchSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  from: z.object({
    selector: SelectorSpecSchema.optional(),
    label: z.string().optional(),
  }),
  to: z.object({
    selector: SelectorSpecSchema,
    label: z.string().optional(),
  }),
  reason: z.string().optional(),
  editedAt: z.string(),
  editedBy: z.string().optional(),
});

export const PinnedTestSchema = z.object({
  testId: z.string(),
  projectSlug: z.string(),
  name: z.string().min(1),
  createdAt: z.string(),
  baseRunId: z.string(),
  baseJourneyId: z.string(),
  journeySpec: JourneySpecSchema,
  patches: z.array(StepEditPatchSchema),
  tags: z.array(z.string()),
  safetySnapshot: SafetyPolicySchema.optional(),
});
