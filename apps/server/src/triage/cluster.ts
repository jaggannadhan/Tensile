import { createHash } from "node:crypto";
import { normalizeSignature } from "./normalize.js";
import type { Occurrence, Issue, ArtifactRef } from "./types.js";

const SEVERITY_ORDER: Record<string, number> = { S0: 0, S1: 1, S2: 2, S3: 3 };

function computeSeverity(
  worstStatus: "FAIL" | "SOFT_FAIL",
  count: number,
): "S0" | "S1" | "S2" | "S3" {
  if (worstStatus === "FAIL") {
    return count >= 2 ? "S0" : "S1";
  }
  return count >= 2 ? "S2" : "S3";
}

function makeIssueId(signature: string): string {
  return createHash("sha256").update(signature).digest("hex").slice(0, 12);
}

function dedupeArtifacts(artifacts: ArtifactRef[]): ArtifactRef[] {
  const seen = new Set<string>();
  const out: ArtifactRef[] = [];
  for (const a of artifacts) {
    const key = `${a.kind}:${a.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

/**
 * Group occurrences by normalized error signature into deduplicated Issues.
 */
export function clusterOccurrences(occurrences: Occurrence[]): Issue[] {
  // Group by signature
  const groups = new Map<string, Occurrence[]>();
  for (const occ of occurrences) {
    const sig = normalizeSignature(occ.errorMessage, occ.url);
    const group = groups.get(sig);
    if (group) {
      group.push(occ);
    } else {
      groups.set(sig, [occ]);
    }
  }

  // Build Issues from groups
  const issues: Issue[] = [];
  for (const [signature, group] of groups) {
    const worstStatus = group.some((o) => o.status === "FAIL") ? "FAIL" : "SOFT_FAIL";
    const severity = computeSeverity(worstStatus, group.length);

    // Title from first occurrence, truncated
    let title = group[0].errorMessage.split("\n")[0];
    if (title.length > 120) {
      title = title.slice(0, 117) + "...";
    }

    // Earliest timestamp
    const allArtifacts: ArtifactRef[] = [];
    for (const occ of group) {
      allArtifacts.push(...occ.artifacts);
    }

    issues.push({
      issueId: makeIssueId(signature),
      signature,
      severity,
      title,
      occurrences: group,
      count: group.length,
      firstSeen: group[0].journeyId, // will be refined in issues.ts if timestamps available
      evidenceLinks: dedupeArtifacts(allArtifacts),
    });
  }

  // Sort: severity ascending (S0 first), then count descending
  issues.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 4;
    const sb = SEVERITY_ORDER[b.severity] ?? 4;
    if (sa !== sb) return sa - sb;
    return b.count - a.count;
  });

  return issues;
}
