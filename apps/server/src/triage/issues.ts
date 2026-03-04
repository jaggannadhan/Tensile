import fs from "node:fs/promises";
import path from "node:path";
import { extractOccurrences } from "./extract.js";
import { clusterOccurrences } from "./cluster.js";
import type { IssuesFile } from "./types.js";

interface RunIndexJourney {
  journeyId: string;
  name: string;
  status: string;
  durationMs: number;
  resultPath: string;
}

interface RunIndex {
  journeys: RunIndexJourney[];
}

interface OwnershipHint {
  journeyId: string;
  journeyName: string;
  likelyRepo: string;
  reason: string;
  confidence: string;
}

interface OwnershipHintsFile {
  hints: OwnershipHint[];
}

/**
 * Main triage entry point: extract occurrences → cluster → cross-reference
 * ownership → write issues.json.
 */
export async function computeIssues(
  outDir: string,
  runIndex: RunIndex,
  ownershipHints?: OwnershipHintsFile,
): Promise<IssuesFile> {
  const occurrences = await extractOccurrences(outDir, runIndex.journeys);

  const empty: IssuesFile = {
    issues: [],
    totalOccurrences: 0,
    totalIssues: 0,
    computedAt: new Date().toISOString(),
  };

  if (occurrences.length === 0) {
    await fs.writeFile(
      path.join(outDir, "issues.json"),
      JSON.stringify(empty, null, 2),
    );
    return empty;
  }

  const issues = clusterOccurrences(occurrences);

  // Cross-reference ownership hints
  if (ownershipHints) {
    for (const issue of issues) {
      // Find first matching hint for any occurrence's journeyId
      for (const occ of issue.occurrences) {
        const hint = ownershipHints.hints.find((h) => h.journeyId === occ.journeyId);
        if (hint) {
          issue.ownershipHint = {
            likelyRepo: hint.likelyRepo,
            confidence: hint.confidence,
            reason: hint.reason,
          };
          break;
        }
      }
    }
  }

  const result: IssuesFile = {
    issues,
    totalOccurrences: occurrences.length,
    totalIssues: issues.length,
    computedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(outDir, "issues.json"),
    JSON.stringify(result, null, 2),
  );

  return result;
}
