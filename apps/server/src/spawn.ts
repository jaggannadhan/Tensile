import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import { RunIndexSchema } from "@web-qa-agent/shared";
import type { JourneySpec, CandidateJourney } from "@web-qa-agent/shared";
import { registry, broadcast, type RunRecord, type RunOptions, type StageStats } from "./registry.js";
import { parseRepoUrl } from "./github/client.js";
import { enrichRepos } from "./github/enrich.js";
import { deriveProjectSlug } from "./projects.js";
import type { RepoSpec } from "./github/types.js";

const SERVER_DIR = new URL(".", import.meta.url).pathname;
const RUNNER_PATH = path.resolve(SERVER_DIR, "../../runner/dist/index.js");
const DATA_DIR = path.resolve(SERVER_DIR, "../../../data/runs");

const INDEX_POLL_INTERVAL_MS = 2000;

export interface StartRunInput {
  url: string;
  options: RunOptions;
  repos?: Array<{ url: string; role: string }>;
}

export async function startRun(input: StartRunInput): Promise<RunRecord> {
  // Verify runner is built
  try {
    await fs.access(RUNNER_PATH);
  } catch {
    throw new Error(`Runner not built at ${RUNNER_PATH}. Run 'npm run build' first.`);
  }

  const runId = uuidv4();
  const projectSlug = deriveProjectSlug(input.url);
  const outDir = path.join(DATA_DIR, projectSlug, runId);
  const opts = input.options;

  // Normalize journeys option
  // Default to "topN:3" when discover is enabled and journeys not explicitly set
  let normalizedJourneys = opts.journeys;
  if (opts.discover && !normalizedJourneys) {
    normalizedJourneys = "topN:3";
  }
  // "none" means no journeys — don't pass the flag
  if (normalizedJourneys === "none") {
    normalizedJourneys = undefined;
  }

  // Build CLI args
  const args = [
    RUNNER_PATH, "run",
    "--url", input.url,
    "--out", outDir,
    "--headless", String(opts.headless ?? true),
  ];

  if (opts.smoke !== undefined) args.push("--smoke", String(opts.smoke));
  if (opts.discover !== undefined) args.push("--discover", String(opts.discover));
  if (normalizedJourneys) args.push("--journeys", normalizedJourneys);
  if (opts.maxPages !== undefined) args.push("--max-pages", String(Math.min(opts.maxPages, 20)));
  if (opts.maxDepth !== undefined) args.push("--max-depth", String(Math.min(opts.maxDepth, 5)));

  // Ensure outDir exists and write run.json metadata
  await fs.mkdir(outDir, { recursive: true });
  const startedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(outDir, "run.json"),
    JSON.stringify({ runId, projectSlug, targetUrl: input.url, startedAt, options: opts }, null, 2),
  );

  const child = spawn("node", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    detached: true,
  });

  // Parse repo URLs
  const repoSpecs: RepoSpec[] = [];
  if (input.repos) {
    for (const r of input.repos) {
      const spec = parseRepoUrl(r.url, r.role);
      if (spec) repoSpecs.push(spec);
    }
  }

  const record: RunRecord = {
    runId,
    targetUrl: input.url,
    status: "running",
    outDir,
    startedAt,
    options: opts,
    projectSlug,
    process: child,
    logLines: [],
    sseClients: new Set(),
    indexReady: false,
    ...(repoSpecs.length > 0 ? { repos: repoSpecs } : {}),
  };

  registry.create(record);
  attachProcessHandlers(record);

  // Fire-and-forget async GitHub enrichment
  if (repoSpecs.length > 0) {
    enrichRepos(repoSpecs, outDir)
      .then((meta) => {
        if (meta) {
          registry.setRepoMeta(record.runId, meta);
          broadcast(record, { type: "repoMetaReady" });
        }
      })
      .catch((err) => {
        console.warn(`[github] enrichment failed for run ${record.runId}:`, (err as Error).message);
      });
  }

  return record;
}

// --- Pinned test support ---

export interface StartPinnedRunInput {
  projectSlug: string;
  targetUrl: string;
  journeySpec: JourneySpec;
  pinnedTestId: string;
  baseRunId: string;
  baseJourneyId: string;
}

/** Convert a JourneySpec back to CandidateJourney format for the runner's file: mode. */
export function specToCandidateJourney(spec: JourneySpec): CandidateJourney {
  return {
    id: spec.id,
    name: spec.name,
    priority: spec.priority,
    steps: spec.steps.map((s) => ({
      action: s.action === "waitFor" ? "assert" : s.action as "goto" | "click" | "fill" | "assert",
      target: s.selector?.primary ?? s.url,
      value: s.value,
      description: s.description,
    })),
    tags: [...spec.tags, "pinned"],
    notes: spec.notes,
    score: 100,
  };
}

