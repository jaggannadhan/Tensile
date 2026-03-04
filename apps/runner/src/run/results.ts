import type { JourneyResult, RunIndex, RunIndexJourney, RunConfig } from "@web-qa-agent/shared";
import {
  journeyResultPath,
  runIndexPath,
  toRelative,
} from "../artifacts/layout.js";
import { writeJsonFile, assertRelativePath } from "../artifacts/writer.js";

function normalizeArtifactPaths(result: JourneyResult): JourneyResult {
  const normalized = { ...result };
  normalized.artifacts = result.artifacts.map((a) => {
    assertRelativePath(a.path);
    return a;
  });
  normalized.steps = result.steps.map((s) => ({
    ...s,
    artifacts: s.artifacts?.map((a) => {
      assertRelativePath(a.path);
      return a;
    }),
  }));
  return normalized;
}

export async function writeJourneyResult(
  outDir: string,
  result: JourneyResult,
): Promise<void> {
  const filePath = journeyResultPath(outDir, result.journeyId);
  const safe = normalizeArtifactPaths(result);
  await writeJsonFile(filePath, safe);
}

export async function writeRunIndex(
  config: RunConfig,
  journeys: JourneyResult[],
  discovery?: RunIndex["discovery"],
): Promise<void> {
  const entries: RunIndexJourney[] = journeys.map((j) => ({
    journeyId: j.journeyId,
    name: j.name,
    status: j.status,
    durationMs: j.durationMs,
    resultPath: toRelative(
      config.outDir,
      journeyResultPath(config.outDir, j.journeyId),
    ),
  }));

  const index: RunIndex = {
    runId: config.runId,
    targetUrl: config.url,
    envName: config.env,
    startedAt: config.startedAt,
    endedAt: new Date().toISOString(),
    journeys: entries,
    discovery,
  };

  await writeJsonFile(runIndexPath(config.outDir), index);
}
