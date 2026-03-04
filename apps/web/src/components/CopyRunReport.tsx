import { useState } from "react";
import { fetchJourneyResult, fetchRepoMeta, fetchOwnershipHints, fetchIssues, fetchCoverage, artifactUrl } from "../api";
import type { RunDetail, JourneyResult, RepoMetaFile, OwnershipHintsFile, IssuesFile, CoverageResponse } from "../types";

interface Props {
  runId: string;
  detail: RunDetail;
  journeyResults?: Map<string, JourneyResult>;
  projectSlug?: string;
}

/** Derive deduplicated warnings from a journey result. */
function deriveWarnings(result: JourneyResult): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of result.warnings ?? []) {
    if (!seen.has(w)) { seen.add(w); out.push(w); }
  }
  for (const step of result.steps) {
    if (step.status === "SOFT_FAIL") {
      const msg = step.error?.message ?? `Soft-fail at step "${step.name}"`;
      if (!seen.has(msg)) { seen.add(msg); out.push(msg); }
    }
  }
  return out;
}

async function generateRunReport(
  runId: string,
  detail: RunDetail,
  preloadedResults?: Map<string, JourneyResult>,
  projectSlug?: string,
): Promise<string> {
  const baseUrl = window.location.origin;
  const runIndex = detail.runIndex;
  if (!runIndex) return "_No run index available._";

  const missing: string[] = [];
  const lines: string[] = [];

  // Title
  lines.push("# Tensile Run Report", "");

  // Metadata
  lines.push("## Metadata");
  lines.push(`- **Run ID:** ${runId}`);
  lines.push(`- **Target URL:** ${runIndex.targetUrl}`);
  lines.push(`- **Env:** ${runIndex.envName}`);
  lines.push(`- **Started:** ${runIndex.startedAt}`);
  if (runIndex.endedAt) lines.push(`- **Ended:** ${runIndex.endedAt}`);
  const opts = detail.options;
  const optParts: string[] = [];
  if (opts.smoke) optParts.push("smoke");
  if (opts.discover) optParts.push("discover");
  if (opts.journeys) optParts.push(`journeys: ${opts.journeys}`);
  if (opts.maxPages) optParts.push(`maxPages: ${opts.maxPages}`);
  if (opts.maxDepth) optParts.push(`maxDepth: ${opts.maxDepth}`);
  if (opts.headless !== undefined) optParts.push(`headless: ${opts.headless}`);
  lines.push(`- **Options:** ${optParts.join(", ")}`);
  lines.push("");

  // Stage summary
  if (detail.stages) {
    lines.push("## Stages");
    const s = detail.stages;
    if (s.smoke) {
      lines.push(`- **Smoke:** ${s.smoke.status.toUpperCase()}${s.smoke.durationMs ? ` (${s.smoke.durationMs}ms)` : ""}`);
    }
    if (s.discovery) {
      const d = s.discovery;
      const parts = [d.status.toUpperCase()];
      if (d.pages !== undefined) parts.push(`${d.pages} pages`);
      if (d.actions !== undefined) parts.push(`${d.actions} actions`);
      if (d.candidates !== undefined) parts.push(`${d.candidates} candidates`);
      lines.push(`- **Discovery:** ${parts.join(", ")}`);
    }
    if (s.journeys) {
      const j = s.journeys;
      lines.push(`- **Journeys:** ${j.executed} executed, ${j.passed} passed, ${j.failed} failed${j.warned > 0 ? `, ${j.warned} warned` : ""}`);
    }
    lines.push("");
  }

  // Coverage section
  let coverageData: CoverageResponse | null = null;
  try {
    coverageData = await fetchCoverage(runId);
  } catch { /* ignore */ }

  if (coverageData) {
    lines.push("## Coverage");
    lines.push(`- Pages visited: ${coverageData.counts.pagesVisited}`);
    const actionParts = Object.entries(coverageData.actionsByType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type}: ${count}`);
    lines.push(`- Actions discovered: ${coverageData.counts.actionsDiscovered}${actionParts.length > 0 ? ` (${actionParts.join(", ")})` : ""}`);
    lines.push(`- Suggested tests: ${coverageData.counts.suggestedTests}`);
    lines.push(`- Executed tests: ${coverageData.counts.executedTests}`);
    lines.push(`- Clicks performed: ${coverageData.counts.clicksPerformed}`);
    if (coverageData.clicksPerformed.length > 0) {
      const topClicks = coverageData.clicksPerformed.slice(0, 10).map((c) => c.label);
      lines.push(`- Top clicks: ${topClicks.join(", ")}`);
    }
    lines.push("");
  }

  // Repo section
  let repoMeta: RepoMetaFile | null = null;
  try {
    repoMeta = await fetchRepoMeta(runId, projectSlug);
  } catch { missing.push("repo.meta.json"); }

  if (repoMeta && repoMeta.repos.length > 0) {
    lines.push("## Linked Repositories");
    for (const repo of repoMeta.repos) {
      const shortSha = repo.latestSha.slice(0, 7);
      const stackStr = [...repo.stack.frameworks, ...repo.stack.runtimes].join(", ");
      lines.push(`- **${repo.role}:** [${repo.owner}/${repo.repo}](${repo.url}) @ \`${shortSha}\` (${repo.defaultBranch})${stackStr ? ` — ${stackStr}` : ""}`);
    }
    lines.push("");
  }

  // Discovery section
  if (runIndex.discovery) {
    lines.push("## Discovery Summary");
    if (detail.stages?.discovery) {
      const d = detail.stages.discovery;
      if (d.pages !== undefined) lines.push(`- Pages discovered: ${d.pages}`);
      if (d.actions !== undefined) lines.push(`- Actions found: ${d.actions}`);
      if (d.candidates !== undefined) lines.push(`- Candidate journeys: ${d.candidates}`);
    }
    lines.push(`- [Full discovery report](${baseUrl}${artifactUrl(runId, runIndex.discovery.discoveryMdPath, projectSlug)})`);
    lines.push("");
  }

  // Fetch all journey results for detail (use preloaded if available)
  const journeyResults = new Map<string, JourneyResult>();
  for (const j of runIndex.journeys) {
    const preloaded = preloadedResults?.get(j.journeyId);
    if (preloaded) {
      journeyResults.set(j.journeyId, preloaded);
    } else {
      try {
        const result = await fetchJourneyResult(runId, j.resultPath, projectSlug);
        journeyResults.set(j.journeyId, result);
      } catch {
        missing.push(j.resultPath);
      }
    }
  }

  // Journeys table
  lines.push("## Journeys");
  lines.push("| Journey | Status | Duration | Notes |");
  lines.push("|---------|--------|----------|-------|");

  for (const j of runIndex.journeys) {
    const result = journeyResults.get(j.journeyId);
    const warnings = result ? deriveWarnings(result) : [];
    const notes: string[] = [];
    if (j.journeyId === "smoke") notes.push("smoke");
    if (warnings.length > 0) {
      notes.push(`${warnings.length} warning(s)`);
    }
    const displayStatus = j.status === "FAIL" ? "FAIL" : warnings.length > 0 ? "WARN" : "PASS";
    lines.push(`| ${j.name} | ${displayStatus} | ${j.durationMs}ms | ${notes.join(", ")} |`);
  }
  lines.push("");

  // Warnings Summary
  const allWarnings: { journeyName: string; warnings: string[] }[] = [];
  let totalWarnings = 0;
  for (const j of runIndex.journeys) {
    const result = journeyResults.get(j.journeyId);
    if (!result) continue;
    const warnings = deriveWarnings(result);
    if (warnings.length > 0) {
      allWarnings.push({ journeyName: j.name, warnings });
      totalWarnings += warnings.length;
    }
  }

  lines.push("## Warnings Summary");
  if (allWarnings.length === 0) {
    lines.push("No warnings.");
  } else {
    lines.push(`- **Warned journeys:** ${allWarnings.length}`);
    lines.push(`- **Total warnings:** ${totalWarnings}`);
    lines.push("");
    for (const item of allWarnings) {
      lines.push(`### ${item.journeyName}`);
      for (const w of item.warnings) {
        lines.push(`- ${w}`);
      }
      lines.push("");
    }
  }
  lines.push("");

  // Issues Summary (triage)
  let issuesFile: IssuesFile | null = null;
  try {
    issuesFile = await fetchIssues(runId, projectSlug);
  } catch { missing.push("issues.json"); }

  if (issuesFile && issuesFile.totalIssues > 0) {
    lines.push("## Issues Summary");
    lines.push(`- **Total issues:** ${issuesFile.totalIssues} (${issuesFile.totalOccurrences} occurrences)`);
    lines.push("");
    for (const issue of issuesFile.issues) {
      const uniqueJourneys = new Set(issue.occurrences.map((o) => o.journeyId)).size;
      lines.push(`### [${issue.severity}] ${issue.title} (${issue.count} occurrence${issue.count !== 1 ? "s" : ""})`);
      for (const occ of issue.occurrences) {
        lines.push(`- Journey: "${occ.journeyName}" → step "${occ.stepName}" — ${occ.errorMessage}`);
      }
      if (issue.ownershipHint) {
        lines.push(`- Ownership: likely ${issue.ownershipHint.likelyRepo} (${issue.ownershipHint.confidence} confidence)`);
      }
      lines.push("");
    }
  }

  // Failure details
  const failedJourneys = runIndex.journeys.filter((j) => j.status === "FAIL");
  let ownershipHints: OwnershipHintsFile | null = null;
  if (failedJourneys.length > 0) {
    try {
      ownershipHints = await fetchOwnershipHints(runId, projectSlug);
    } catch { missing.push("ownership.hints.json"); }

    lines.push("## Failures");
    for (const j of failedJourneys) {
      const result = journeyResults.get(j.journeyId);
      lines.push(`### ${j.name}`);
      if (result) {
        const failedSteps = result.steps.filter((s) => s.status === "FAIL");
        for (const s of failedSteps) {
          lines.push(`- **Failed step:** ${s.name}`);
          if (s.error) lines.push(`  - Error: ${s.error.message}`);
          if (s.failureKind) lines.push(`  - Kind: ${s.failureKind}`);
        }
        lines.push("");
        lines.push("**Artifacts:**");
        for (const a of result.artifacts) {
          lines.push(`- [${a.kind}](${baseUrl}${artifactUrl(runId, a.path, projectSlug)})`);
        }
      }

      // Ownership hint
      if (ownershipHints) {
        const hint = ownershipHints.hints.find((h) => h.journeyId === j.journeyId);
        if (hint) {
          lines.push("");
          lines.push(`**Ownership:** likely ${hint.likelyRepo} (${hint.confidence} confidence) — ${hint.reason}`);
          if (hint.relatedFiles.length > 0) {
            lines.push(`Related files: ${hint.relatedFiles.join(", ")}`);
          }
        }
      }
      lines.push("");
    }
  }

  // Footer
  lines.push("---");
  const artifactBase = projectSlug ? `/runs/${projectSlug}/${runId}/` : `/runs/${runId}/`;
  lines.push(`Base artifacts URL: ${baseUrl}${artifactBase}`);
  lines.push("Open trace locally: `npx playwright show-trace <trace.zip>`");

  if (missing.length > 0) {
    lines.push("", `_Some artifacts missing: ${missing.join(", ")}_`);
  }

  return lines.join("\n");
}

export function CopyRunReport({ runId, detail, journeyResults, projectSlug }: Props) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCopy = async () => {
    setLoading(true);
    try {
      const md = await generateRunReport(runId, detail, journeyResults, projectSlug);
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span>
      <button className="btn btn-sm btn-secondary" onClick={handleCopy} disabled={loading}>
        {loading ? "Generating..." : "Copy Report"}
      </button>
      {copied && <span className="copy-toast">Copied!</span>}
    </span>
  );
}
