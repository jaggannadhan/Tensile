import fs from "node:fs/promises";
import path from "node:path";
import type { CiSummary } from "./summarize.js";

export function generateReport(summary: CiSummary): string {
  const lines: string[] = [];

  lines.push("# Tensile CI Report");
  lines.push("");
  lines.push(`**Status:** ${summary.overall.status} | **Ran at:** ${summary.runAt}`);
  lines.push("");

  for (const t of summary.targets) {
    lines.push(`## ${t.name}`);
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| URL | ${t.url} |`);
    lines.push(`| Status | ${t.status} |`);
    lines.push(
      `| Journeys | ${t.journeys.executed} executed, ${t.journeys.passed} passed, ${t.journeys.failed} failed |`,
    );
    lines.push(
      `| Issues | ${t.issues.total} (${t.issues.s0} S0, ${t.issues.s1} S1, ${t.issues.s2} S2, ${t.issues.s3} S3) |`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeReport(outDir: string, summary: CiSummary): Promise<void> {
  const content = generateReport(summary);
  await fs.writeFile(path.join(outDir, "report.md"), content);
}
