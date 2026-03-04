import { Router, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import type { JourneySpec, StepEditPatch, ExecutedJourneyRecord, PinnedTest } from "@web-qa-agent/shared";
import { registry } from "../registry.js";
import { startRun, killProcessTree, startPinnedRun } from "../spawn.js";

export const runsRouter = Router();

// POST /api/runs — start a new run
runsRouter.post("/", async (req: Request, res: Response) => {
  if (!registry.canStart()) {
    res.status(429).json({ error: "Max concurrent runs reached. Try again later." });
    return;
  }

  const { url, options, repos } = req.body as {
    url?: string;
    options?: Record<string, unknown>;
    repos?: Array<{ url: string; role: string }>;
  };
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    const record = await startRun({
      url,
      options: {
        smoke: options?.smoke as boolean | undefined,
        discover: options?.discover as boolean | undefined,
        journeys: options?.journeys as string | undefined,
        headless: options?.headless as boolean | undefined ?? true,
        maxPages: options?.maxPages as number | undefined,
        maxDepth: options?.maxDepth as number | undefined,
      },
      repos,
    });

    res.status(201).json({
      runId: record.runId,
      status: record.status,
      outDir: record.outDir,
      projectSlug: record.projectSlug,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/runs — list all runs
runsRouter.get("/", (_req: Request, res: Response) => {
  res.json(registry.list());
});

// GET /api/runs/:id — get run details
runsRouter.get("/:id", (req: Request, res: Response) => {
  const run = registry.get(req.params.id as string);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  res.json({
    runId: run.runId,
    targetUrl: run.targetUrl,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    exitCode: run.exitCode,
    indexReady: run.indexReady,
    runIndex: run.runIndex,
    options: run.options,
    repos: run.repos,
    repoMeta: run.repoMeta,
    stages: run.stages,
    issuesReady: run.issuesReady ?? false,
    projectSlug: run.projectSlug,
  });
});

// POST /api/runs/:id/stop — kill the process
runsRouter.post("/:id/stop", (req: Request, res: Response) => {
  const run = registry.get(req.params.id as string);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  if (run.process && run.status === "running") {
    registry.setStatus(run.runId, "stopped");
    killProcessTree(run, "SIGTERM");
    // Fallback SIGKILL after 5s if process group is still alive
    setTimeout(() => {
      try { killProcessTree(run, "SIGKILL"); } catch { /* already exited */ }
    }, 5000);
  }

  res.json({ ok: true });
});

// GET /api/runs/:id/coverage
runsRouter.get("/:id/coverage", async (req: Request, res: Response) => {
  const run = registry.get(req.params.id as string);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  try {
    const { computeCoverage } = await import("../triage/coverage.js");
    const coverage = await computeCoverage(run.outDir, run.runId);
    res.json(coverage);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/runs/:id/journeys/:journeyId/repair — repair a journey step
runsRouter.post("/:id/journeys/:journeyId/repair", async (req: Request, res: Response) => {
  const run = registry.get(req.params.id as string);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  if (!registry.canStart()) {
    res.status(429).json({ error: "Max concurrent runs reached. Try again later." });
    return;
  }

  const { patches } = req.body as { patches?: StepEditPatch[] };
  if (!patches || patches.length === 0) {
    res.status(400).json({ error: "patches array is required" });
    return;
  }

  // Read the original JourneySpec from journeys.executed.json
  const executedPath = path.join(run.outDir, "artifacts/discovery/journeys.executed.json");
  let originalSpec: JourneySpec | null = null;
  try {
    const raw = await fs.readFile(executedPath, "utf-8");
    const records = JSON.parse(raw) as ExecutedJourneyRecord[];
    const match = records.find((r) => r.spec.id === req.params.journeyId);
    if (match) originalSpec = match.spec;
  } catch { /* file may not exist */ }

  if (!originalSpec) {
    res.status(404).json({ error: "Original journey spec not found in journeys.executed.json" });
    return;
  }

  // Apply patches to create modified spec
  const modifiedSpec: JourneySpec = JSON.parse(JSON.stringify(originalSpec));
  modifiedSpec.id = `repair-${originalSpec.id}`;
  modifiedSpec.tags = [...modifiedSpec.tags.filter((t) => t !== "pinned"), "repaired"];

  for (const patch of patches) {
    const step = modifiedSpec.steps[patch.stepIndex];
    if (step) {
      step.selector = patch.to.selector;
      if (patch.to.label) step.description = patch.to.label;
    }
  }

  // Auto-create pinned test
  const testId = uuidv4();
  const projectSlug = run.projectSlug ?? "unknown";
  const pinnedTest: PinnedTest = {
    testId,
    projectSlug,
    name: `Repair: ${originalSpec.name}`,
    createdAt: new Date().toISOString(),
    baseRunId: run.runId,
    baseJourneyId: req.params.journeyId as string,
    journeySpec: modifiedSpec,
    patches,
    tags: ["pinned", "repaired"],
  };

  // Write pinned test to disk
  const SERVER_DIR = new URL(".", import.meta.url).pathname;
  const DATA_DIR = path.resolve(SERVER_DIR, "../../../../data/runs");
  const pinnedDir = path.join(DATA_DIR, projectSlug, ".pinned_tests");
  await fs.mkdir(pinnedDir, { recursive: true });
  await fs.writeFile(path.join(pinnedDir, `${testId}.json`), JSON.stringify(pinnedTest, null, 2));

  // Spawn the repaired journey
  try {
    const record = await startPinnedRun({
      projectSlug,
      targetUrl: run.targetUrl,
      journeySpec: modifiedSpec,
      pinnedTestId: testId,
      baseRunId: run.runId,
      baseJourneyId: req.params.journeyId as string,
    });

    res.status(201).json({
      runId: record.runId,
      pinnedTestId: testId,
      projectSlug,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/runs/:id/stream — SSE
runsRouter.get("/:id/stream", (req: Request, res: Response) => {
  const run = registry.get(req.params.id as string);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  // Replay buffer
  for (const line of run.logLines) {
    res.write(`data: ${JSON.stringify({ type: "line", text: line })}\n\n`);
  }

  // If already finished, send final events and close
  if (run.status !== "running") {
    res.write(`data: ${JSON.stringify({ type: "status", status: run.status, exitCode: run.exitCode })}\n\n`);
    if (run.indexReady) {
      res.write(`data: ${JSON.stringify({ type: "indexReady" })}\n\n`);
    }
    if (run.repoMeta) {
      res.write(`data: ${JSON.stringify({ type: "repoMetaReady" })}\n\n`);
    }
    if (run.stages) {
      res.write(`data: ${JSON.stringify({ type: "stagesReady" })}\n\n`);
    }
    if (run.issuesReady) {
      res.write(`data: ${JSON.stringify({ type: "issuesReady" })}\n\n`);
    }
    res.end();
    return;
  }

  // Register SSE client
  run.sseClients.add(res);

  // Keepalive every 15s
  const keepalive = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      clearInterval(keepalive);
    }
  }, 15000);

  req.on("close", () => {
    run.sseClients.delete(res);
    clearInterval(keepalive);
  });
});
