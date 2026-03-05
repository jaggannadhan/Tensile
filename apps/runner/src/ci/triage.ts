import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

// ---------- Types ----------

export interface ArtifactRef {
  kind: string;
  path: string;
}

export interface Occurrence {
  journeyId: string;
  journeyName: string;
  stepIndex: number;
  stepName: string;
  status: "FAIL" | "SOFT_FAIL";
  errorMessage: string;
  failureKind?: string;
  url?: string;
  httpStatus?: number;
  artifacts: ArtifactRef[];
}

export interface Issue {
  issueId: string;
  signature: string;
  severity: "S0" | "S1" | "S2" | "S3";
  title: string;
  occurrences: Occurrence[];
  count: number;
  firstSeen: string;
  evidenceLinks: ArtifactRef[];
}

export interface IssuesFile {
  issues: Issue[];
  totalOccurrences: number;
  totalIssues: number;
  computedAt: string;
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

// ---------- Normalize ----------

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_PATH_ID_RE = /\/\d+(?=\/|$)/g;
const PORT_RE = /:\d{4,5}(?=\/|$)/g;
const TIMING_MS_RE = /\d+\s*ms/g;

function normalizeSignature(errorMessage: string, url?: string): string {
  let msg = errorMessage.split("\n")[0];
  msg = msg.replace(UUID_RE, ":uuid");
  msg = msg.replace(NUMERIC_PATH_ID_RE, "/:id");
  msg = msg.replace(PORT_RE, ":port");
  msg = msg.replace(TIMING_MS_RE, "Nms");
  let sig = msg.toLowerCase().trim();
  if (url) {
    try {
      const u = new URL(url);
      let p = u.pathname;
      p = p.replace(UUID_RE, ":uuid");
      p = p.replace(NUMERIC_PATH_ID_RE, "/:id");
      sig = `[${p}] ${sig}`;
    } catch { /* skip */ }
  }
  return sig;
}

// ---------- Extract ----------

interface JourneyResultFile {
  journeyId: string;
  name: string;
  status: string;
  steps: Array<{
    index: number;
    name: string;
    status: string;
    error?: { message: string };
    failureKind?: string;
    artifacts?: ArtifactRef[];
  }>;
  summary?: { url: string; httpStatus?: number };
  artifacts: ArtifactRef[];
}

async function extractOccurrences(
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
      continue;
    }

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

// ---------- Cluster ----------

const SEVERITY_ORDER: Record<string, number> = { S0: 0, S1: 1, S2: 2, S3: 3 };

function computeSeverity(
  worstStatus: "FAIL" | "SOFT_FAIL",
  count: number,
): "S0" | "S1" | "S2" | "S3" {
  if (worstStatus === "FAIL") return count >= 2 ? "S0" : "S1";
  return count >= 2 ? "S2" : "S3";
}

function makeIssueId(signature: string): string {
  return createHash("sha256").update(signature).digest("hex").slice(0, 12);
}

function clusterOccurrences(occurrences: Occurrence[]): Issue[] {
  const groups = new Map<string, Occurrence[]>();
  for (const occ of occurrences) {
    const sig = normalizeSignature(occ.errorMessage, occ.url);
    const group = groups.get(sig);
    if (group) group.push(occ);
    else groups.set(sig, [occ]);
  }

  const issues: Issue[] = [];
  for (const [signature, group] of groups) {
    const worstStatus = group.some((o) => o.status === "FAIL") ? "FAIL" : "SOFT_FAIL";
    const severity = computeSeverity(worstStatus, group.length);

    let title = group[0].errorMessage.split("\n")[0];
    if (title.length > 120) title = title.slice(0, 117) + "...";

    const allArtifacts: ArtifactRef[] = [];
    const seen = new Set<string>();
    for (const occ of group) {
      for (const a of occ.artifacts) {
        const key = `${a.kind}:${a.path}`;
        if (!seen.has(key)) { seen.add(key); allArtifacts.push(a); }
      }
    }

    issues.push({
      issueId: makeIssueId(signature),
      signature,
      severity,
      title,
      occurrences: group,
      count: group.length,
      firstSeen: group[0].journeyId,
      evidenceLinks: allArtifacts,
    });
  }

  issues.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 4;
    const sb = SEVERITY_ORDER[b.severity] ?? 4;
    if (sa !== sb) return sa - sb;
    return b.count - a.count;
  });

  return issues;
}

// ---------- Public API ----------

export async function computeIssuesForCi(
  outDir: string,
  runIndex: RunIndex,
): Promise<IssuesFile> {
  const occurrences = await extractOccurrences(outDir, runIndex.journeys);

  const empty: IssuesFile = {
    issues: [],
    totalOccurrences: 0,
    totalIssues: 0,
    computedAt: new Date().toISOString(),
  };

  if (occurrences.length === 0) {
    await fs.writeFile(path.join(outDir, "issues.json"), JSON.stringify(empty, null, 2));
    return empty;
  }

  const issues = clusterOccurrences(occurrences);

  const result: IssuesFile = {
    issues,
    totalOccurrences: occurrences.length,
    totalIssues: issues.length,
    computedAt: new Date().toISOString(),
  };

  await fs.writeFile(path.join(outDir, "issues.json"), JSON.stringify(result, null, 2));
  return result;
}
