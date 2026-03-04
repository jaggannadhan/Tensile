import fs from "node:fs/promises";
import path from "node:path";

// --- Local artifact shape interfaces ---

interface PageNode {
  url: string;
  depth: number;
  title?: string;
}

interface ActionTarget {
  pageUrl: string;
  actionType: string;
  selector: string;
  humanLabel: string;
}

interface CandidateJourney {
  id: string;
  name: string;
  priority?: string;
  score?: number;
  tags?: string[];
}

interface StepResultEntry {
  index: number;
  name: string;
  status: string;
  actionType?: string;
  selector?: { strategy: string; primary: string };
  label?: string;
}

interface JourneyResultFile {
  journeyId: string;
  name: string;
  status: string;
  steps: StepResultEntry[];
  summary?: { url: string };
}

interface RunIndexFile {
  runId: string;
  targetUrl: string;
  journeys: Array<{ journeyId: string; name: string; status: string; durationMs?: number; resultPath: string }>;
  discovery?: {
    siteMapPath: string;
    actionsPath: string;
    candidatesPath: string;
  };
}

// --- CoverageResponse shape ---

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

const CLICKS_CAP = 200;

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function computeCoverage(outDir: string, runId: string): Promise<CoverageResponse> {
  // A) Load run.index.json
  const runIndex = await readJson<RunIndexFile>(path.join(outDir, "run.index.json"));
  if (!runIndex) {
    throw new Error("run.index.json not found or invalid");
  }

  const targetUrl = runIndex.targetUrl;
  const hasSmoke = runIndex.journeys.some((j) => j.journeyId === "smoke");
  const hasDiscovery = !!runIndex.discovery;
  const hasJourneys = runIndex.journeys.some((j) => j.journeyId !== "smoke");

  // B) Load discovery artifacts
  let pagesVisited: CoverageResponse["pagesVisited"] = [];
  const actionsByType: Record<string, number> = {};
  let actionsDiscovered = 0;
  let suggestedTests: CoverageResponse["suggestedTests"] = [];

  if (runIndex.discovery) {
    // site.map.json
    const pages = await readJson<PageNode[]>(path.join(outDir, runIndex.discovery.siteMapPath));
    if (pages) {
      pagesVisited = pages.map((p) => ({ url: p.url, depth: p.depth, title: p.title }));
    }

    // page.actions.json
    const actions = await readJson<ActionTarget[]>(path.join(outDir, runIndex.discovery.actionsPath));
    if (actions) {
      actionsDiscovered = actions.length;
      for (const a of actions) {
        actionsByType[a.actionType] = (actionsByType[a.actionType] ?? 0) + 1;
      }
    }

    // journeys.candidates.json
    const candidates = await readJson<CandidateJourney[]>(path.join(outDir, runIndex.discovery.candidatesPath));
    if (candidates) {
      suggestedTests = candidates.map((c) => ({
        id: c.id,
        name: c.name,
        priority: c.priority,
        score: c.score,
        tags: c.tags,
      }));
    }
  }

  // C) Load executed journeys
  const executedTests: CoverageResponse["executedTests"] = [];
  for (const j of runIndex.journeys) {
    executedTests.push({
      journeyId: j.journeyId,
      name: j.name,
      status: j.status,
      durationMs: j.durationMs,
    });
  }

  // D) Extract clicks performed — read actionType directly from step metadata
  const clicksPerformed: CoverageResponse["clicksPerformed"] = [];

  for (const j of runIndex.journeys) {
    if (clicksPerformed.length >= CLICKS_CAP) break;

    const result = await readJson<JourneyResultFile>(path.join(outDir, j.resultPath));
    if (!result) continue;

    for (const step of result.steps) {
      if (clicksPerformed.length >= CLICKS_CAP) break;
      if (step.actionType !== "click") continue;

      clicksPerformed.push({
        journeyId: j.journeyId,
        journeyName: j.name,
        stepIndex: step.index,
        label: step.label ?? step.name,
        selector: step.selector
          ? { strategy: step.selector.strategy, query: step.selector.primary }
          : null,
        status: step.status,
        pageUrl: result.summary?.url ?? targetUrl,
      });
    }
  }

  // E) Coverage by page
  const pageMap = new Map<string, { journeys: Map<string, string>; clickLabels: Set<string> }>();
  for (const click of clicksPerformed) {
    const pageUrl = click.pageUrl ?? targetUrl;
    let entry = pageMap.get(pageUrl);
    if (!entry) {
      entry = { journeys: new Map(), clickLabels: new Set() };
      pageMap.set(pageUrl, entry);
    }
    entry.journeys.set(click.journeyId, click.journeyName);
    entry.clickLabels.add(click.label);
  }

  const coverageByPage: CoverageResponse["coverageByPage"] = [];
  for (const [pageUrl, entry] of pageMap) {
    coverageByPage.push({
      pageUrl,
      journeys: Array.from(entry.journeys.entries()).map(([journeyId, journeyName]) => ({
        journeyId,
        journeyName,
      })),
      clickLabels: Array.from(entry.clickLabels),
    });
  }

  return {
    runId,
    targetUrl,
    stages: { smoke: hasSmoke, discovery: hasDiscovery, journeys: hasJourneys },
    counts: {
      pagesVisited: pagesVisited.length,
      actionsDiscovered,
      suggestedTests: suggestedTests.length,
      executedTests: executedTests.length,
      clicksPerformed: clicksPerformed.length,
    },
    pagesVisited,
    actionsByType,
    suggestedTests,
    executedTests,
    clicksPerformed,
    coverageByPage,
    explain: {
      suggested: "Candidate tests auto-generated from discovered pages, links, and interactive elements.",
      executed: "The subset actually run, chosen by score ranking and safety policy (Top N selection).",
    },
  };
}