/** Spawn a run for a single pinned test journey. */
export async function startPinnedRun(input: StartPinnedRunInput): Promise<RunRecord> {
  try {
    await fs.access(RUNNER_PATH);
  } catch {
    throw new Error(`Runner not built at ${RUNNER_PATH}. Run 'npm run build' first.`);
  }

  const runId = uuidv4();
  const outDir = path.join(DATA_DIR, input.projectSlug, runId);
  await fs.mkdir(outDir, { recursive: true });

  // Write candidate journey file for runner's file: mode
  const candidate = specToCandidateJourney(input.journeySpec);
  const pinnedJsonPath = path.join(outDir, "journeys.pinned.json");
  await fs.writeFile(pinnedJsonPath, JSON.stringify([candidate], null, 2));

  // Build CLI args
  const args = [
    RUNNER_PATH, "run",
    "--url", input.targetUrl,
    "--out", outDir,
    "--headless", "true",
    "--smoke", "false",
    "--discover", "false",
    "--journeys", `file:${pinnedJsonPath}`,
  ];

  const startedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(outDir, "run.json"),
    JSON.stringify({
      runId,
      projectSlug: input.projectSlug,
      targetUrl: input.targetUrl,
      startedAt,
      pinnedTestId: input.pinnedTestId,
      baseRunId: input.baseRunId,
      baseJourneyId: input.baseJourneyId,
      options: { smoke: false, discover: false, journeys: `file:${pinnedJsonPath}` },
    }, null, 2),
  );

  const child = spawn("node", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    detached: true,
  });

  const record: RunRecord = {
    runId,
    targetUrl: input.targetUrl,
    status: "running",
    outDir,
    startedAt,
    options: { smoke: false, discover: false, journeys: `file:${pinnedJsonPath}` },
    projectSlug: input.projectSlug,
    process: child,
    logLines: [],
    sseClients: new Set(),
    indexReady: false,
  };

  registry.create(record);
  attachProcessHandlers(record);
  return record;
}

/**
 * Kill the entire process tree for a run.
 * Uses negative PID to signal the process group (requires detached: true on spawn).
 */
export function killProcessTree(record: RunRecord, signal: NodeJS.Signals = "SIGTERM"): void {
  const child = record.process;
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // Process group may have already exited
    try { child.kill(signal); } catch { /* ignore */ }
  }
}

async function computeStages(record: RunRecord): Promise<void> {
  const runIndex = record.runIndex;
  if (!runIndex) return;

  const stages: StageStats = {};

  // Smoke stage: journeyId === "smoke"
  const smokeJ = runIndex.journeys.find((j) => j.journeyId === "smoke");
  if (smokeJ) {
    stages.smoke = {
      status: smokeJ.status === "PASS" ? "pass" : "fail",
      durationMs: smokeJ.durationMs,
    };
  } else if (record.options.smoke) {
    stages.smoke = { status: "skip" };
  }

  // Discovery stage
  if (runIndex.discovery) {
    const disco: StageStats["discovery"] = { status: "pass" };
    try {
      const siteMapRaw = await fs.readFile(path.join(record.outDir, runIndex.discovery.siteMapPath), "utf-8");
      const siteMap = JSON.parse(siteMapRaw);
      if (Array.isArray(siteMap)) disco.pages = siteMap.length;
    } catch { /* missing or unreadable */ }
    try {
      const actionsRaw = await fs.readFile(path.join(record.outDir, runIndex.discovery.actionsPath), "utf-8");
      const actions = JSON.parse(actionsRaw);
      if (Array.isArray(actions)) disco.actions = actions.length;
    } catch { /* missing or unreadable */ }
    try {
      const candidatesRaw = await fs.readFile(path.join(record.outDir, runIndex.discovery.candidatesPath), "utf-8");
      const candidates = JSON.parse(candidatesRaw);
      if (Array.isArray(candidates)) disco.candidates = candidates.length;
    } catch { /* missing or unreadable */ }
    stages.discovery = disco;
  } else if (record.options.discover) {
    stages.discovery = { status: "skip" };
  }

  // Journeys stage: non-smoke journeys
  const nonSmoke = runIndex.journeys.filter((j) => j.journeyId !== "smoke");
  if (nonSmoke.length > 0) {
    let passed = 0;
    let failed = 0;
    let warned = 0;
    for (const j of nonSmoke) {
      if (j.status === "PASS") {
        // Check if any steps had SOFT_FAIL by reading result.json
        try {
          const raw = await fs.readFile(path.join(record.outDir, j.resultPath), "utf-8");
          const result = JSON.parse(raw);
          if (result.warnings && result.warnings.length > 0) {
            warned++;
          }
          passed++;
        } catch {
          passed++;
        }
      } else {
        failed++;
      }
    }
    stages.journeys = {
      status: failed > 0 ? "fail" : warned > 0 ? "pass" : "pass",
      executed: nonSmoke.length,
      passed,
      failed,
      skipped: 0,
      warned,
    };
  } else if (record.options.journeys && record.options.journeys !== "none") {
    stages.journeys = { status: "skip", executed: 0, passed: 0, failed: 0, skipped: 0, warned: 0 };
  }

  registry.setStages(record.runId, stages);
  broadcast(record, { type: "stagesReady" });
}

