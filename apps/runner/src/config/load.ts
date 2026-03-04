import path from "node:path";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import type { RunConfig } from "@web-qa-agent/shared";
import { RunConfigSchema } from "@web-qa-agent/shared";
import type { CliOptions } from "./cli.js";
import type { EnvVars } from "./env.js";
import { loadEnv } from "./env.js";
import { ConfigError } from "../utils/errors.js";

function parseBool(val: string | undefined, fallback: boolean): boolean {
  if (val === undefined) return fallback;
  return val === "true" || val === "1";
}

function parseCSV(val: string | undefined): string[] {
  if (!val || val.trim() === "") return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseInt(val: string | undefined, fallback: number): number {
  if (val === undefined) return fallback;
  const n = Number(val);
  return Number.isNaN(n) ? fallback : n;
}

function parseJourneysFlag(
  raw: string | undefined,
  discoverEnabled: boolean,
): { journeys: string; journeysMode: RunConfig["journey"]["journeysMode"]; journeysParam: string } {
  const value = raw ?? (discoverEnabled ? "topN:3" : "none");
  if (value === "none") {
    return { journeys: "none", journeysMode: "topN", journeysParam: "0" };
  }
  if (value === "critical") {
    return { journeys: value, journeysMode: "critical", journeysParam: "" };
  }
  if (value.startsWith("topN:")) {
    const n = value.slice(5);
    return { journeys: value, journeysMode: "topN", journeysParam: n || "3" };
  }
  if (value.startsWith("file:")) {
    return { journeys: value, journeysMode: "file", journeysParam: value.slice(5) };
  }
  return { journeys: "topN:3", journeysMode: "topN", journeysParam: "3" };
}

async function loadConfigFile(filePath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function buildRunConfig(cliOpts: CliOptions): Promise<RunConfig> {
  const env: EnvVars = loadEnv();

  let fileConfig: Record<string, unknown> = {};
  if (cliOpts.config) {
    fileConfig = await loadConfigFile(cliOpts.config);
  }

  // Precedence: CLI > env > file > defaults
  const url = cliOpts.url ?? env.TARGET_URL ?? (fileConfig.url as string | undefined);
  const out = cliOpts.out ?? env.OUT_DIR ?? (fileConfig.outDir as string | undefined);

  if (!url) throw new ConfigError("--url is required");
  if (!out) throw new ConfigError("--out is required");

  const raw: RunConfig = {
    runId: (fileConfig.runId as string) ?? uuidv4(),
    url,
    outDir: path.resolve(out),
    env: cliOpts.env ?? env.ENV ?? (fileConfig.env as string) ?? "staging",
    readOnly: parseBool(
      cliOpts.readOnly ?? env.READ_ONLY ?? (fileConfig.readOnly as string | undefined),
      true,
    ),
    allowlist: parseCSV(cliOpts.allowlist) .length > 0
      ? parseCSV(cliOpts.allowlist)
      : parseCSV(env.ALLOWLIST).length > 0
        ? parseCSV(env.ALLOWLIST)
        : (fileConfig.allowlist as string[]) ?? [],
    denylist: parseCSV(cliOpts.denylist).length > 0
      ? parseCSV(cliOpts.denylist)
      : parseCSV(env.DENYLIST).length > 0
        ? parseCSV(env.DENYLIST)
        : (fileConfig.denylist as string[]) ?? [],
    maxPages: parseInt(
      cliOpts.maxPages ?? env.MAX_PAGES ?? (fileConfig.maxPages as string | undefined),
      50,
    ),
    uiConcurrency: parseInt(
      cliOpts.uiConcurrency ?? env.UI_CONCURRENCY ?? (fileConfig.uiConcurrency as string | undefined),
      5,
    ),
    rerunFailures: parseInt(
      cliOpts.rerunFailures ?? env.RERUN_FAILURES ?? (fileConfig.rerunFailures as string | undefined),
      2,
    ),
    jira: {
      enabled: parseBool(
        cliOpts.jiraEnabled ?? env.JIRA_ENABLED ?? (fileConfig.jiraEnabled as string | undefined),
        false,
      ),
      baseUrl: cliOpts.jiraBaseUrl ?? env.JIRA_BASE_URL ?? (fileConfig.jiraBaseUrl as string | undefined),
      project: cliOpts.jiraProject ?? env.JIRA_PROJECT ?? (fileConfig.jiraProject as string | undefined),
      email: cliOpts.jiraEmail ?? env.JIRA_EMAIL ?? (fileConfig.jiraEmail as string | undefined),
    },
    llm: {
      provider: (cliOpts.llmProvider ?? env.LLM_PROVIDER ?? (fileConfig.llmProvider as string) ?? "none") as RunConfig["llm"]["provider"],
      model: cliOpts.llmModel ?? env.LLM_MODEL ?? (fileConfig.llmModel as string | undefined),
    },
    playwright: {
      smoke: parseBool(cliOpts.smoke ?? (fileConfig.smoke as string | undefined), false),
      browser: (cliOpts.browser ?? (fileConfig.browser as string) ?? "chromium") as RunConfig["playwright"]["browser"],
      headless: parseBool(cliOpts.headless ?? (fileConfig.headless as string | undefined), true),
      timeoutMs: parseInt(cliOpts.timeoutMs ?? (fileConfig.timeoutMs as string | undefined), 30000),
      trace: parseBool(cliOpts.trace ?? (fileConfig.trace as string | undefined), true),
      video: parseBool(cliOpts.video ?? (fileConfig.video as string | undefined), true),
      networkEvents: parseBool(cliOpts.networkEvents ?? (fileConfig.networkEvents as string | undefined), true),
      stepScreenshots: parseBool(cliOpts.stepScreenshots ?? (fileConfig.stepScreenshots as string | undefined), false),
    },
    discovery: {
      discover: parseBool(cliOpts.discover ?? (fileConfig.discover as string | undefined), false),
      maxDepth: parseInt(cliOpts.maxDepth ?? (fileConfig.maxDepth as string | undefined), 3),
      sameOriginOnly: parseBool(cliOpts.sameOriginOnly ?? (fileConfig.sameOriginOnly as string | undefined), true),
      includeQueryParams: parseBool(cliOpts.includeQueryParams ?? (fileConfig.includeQueryParams as string | undefined), false),
      actionLimitPerPage: parseInt(cliOpts.actionLimitPerPage ?? (fileConfig.actionLimitPerPage as string | undefined), 50),
      discoveryTimeoutMs: parseInt(cliOpts.discoveryTimeoutMs ?? (fileConfig.discoveryTimeoutMs as string | undefined), 120000),
      discoveryMode: (cliOpts.discoveryMode ?? (fileConfig.discoveryMode as string) ?? "fast") as RunConfig["discovery"]["discoveryMode"],
      saveScreenshots: parseBool(cliOpts.saveScreenshots ?? (fileConfig.saveScreenshots as string | undefined), false),
    },
    journey: (() => {
      const discoverEnabled = parseBool(cliOpts.discover ?? (fileConfig.discover as string | undefined), false);
      const parsed = parseJourneysFlag(
        cliOpts.journeys ?? (fileConfig.journeys as string | undefined),
        discoverEnabled,
      );
      return {
        ...parsed,
        journeyTimeoutMs: parseInt(cliOpts.journeyTimeoutMs ?? (fileConfig.journeyTimeoutMs as string | undefined), 120000),
        stepTimeoutMs: parseInt(cliOpts.stepTimeoutMs ?? (fileConfig.stepTimeoutMs as string | undefined), 30000),
        maxStepsPerJourney: parseInt(cliOpts.maxStepsPerJourney ?? (fileConfig.maxStepsPerJourney as string | undefined), 8),
        observableChange: parseBool(cliOpts.observableChange ?? (fileConfig.observableChange as string | undefined), true),
        clickWaitMs: parseInt(cliOpts.clickWaitMs ?? (fileConfig.clickWaitMs as string | undefined), 800),
        assertNetworkActivity: parseBool(cliOpts.assertNetworkActivity ?? (fileConfig.assertNetworkActivity as string | undefined), true),
      };
    })(),
    startedAt: new Date().toISOString(),
  };

  const result = RunConfigSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Config validation failed:\n${messages}`);
  }

  return result.data;
}
