import fs from "node:fs/promises";
import path from "node:path";
import type { IssuesFile } from "./triage.js";

export interface TargetResult {
  name: string;
  url: string;
  status: "PASS" | "WARN" | "FAIL";
  runId: string;
  outDir: string;
  exitCode: number;
  journeys: { executed: number; passed: number; failed: number; warned: number };
  issues: { total: number; s0: number; s1: number; s2: number; s3: number };
}

export interface CiSummary {
  runAt: string;
  overall: { status: "PASS" | "WARN" | "FAIL"; failures: number; warnings: number };
  targets: TargetResult[];
}

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

export function buildTargetResult(
  name: string,
  url: string,
  runId: string,
  outDir: string,
  exitCode: number,
  runIndex: RunIndex | null,
  issuesFile: IssuesFile | null,
): TargetResult {
  const journeys = runIndex
    ? {
        executed: runIndex.journeys.length,
        passed: runIndex.journeys.filter((j) => j.status === "PASS").length,
        failed: runIndex.journeys.filter((j) => j.status === "FAIL").length,
        warned: runIndex.journeys.filter(
          (j) => j.status !== "PASS" && j.status !== "FAIL",
        ).length,
      }
    : { executed: 0, passed: 0, failed: 0, warned: 0 };

  const issues = issuesFile
    ? {
        total: issuesFile.totalIssues,
        s0: issuesFile.issues.filter((i) => i.severity === "S0").length,
        s1: issuesFile.issues.filter((i) => i.severity === "S1").length,
        s2: issuesFile.issues.filter((i) => i.severity === "S2").length,
        s3: issuesFile.issues.filter((i) => i.severity === "S3").length,
      }
    : { total: 0, s0: 0, s1: 0, s2: 0, s3: 0 };

  let status: "PASS" | "WARN" | "FAIL" = "PASS";
  if (journeys.failed > 0 || exitCode !== 0) status = "FAIL";
  else if (journeys.warned > 0 || issues.s2 > 0 || issues.s3 > 0) status = "WARN";

  return { name, url, status, runId, outDir, exitCode, journeys, issues };
}

export function buildCiSummary(targets: TargetResult[]): CiSummary {
  const failures = targets.filter((t) => t.status === "FAIL").length;
  const warnings = targets.filter((t) => t.status === "WARN").length;

  let overall: "PASS" | "WARN" | "FAIL" = "PASS";
  if (failures > 0) overall = "FAIL";
  else if (warnings > 0) overall = "WARN";

  return {
    runAt: new Date().toISOString(),
    overall: { status: overall, failures, warnings },
    targets,
  };
}

export async function writeSummary(outDir: string, summary: CiSummary): Promise<void> {
  await fs.writeFile(
    path.join(outDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
}
