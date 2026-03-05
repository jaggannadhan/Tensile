import { useState } from "react";
import type { JourneyResult, RepoMetaFile, OwnershipHint } from "../types";

interface Props {
  result: JourneyResult;
  runId: string;
  repoMeta?: RepoMetaFile | null;
  ownershipHint?: OwnershipHint | null;
  projectSlug?: string;
}

function generateBugReport(
  r: JourneyResult,
  runId: string,
  repoMeta?: RepoMetaFile | null,
  ownershipHint?: OwnershipHint | null,
): string {
  const failedSteps = (r.steps ?? []).filter((s) => s.status === "FAIL");
  const lines: string[] = [
    `## Bug Report: ${r.name}`,
    "",
    `**Status:** ${r.status}`,
    `**Journey ID:** ${r.journeyId}`,
    `**Run ID:** ${runId}`,
    `**Duration:** ${r.durationMs}ms`,
  ];

  if (r.summary) {
    lines.push(`**URL:** ${r.summary.url}`);
    if (r.summary.httpStatus !== undefined) {
      lines.push(`**HTTP Status:** ${r.summary.httpStatus}`);
    }
    if (r.summary.title) {
      lines.push(`**Page Title:** ${r.summary.title}`);
    }
  }

  if (repoMeta && repoMeta.repos.length > 0) {
    lines.push("", "### Linked Repositories");
    for (const repo of repoMeta.repos) {
      const shortSha = repo.latestSha.slice(0, 7);
      const stackStr = [...repo.stack.frameworks, ...repo.stack.runtimes].join(", ");
      lines.push(`- **${repo.role}:** [${repo.owner}/${repo.repo}](${repo.url}) @ \`${shortSha}\`${stackStr ? ` (${stackStr})` : ""}`);
    }
  }

  if (ownershipHint) {
    lines.push("", "### Ownership Analysis");
    lines.push(`- **Likely owner:** ${ownershipHint.likelyRepo} (${ownershipHint.confidence} confidence)`);
    lines.push(`- **Reason:** ${ownershipHint.reason}`);
    if (ownershipHint.failedUrl) {
      lines.push(`- **Failed URL:** ${ownershipHint.httpMethod ?? "GET"} ${ownershipHint.failedUrl}${ownershipHint.httpStatus ? ` (${ownershipHint.httpStatus})` : ""}`);
    }
    if (ownershipHint.relatedFiles.length > 0) {
      lines.push(`- **Related files:** ${ownershipHint.relatedFiles.join(", ")}`);
    }
  }

  lines.push("", "### Steps");
  for (const s of r.steps ?? []) {
    lines.push(
      `${s.index + 1}. [${s.status}] ${s.name} (${s.durationMs}ms)`,
    );
    if (s.error) {
      lines.push(`   > Error: ${s.error.message}`);
    }
  }

  if (failedSteps.length > 0) {
    lines.push("", "### Failed Steps");
    for (const s of failedSteps) {
      lines.push(`- **${s.name}**`);
      if (s.failureKind) lines.push(`  - Kind: ${s.failureKind}`);
      if (s.error) lines.push(`  - Error: ${s.error.message}`);
    }
  }

  lines.push("", "### Artifacts");
  for (const a of r.artifacts) {
    lines.push(`- [${a.kind}] ${a.path}`);
  }

  return lines.join("\n");
}

export function CopyBugReport({ result, runId, repoMeta, ownershipHint, projectSlug }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const md = generateBugReport(result, runId, repoMeta, ownershipHint);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span>
      <button className="btn btn-sm btn-secondary" onClick={handleCopy}>
        Copy Bug Report
      </button>
      {copied && <span className="copy-toast">Copied!</span>}
    </span>
  );
}
