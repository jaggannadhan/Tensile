import type { RunSummary, RunDetail, JourneyResult, RunOptions, RepoMetaFile, OwnershipHintsFile, IssuesFile, CoverageResponse, Project, PlannerSelection, RunIndex, ExcludedCandidate, PinnedTestSummary, PinnedTest, JourneySpec, StepEditPatch, ActionTarget, ExecutedJourneyRecord } from "./types";

export async function createRun(body: {
  url: string;
  options: RunOptions;
  repos?: Array<{ url: string; role: string }>;
}): Promise<{ runId: string; projectSlug?: string }> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchRuns(): Promise<RunSummary[]> {
  const res = await fetch("/api/runs");
  return res.json();
}

export async function fetchRun(id: string): Promise<RunDetail> {
  const res = await fetch(`/api/runs/${id}`);
  return res.json();
}

export async function stopRun(id: string): Promise<void> {
  await fetch(`/api/runs/${id}/stop`, { method: "POST" });
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  return res.json();
}

export async function fetchProjectRuns(slug: string): Promise<RunSummary[]> {
  const res = await fetch(`/api/projects/${slug}/runs`);
  return res.json();
}

export async function fetchJourneyResult(
  runId: string,
  resultPath: string,
  projectSlug?: string,
): Promise<JourneyResult> {
  const base = projectSlug ? `/runs/${projectSlug}/${runId}` : `/runs/${runId}`;
  const res = await fetch(`${base}/${resultPath}`);
  return res.json();
}

export function artifactUrl(runId: string, artifactPath: string, projectSlug?: string): string {
  return projectSlug
    ? `/runs/${projectSlug}/${runId}/${artifactPath}`
    : `/runs/${runId}/${artifactPath}`;
}

export async function fetchRepoMeta(runId: string, projectSlug?: string): Promise<RepoMetaFile | null> {
  try {
    const base = projectSlug ? `/runs/${projectSlug}/${runId}` : `/runs/${runId}`;
    const res = await fetch(`${base}/repo.meta.json`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchOwnershipHints(runId: string, projectSlug?: string): Promise<OwnershipHintsFile | null> {
  try {
    const base = projectSlug ? `/runs/${projectSlug}/${runId}` : `/runs/${runId}`;
    const res = await fetch(`${base}/ownership.hints.json`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchIssues(runId: string, projectSlug?: string): Promise<IssuesFile | null> {
  try {
    const base = projectSlug ? `/runs/${projectSlug}/${runId}` : `/runs/${runId}`;
    const res = await fetch(`${base}/issues.json`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchCoverage(runId: string): Promise<CoverageResponse | null> {
  try {
    const res = await fetch(`/api/runs/${runId}/coverage`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchRunIndex(runId: string, projectSlug?: string): Promise<RunIndex | null> {
  try {
    const base = projectSlug ? `/runs/${projectSlug}/${runId}` : `/runs/${runId}`;
    const res = await fetch(`${base}/run.index.json`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchExcludedCandidates(runId: string, projectSlug?: string): Promise<ExcludedCandidate[] | null> {
  try {
    const base = projectSlug ? `/runs/${projectSlug}/${runId}` : `/runs/${runId}`;
    const res = await fetch(`${base}/artifacts/discovery/journeys.excluded.json`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchPlannerSelection(runId: string, projectSlug?: string): Promise<PlannerSelection | null> {
  try {
    const base = projectSlug ? `/runs/${projectSlug}/${runId}` : `/runs/${runId}`;
    const res = await fetch(`${base}/artifacts/discovery/planner.selection.json`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// --- Healer / Modify Flow ---

export async function fetchPageActions(runId: string, projectSlug?: string): Promise<ActionTarget[] | null> {
  try {
    const base = projectSlug ? `/runs/${projectSlug}/${runId}` : `/runs/${runId}`;
    const res = await fetch(`${base}/artifacts/discovery/page.actions.json`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchExecutedJourneys(runId: string, projectSlug?: string): Promise<ExecutedJourneyRecord[] | null> {
  try {
    const base = projectSlug ? `/runs/${projectSlug}/${runId}` : `/runs/${runId}`;
    const res = await fetch(`${base}/artifacts/discovery/journeys.executed.json`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchPinnedTests(slug: string): Promise<PinnedTestSummary[]> {
  try {
    const res = await fetch(`/api/projects/${slug}/pinned-tests`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function createPinnedTest(slug: string, body: {
  baseRunId: string;
  baseJourneyId: string;
  name: string;
  journeySpec: JourneySpec;
  patches: StepEditPatch[];
  tags?: string[];
}): Promise<PinnedTest> {
  const res = await fetch(`/api/projects/${slug}/pinned-tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function runPinnedTest(slug: string, testId: string): Promise<{ runId: string; projectSlug: string }> {
  const res = await fetch(`/api/projects/${slug}/pinned-tests/${testId}/run`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deletePinnedTest(slug: string, testId: string): Promise<void> {
  await fetch(`/api/projects/${slug}/pinned-tests/${testId}`, { method: "DELETE" });
}

export async function repairJourney(runId: string, journeyId: string, patches: StepEditPatch[]): Promise<{ runId: string; pinnedTestId: string }> {
  const res = await fetch(`/api/runs/${runId}/journeys/${journeyId}/repair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patches }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