function attachProcessHandlers(record: RunRecord): void {
  const child = record.process;
  if (!child || !child.stdout || !child.stderr) return;

  const handleLine = (line: string) => {
    registry.appendLog(record.runId, line);
    broadcast(record, { type: "line", text: line });
  };

  const stdoutRL = createInterface({ input: child.stdout });
  stdoutRL.on("line", handleLine);

  const stderrRL = createInterface({ input: child.stderr });
  stderrRL.on("line", (line) => handleLine(`[stderr] ${line}`));

  // Poll for run.index.json while the process is running
  const indexPath = path.join(record.outDir, "run.index.json");
  const indexPoll = setInterval(async () => {
    if (record.indexReady) {
      clearInterval(indexPoll);
      return;
    }
    try {
      const raw = await fs.readFile(indexPath, "utf-8");
      const parsed = RunIndexSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        clearInterval(indexPoll);
        registry.setIndexReady(record.runId, parsed.data);
        broadcast(record, { type: "indexReady" });
        computeStages(record).catch(() => {});
      }
    } catch {
      // Index doesn't exist yet — keep polling
    }
  }, INDEX_POLL_INTERVAL_MS);

  child.on("close", async (code) => {
    clearInterval(indexPoll);

    // Don't overwrite status if already stopped by user
    if (record.status !== "stopped") {
      const exitCode = code ?? 1;
      let status: "passed" | "failed" | "error";
      if (exitCode === 0) status = "passed";
      else if (exitCode === 1) status = "failed";
      else status = "error";

      registry.setStatus(record.runId, status, exitCode);
      broadcast(record, { type: "status", status, exitCode });
    } else {
      // For stopped runs, still record the exit code and broadcast final status
      registry.setExitCode(record.runId, code ?? 1);
      broadcast(record, { type: "status", status: "stopped", exitCode: code ?? 1 });
    }

    // Update run.json with final status
    try {
      const runJsonPath = path.join(record.outDir, "run.json");
      const raw = await fs.readFile(runJsonPath, "utf-8");
      const meta = JSON.parse(raw);
      meta.endedAt = record.endedAt;
      meta.status = record.status;
      meta.exitCode = record.exitCode;
      await fs.writeFile(runJsonPath, JSON.stringify(meta, null, 2));
    } catch { /* ignore */ }

    // Try to read run.index.json one final time (if not already loaded)
    if (!record.indexReady) {
      try {
        const raw = await fs.readFile(indexPath, "utf-8");
        const parsed = RunIndexSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          registry.setIndexReady(record.runId, parsed.data);
          broadcast(record, { type: "indexReady" });
          await computeStages(record);
        }
      } catch {
        // Index may not exist if run failed early
      }
    } else if (!record.stages) {
      // Index was loaded during polling but stages not yet computed
      await computeStages(record);
    }

    // Post-run async processing: ownership hints → triage issues → close SSE
    const postProcess = async () => {
      let ownershipHintsFile: import("./github/types.js").OwnershipHintsFile | undefined;

      // 1. Compute ownership hints if repos + failures exist
      if (record.repos && record.repoMeta && record.runIndex) {
        const failedJourneys = record.runIndex.journeys.filter((j) => j.status === "FAIL");
        if (failedJourneys.length > 0) {
          try {
            const { computeOwnershipHints } = await import("./github/ownership.js");
            const journeyResults = [];
            for (const j of failedJourneys) {
              try {
                const raw = await fs.readFile(path.join(record.outDir, j.resultPath), "utf-8");
                journeyResults.push(JSON.parse(raw));
              } catch { /* skip unreadable */ }
            }
            if (journeyResults.length > 0) {
              const hints = await computeOwnershipHints(
                record.repoMeta!.repos,
                journeyResults,
                record.outDir,
              );
              if (hints) {
                ownershipHintsFile = hints;
                broadcast(record, { type: "ownershipReady" });
              }
            }
          } catch (err) {
            console.warn(`[github] ownership hints failed for run ${record.runId}:`, (err as Error).message);
          }
        }
      }

      // 2. Compute triage issues
      if (record.runIndex) {
        try {
          const { computeIssues } = await import("./triage/issues.js");
          await computeIssues(record.outDir, record.runIndex, ownershipHintsFile);
          registry.setIssuesReady(record.runId);
          broadcast(record, { type: "issuesReady" });
        } catch (err) {
          console.warn(`[triage] issues failed for run ${record.runId}:`, (err as Error).message);
        }
      }
    };

    postProcess().finally(() => {
      // End all SSE connections after post-processing completes
      for (const client of record.sseClients) {
        try { client.end(); } catch { /* ignore */ }
      }
      record.sseClients.clear();
    });
  });
}
