import { Router, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import type { PinnedTest, PinnedTestSummary } from "@web-qa-agent/shared";
import { startPinnedRun } from "../spawn.js";
import { registry } from "../registry.js";

export const pinnedRouter = Router({ mergeParams: true });

const SERVER_DIR = new URL(".", import.meta.url).pathname;
const DATA_DIR = path.resolve(SERVER_DIR, "../../../data/runs");

function pinnedDir(slug: string): string {
  return path.join(DATA_DIR, slug, ".pinned_tests");
}

function pinnedPath(slug: string, testId: string): string {
  return path.join(pinnedDir(slug), `${testId}.json`);
}

// GET / — list pinned tests for a project
pinnedRouter.get("/", async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const dir = pinnedDir(slug);

  try {
    const files = await fs.readdir(dir);
    const summaries: PinnedTestSummary[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const test = JSON.parse(raw) as PinnedTest;
        summaries.push({
          testId: test.testId,
          name: test.name,
          createdAt: test.createdAt,
          baseRunId: test.baseRunId,
          baseJourneyId: test.baseJourneyId,
          patchCount: test.patches.length,
          tags: test.tags,
        });
      } catch { /* skip unreadable */ }
    }

    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(summaries);
  } catch {
    // Directory doesn't exist yet
    res.json([]);
  }
});

// POST / — create a pinned test
pinnedRouter.post("/", async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const { baseRunId, baseJourneyId, name, journeySpec, patches, tags } = req.body as {
    baseRunId?: string;
    baseJourneyId?: string;
    name?: string;
    journeySpec?: unknown;
    patches?: unknown[];
    tags?: string[];
  };

  if (!baseRunId || !baseJourneyId || !name || !journeySpec) {
    res.status(400).json({ error: "baseRunId, baseJourneyId, name, and journeySpec are required" });
    return;
  }

  const testId = uuidv4();
  const pinnedTest: PinnedTest = {
    testId,
    projectSlug: slug,
    name,
    createdAt: new Date().toISOString(),
    baseRunId,
    baseJourneyId,
    journeySpec: journeySpec as PinnedTest["journeySpec"],
    patches: (patches ?? []) as PinnedTest["patches"],
    tags: tags ?? ["pinned"],
  };

  const dir = pinnedDir(slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(pinnedPath(slug, testId), JSON.stringify(pinnedTest, null, 2));

  res.status(201).json(pinnedTest);
});

// GET /:testId — get a single pinned test
pinnedRouter.get("/:testId", async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const testId = req.params.testId as string;

  try {
    const raw = await fs.readFile(pinnedPath(slug, testId), "utf-8");
    res.json(JSON.parse(raw));
  } catch {
    res.status(404).json({ error: "Pinned test not found" });
  }
});

// DELETE /:testId — delete a pinned test
pinnedRouter.delete("/:testId", async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const testId = req.params.testId as string;

  try {
    await fs.unlink(pinnedPath(slug, testId));
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Pinned test not found" });
  }
});

// POST /:testId/run — run a pinned test
pinnedRouter.post("/:testId/run", async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const testId = req.params.testId as string;

  if (!registry.canStart()) {
    res.status(429).json({ error: "Max concurrent runs reached. Try again later." });
    return;
  }

  let pinnedTest: PinnedTest;
  try {
    const raw = await fs.readFile(pinnedPath(slug, testId), "utf-8");
    pinnedTest = JSON.parse(raw);
  } catch {
    res.status(404).json({ error: "Pinned test not found" });
    return;
  }

  // Determine target URL from the base run
  const baseRun = registry.get(pinnedTest.baseRunId);
  const targetUrl = baseRun?.targetUrl ?? pinnedTest.journeySpec.steps.find((s) => s.url)?.url;
  if (!targetUrl) {
    res.status(400).json({ error: "Cannot determine target URL for pinned test" });
    return;
  }

  try {
    const record = await startPinnedRun({
      projectSlug: slug,
      targetUrl,
      journeySpec: pinnedTest.journeySpec,
      pinnedTestId: testId,
      baseRunId: pinnedTest.baseRunId,
      baseJourneyId: pinnedTest.baseJourneyId,
    });

    res.status(201).json({
      runId: record.runId,
      status: record.status,
      projectSlug: slug,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
