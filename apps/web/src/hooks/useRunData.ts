import { useState, useEffect, useRef } from "react";
import {
  fetchRun,
  fetchJourneyResult,
  fetchIssues,
  fetchCoverage,
  fetchRepoMeta,
  fetchOwnershipHints,
  fetchPlannerSelection,
  fetchRunIndex,
} from "../api";
import type {
  RunDetail,
  RunIndex,
  RunIndexJourney,
  JourneyResult,
  IssuesFile,
  CoverageResponse,
  RepoMetaFile,
  OwnershipHintsFile,
  PlannerSelection,
  StageStats,
} from "../types";

export interface RunData {
  detail: RunDetail | null;
  journeyResults: Map<string, JourneyResult>;
  issues: IssuesFile | null;
  coverage: CoverageResponse | null;
  repoMeta: RepoMetaFile | null;
  ownershipHints: OwnershipHintsFile | null;
  plannerSelection: PlannerSelection | null;
  loading: boolean;
}

interface UseRunDataOptions {
  indexReady: boolean;
  stagesReady: boolean;
  issuesReady: boolean;
  repoMetaReady: boolean;
}

/** Derive all warnings from a JourneyResult. */
export function deriveWarnings(result: JourneyResult): string[] {
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

/** Compute display status for a journey row. */
export function getDisplayStatus(j: RunIndexJourney, result?: JourneyResult): "PASS" | "WARN" | "FAIL" {
  if (j.status === "FAIL") return "FAIL";
  if (result && deriveWarnings(result).length > 0) return "WARN";
  return "PASS";
}

/** Derive basic StageStats from a RunIndex so StageTimeline renders for historical runs. */
export function deriveStagesFromIndex(runIndex: RunIndex): StageStats {
  const stages: StageStats = {};
  const smoke = runIndex.journeys.find((j) => j.journeyId === "smoke");
  const nonSmoke = runIndex.journeys.filter((j) => j.journeyId !== "smoke");

  if (smoke) {
    stages.smoke = {
      status: smoke.status === "PASS" ? "pass" : "fail",
      durationMs: smoke.durationMs,
    };
  }

  if (runIndex.discovery) {
    stages.discovery = { status: "pass" };
  }

  if (nonSmoke.length > 0) {
    const passed = nonSmoke.filter((j) => j.status === "PASS").length;
    const failed = nonSmoke.filter((j) => j.status === "FAIL").length;
    stages.journeys = {
      status: failed > 0 ? "fail" : "pass",
      executed: nonSmoke.length,
      passed,
      failed,
      skipped: 0,
      warned: 0,
    };
  }

  return stages;
}

export interface WarningsSummary {
  totalWarnedJourneys: number;
  totalWarnings: number;
  items: { journeyId: string; journeyName: string; warnings: string[] }[];
}

export function useRunData(
  runId: string | null,
  projectSlug: string | undefined,
  options: UseRunDataOptions,
): RunData {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [journeyResults, setJourneyResults] = useState<Map<string, JourneyResult>>(new Map());
  const [issues, setIssues] = useState<IssuesFile | null>(null);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [repoMeta, setRepoMeta] = useState<RepoMetaFile | null>(null);
  const [ownershipHints, setOwnershipHints] = useState<OwnershipHintsFile | null>(null);
  const [plannerSelection, setPlannerSelection] = useState<PlannerSelection | null>(null);
  const [loading, setLoading] = useState(false);
  const terminalLoadedRef = useRef(false);

  // Reset on runId change, fetch initial detail
  useEffect(() => {
    setDetail(null);
    setJourneyResults(new Map());
    setIssues(null);
    setCoverage(null);
    setRepoMeta(null);
    setOwnershipHints(null);
    setPlannerSelection(null);
    terminalLoadedRef.current = false;
    if (!runId) return;
    setLoading(true);
    fetchRun(runId).then((d) => { setDetail(d); setLoading(false); });
  }, [runId]);

  // Terminal run effect: for completed/historical runs, fetch all data directly
  // without waiting for SSE flags (which won't fire for restored runs)
  useEffect(() => {
    if (!runId || !detail) return;
    if (detail.status === "running") return;
    if (terminalLoadedRef.current) return;
    terminalLoadedRef.current = true;

    // If runIndex is missing (old run not fully in memory), fetch from static files
    if (!detail.runIndex) {
      fetchRunIndex(runId, projectSlug).then((index) => {
        if (index) {
          setDetail((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              runIndex: index,
              stages: prev.stages ?? deriveStagesFromIndex(index),
            };
          });
        }
      });
    }

    // Fetch all supplementary data immediately
    fetchCoverage(runId).then(setCoverage);
    fetchIssues(runId, projectSlug).then(setIssues);
    fetchRepoMeta(runId, projectSlug).then(setRepoMeta);
    fetchOwnershipHints(runId, projectSlug).then(setOwnershipHints);
  }, [runId, detail, projectSlug]);

  // Re-fetch detail + coverage when stages ready
  useEffect(() => {
    if (!runId || !options.stagesReady) return;
    fetchRun(runId).then(setDetail);
    fetchCoverage(runId).then(setCoverage);
  }, [runId, options.stagesReady]);

  // Fetch issues when ready
  useEffect(() => {
    if (!runId || !options.issuesReady) return;
    fetchIssues(runId, projectSlug).then(setIssues);
  }, [runId, options.issuesReady, projectSlug]);

  // Fetch repo meta + ownership when ready
  useEffect(() => {
    if (!runId || !options.repoMetaReady) return;
    fetchRepoMeta(runId, projectSlug).then(setRepoMeta);
    fetchOwnershipHints(runId, projectSlug).then(setOwnershipHints);
  }, [runId, options.repoMetaReady, projectSlug]);

  // Fetch all journey results + planner when runIndex becomes available
  useEffect(() => {
    if (!runId || !detail?.runIndex) return;
    const journeys = detail.runIndex.journeys;

    if (journeys.length > 0) {
      const results = new Map<string, JourneyResult>();
      Promise.all(
        journeys.map(async (j) => {
          try {
            const r = await fetchJourneyResult(runId, j.resultPath, projectSlug);
            results.set(j.journeyId, r);
          } catch { /* ignore missing */ }
        }),
      ).then(() => setJourneyResults(new Map(results)));
    }

    // Fetch planner selection if discovery ran
    if (detail.runIndex.discovery) {
      fetchPlannerSelection(runId, projectSlug).then(setPlannerSelection);
    }
  }, [runId, detail?.runIndex, projectSlug]);

  return { detail, journeyResults, issues, coverage, repoMeta, ownershipHints, plannerSelection, loading };
}

/** Compute warnings summary from journeys + results. */
export function computeWarningsSummary(
  journeys: RunIndexJourney[],
  journeyResults: Map<string, JourneyResult>,
): WarningsSummary {
  const items: WarningsSummary["items"] = [];
  let totalWarnings = 0;
  for (const j of journeys) {
    const result = journeyResults.get(j.journeyId);
    if (!result) continue;
    const warnings = deriveWarnings(result);
    if (warnings.length > 0) {
      items.push({ journeyId: j.journeyId, journeyName: j.name, warnings });
      totalWarnings += warnings.length;
    }
  }
  return { totalWarnedJourneys: items.length, totalWarnings, items };
}
