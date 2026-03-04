import fs from "node:fs/promises";
import path from "node:path";
import type { Occurrence, ArtifactRef } from "./types.js";

interface JourneyResultFile {
  journeyId: string;
  name: string;
  status: string;
  steps: Array<{
    index: number;
    name: string;
    status: string;
    startedAt: string;
    endedAt: string;
    error?: { message: string; stack?: string };
    failureKind?: string;
    artifacts?: ArtifactRef[];
  }>;
  summary?: { url: string; httpStatus?: number; title?: string };
  artifacts: ArtifactRef[];
}

interface RunIndexJourney {
  journeyId: string;
  name: string;
  status: string;
  durationMs: number;
  resultPath: string;
}

/**
 * Read all journey results and extract FAIL / SOFT_FAIL step occurrences.
 */
export async function extractOccurrences(
  outDir: string,
  journeys: RunIndexJourney[],
): Promise<Occurrence[]> {
  const occurrences: Occurrence[] = [];

  for (const j of journeys) {
    let result: JourneyResultFile;
    try {
      const raw = await fs.readFile(path.join(outDir, j.resultPath), "utf-8");
      result = JSON.parse(raw);
    } catch {
      continue; // skip unreadable results
    }

    // Collect screenshot artifacts from the journey level for evidence
    const journeyScreenshots = result.artifacts.filter(
      (a) => a.kind === "screenshot" || a.kind === "step_screenshot",
    );

    for (const step of result.steps) {
      if (step.status !== "FAIL" && step.status !== "SOFT_FAIL") continue;

      const stepArtifacts = step.artifacts ?? [];
      const evidence = [...stepArtifacts, ...journeyScreenshots];

      occurrences.push({
        journeyId: result.journeyId,
        journeyName: result.name,
        stepIndex: step.index,
        stepName: step.name,
        status: step.status as "FAIL" | "SOFT_FAIL",
        errorMessage: step.error?.message ?? `Step "${step.name}" ${step.status.toLowerCase()}`,
        failureKind: step.failureKind,
        url: result.summary?.url,
        httpStatus: result.summary?.httpStatus,
        artifacts: evidence,
      });
    }
  }

  return occurrences;
}
