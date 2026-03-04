import { Command } from "commander";

export interface CliOptions {
  url?: string;
  out?: string;
  env?: string;
  config?: string;
  readOnly?: string;
  allowlist?: string;
  denylist?: string;
  maxPages?: string;
  uiConcurrency?: string;
  rerunFailures?: string;
  jiraEnabled?: string;
  jiraBaseUrl?: string;
  jiraProject?: string;
  jiraEmail?: string;
  llmProvider?: string;
  llmModel?: string;
  // Module 2: Playwright flags
  smoke?: string;
  browser?: string;
  headless?: string;
  timeoutMs?: string;
  trace?: string;
  video?: string;
  networkEvents?: string;
  stepScreenshots?: string;
  // Module 3: Discovery flags
  discover?: string;
  maxDepth?: string;
  sameOriginOnly?: string;
  includeQueryParams?: string;
  actionLimitPerPage?: string;
  discoveryTimeoutMs?: string;
  discoveryMode?: string;
  saveScreenshots?: string;
  // Module 4: Journey execution flags
  journeys?: string;
  journeyTimeoutMs?: string;
  stepTimeoutMs?: string;
  maxStepsPerJourney?: string;
  observableChange?: string;
  clickWaitMs?: string;
  assertNetworkActivity?: string;
}

// NOTE: No commander defaults here — defaults live in load.ts so that
// config-file and env-var layers aren't shadowed by commander defaults.
export function addCommonOptions(cmd: Command): Command {
  return cmd
    .requiredOption("--url <string>", "Target website base URL")
    .requiredOption("--out <path>", "Output directory for this run")
    .option("--env <string>", "Environment label (default: staging)")
    .option("--config <path>", "Path to JSON config file to merge")
    .option("--read-only <bool>", "Read-only mode (default: true)")
    .option("--allowlist <csv>", "Allowed action categories (comma-separated)")
    .option("--denylist <csv>", "Denied action categories/patterns (comma-separated)")
    .option("--max-pages <int>", "Maximum pages to crawl (default: 50)")
    .option("--ui-concurrency <int>", "UI concurrency limit (default: 5)")
    .option("--rerun-failures <int>", "Failure rerun count (default: 2)")
    .option("--jira-enabled <bool>", "Enable Jira integration (default: false)")
    .option("--jira-base-url <string>", "Jira base URL")
    .option("--jira-project <string>", "Jira project key")
    .option("--jira-email <string>", "Jira email")
    .option("--llm-provider <string>", "LLM provider: openai|anthropic|none (default: none)")
    .option("--llm-model <string>", "LLM model name")
    // Module 2: Playwright flags
    .option("--smoke <bool>", "Run smoke journey (default: false)")
    .option("--browser <string>", "Browser: chromium|firefox|webkit (default: chromium)")
    .option("--headless <bool>", "Headless mode (default: true)")
    .option("--timeout-ms <int>", "Navigation timeout in ms (default: 30000)")
    .option("--trace <bool>", "Enable Playwright tracing (default: true)")
    .option("--video <bool>", "Enable video recording (default: true)")
    .option("--network-events <bool>", "Capture network events (default: true)")
    .option("--step-screenshots <bool>", "Screenshot after each step (default: false)")
    // Module 3: Discovery flags
    .option("--discover <bool>", "Enable site discovery crawl (default: false)")
    .option("--max-depth <int>", "Max crawl depth (default: 3)")
    .option("--same-origin-only <bool>", "Only crawl same-origin URLs (default: true)")
    .option("--include-query-params <bool>", "Include query params in URL dedup (default: false)")
    .option("--action-limit-per-page <int>", "Max actions extracted per page (default: 50)")
    .option("--discovery-timeout-ms <int>", "Discovery wall-clock timeout in ms (default: 120000)")
    .option("--discovery-mode <string>", "Discovery mode: fast|thorough (default: fast)")
    .option("--save-screenshots <bool>", "Save per-page screenshots during discovery (default: false)")
    // Module 4: Journey execution flags
    .option("--journeys <string>", "Journey selection: topN:<n>, critical, file:<path>")
    .option("--journey-timeout-ms <int>", "Per-journey timeout in ms (default: 120000)")
    .option("--step-timeout-ms <int>", "Per-step timeout in ms (default: 30000)")
    .option("--max-steps-per-journey <int>", "Max steps per journey (default: 8)")
    .option("--observable-change <bool>", "Detect observable changes after click (default: true)")
    .option("--click-wait-ms <int>", "Wait after click for change detection in ms (default: 800)")
    .option("--assert-network-activity <bool>", "Assert network activity on goto (default: true)");
}
