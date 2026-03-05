import { useState, useEffect, useMemo } from "react";
import { fetchRun, fetchJourneyResult, fetchIssues, fetchCoverage } from "../api";
import { JourneyDetails } from "./JourneyDetails";
import { RepoCards } from "./RepoCards";
import { StageCards } from "./StageCards";
import { CopyRunReport } from "./CopyRunReport";
import { IssuesList } from "./IssuesList";
import { CoveragePanel } from "./CoveragePanel";
import type { RunDetail, RunIndexJourney, JourneyResult, IssuesFile, CoverageResponse } from "../types";

interface Props {
  runId: string;
  repoMetaReady: boolean;
  stagesReady: boolean;
  issuesReady: boolean;
  projectSlug?: string;
}

/** Derive all warnings from a JourneyResult: primary from .warnings[], fallback from SOFT_FAIL steps. */
function deriveWarnings(result: JourneyResult): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  // Primary: journey-level warnings
  for (const w of result.warnings ?? []) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }

  // Secondary: SOFT_FAIL steps not already covered
  for (const step of result.steps ?? []) {
    if (step.status === "SOFT_FAIL") {
      const msg = step.error?.message ?? `Soft-fail at step "${step.name}"`;
      if (!seen.has(msg)) {
        seen.add(msg);
        out.push(msg);
      }
    }
  }

  return out;
}

/** Compute display status for a journey row. */
function getDisplayStatus(j: RunIndexJourney, result?: JourneyResult): "PASS" | "WARN" | "FAIL" {
  if (j.status === "FAIL") return "FAIL";
  if (result && deriveWarnings(result).length > 0) return "WARN";
  return "PASS";
}

interface WarningsSummary {
  totalWarnedJourneys: number;
  totalWarnings: number;
  items: { journeyId: string; journeyName: string; warnings: string[] }[];
}

export function RunSummary({ runId, repoMetaReady, stagesReady, issuesReady, projectSlug }: Props) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [journeyResults, setJourneyResults] = useState<Map<string, JourneyResult>>(new Map());
  const [warningsExpanded, setWarningsExpanded] = useState<boolean | null>(null);
  const [issues, setIssues] = useState<IssuesFile | null>(null);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);

  // Initial fetch + re-fetch when stages become ready
  useEffect(() => {
    setDetail(null);
    setExpanded(null);
    setJourneyResults(new Map());
    setWarningsExpanded(null);
    fetchRun(runId).then(setDetail);
  }, [runId]);

  useEffect(() => {
    if (stagesReady) {
      fetchRun(runId).then(setDetail);
    }
  }, [runId, stagesReady]);

  // Fetch triage issues when ready
  useEffect(() => {
    if (issuesReady) {
      fetchIssues(runId, projectSlug).then(setIssues);
    }
  }, [runId, issuesReady]);

  // Fetch coverage (compute-on-request, available once stages are done)
  useEffect(() => {
    if (stagesReady) {
      fetchCoverage(runId).then(setCoverage);
    }
  }, [runId, stagesReady]);

  // Fetch journey results for warnings detection
  useEffect(() => {
    if (!detail?.runIndex) return;
    const journeys = detail.runIndex.journeys;
    if (journeys.length === 0) return;

    const results = new Map<string, JourneyResult>();
    Promise.all(
      journeys.map(async (j) => {
        try {
          const r = await fetchJourneyResult(runId, j.resultPath, projectSlug);
          results.set(j.journeyId, r);
        } catch { /* ignore missing results */ }
      }),
    ).then(() => setJourneyResults(new Map(results)));
  }, [detail?.runIndex, runId]);

  // Compute warnings aggregate
  const warningsSummary = useMemo<WarningsSummary>(() => {
    const items: WarningsSummary["items"] = [];
    let totalWarnings = 0;
    for (const j of detail?.runIndex?.journeys ?? []) {
      const result = journeyResults.get(j.journeyId);
      if (!result) continue;
      const warnings = deriveWarnings(result);
      if (warnings.length > 0) {
        items.push({ journeyId: j.journeyId, journeyName: j.name, warnings });
        totalWarnings += warnings.length;
      }
    }
    return { totalWarnedJourneys: items.length, totalWarnings, items };
  }, [detail?.runIndex, journeyResults]);

  // Auto-expand warnings panel when warnings exist (only on first load)
  useEffect(() => {
    if (warningsExpanded === null && warningsSummary.totalWarnings > 0) {
      setWarningsExpanded(true);
    }
  }, [warningsSummary, warningsExpanded]);

  if (!detail?.runIndex) {
    return (
      <div className="summary">
        <div style={{ color: "var(--text-muted)" }}>Loading summary...</div>
      </div>
    );
  }

  const { runIndex } = detail;
  const duration =
    runIndex.endedAt && runIndex.startedAt
      ? new Date(runIndex.endedAt).getTime() - new Date(runIndex.startedAt).getTime()
      : null;

  const smokeJourney = runIndex.journeys.find((j) => j.journeyId === "smoke");
  const nonSmokeJourneys = runIndex.journeys.filter((j) => j.journeyId !== "smoke");

  // Status counts
  const allJourneys = runIndex.journeys;
  const passCount = allJourneys.filter((j) => getDisplayStatus(j, journeyResults.get(j.journeyId)) === "PASS").length;
  const warnCount = allJourneys.filter((j) => getDisplayStatus(j, journeyResults.get(j.journeyId)) === "WARN").length;
  const failCount = allJourneys.filter((j) => j.status === "FAIL").length;

  const showWarningsPanel = warningsSummary.totalWarnings > 0;
  const isWarningsOpen = warningsExpanded ?? false;

  return (
    <div className="summary">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Run Summary</h3>
        <CopyRunReport runId={runId} detail={detail} journeyResults={journeyResults} projectSlug={projectSlug} />
      </div>
      <div className="summary-meta">
        <div>Target: {runIndex.targetUrl}</div>
        <div>Env: {runIndex.envName}</div>
        {duration !== null && <div>Duration: {duration}ms</div>}
      </div>

      <StageCards stages={detail.stages} options={detail.options} />

      {coverage && <CoveragePanel coverage={coverage} />}

      {/* Status counts */}
      {allJourneys.length > 0 && (
        <div className="status-counts">
          <div className="status-count">
            <span className="ui-badge badge badge-PASS" style={{ fontSize: 10 }}>PASS</span>
            <span className="status-count-value status-count-pass">{passCount}</span>
          </div>
          <div className="status-count">
            <span className="ui-badge badge badge-WARN" style={{ fontSize: 10 }}>WARN</span>
            <span className="status-count-value status-count-warn">{warnCount}</span>
          </div>
          <div className="status-count">
            <span className="ui-badge badge badge-FAIL" style={{ fontSize: 10 }}>FAIL</span>
            <span className="status-count-value status-count-fail">{failCount}</span>
          </div>
        </div>
      )}

      {/* Warnings panel */}
      {showWarningsPanel && (
        <div className="warnings-panel">
          <div
            className="warnings-panel-header"
            onClick={() => setWarningsExpanded(!isWarningsOpen)}
          >
            <span>
              Warnings ({warningsSummary.totalWarnedJourneys} journey{warningsSummary.totalWarnedJourneys !== 1 ? "s" : ""}, {warningsSummary.totalWarnings} total)
            </span>
            <span className="warnings-panel-toggle">{isWarningsOpen ? "collapse" : "expand"}</span>
          </div>
          {isWarningsOpen && (
            <div className="warnings-panel-body">
              {warningsSummary.items.map((item) => (
                <div key={item.journeyId} className="warnings-journey-group">
                  <div className="warnings-journey-name">{item.journeyName}</div>
                  <ul className="warnings-list">
                    {item.warnings.slice(0, 20).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {item.warnings.length > 20 && (
                      <li style={{ color: "var(--text-muted)" }}>... +{item.warnings.length - 20} more</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {issues && issues.totalIssues > 0 && (
        <IssuesList issues={issues} runId={runId} />
      )}

      <RepoCards runId={runId} repoMetaReady={repoMetaReady} projectSlug={projectSlug} />

      {/* Smoke journey */}
      {smokeJourney && (
        <>
          <h5 style={{ margin: "12px 0 4px" }}>Smoke</h5>
          {renderJourneyTable([smokeJourney], smokeJourney.journeyId)}
          {expanded === smokeJourney.journeyId && (
            <JourneyDetails runId={runId} resultPath={smokeJourney.resultPath} projectSlug={projectSlug} />
          )}
        </>
      )}

      {/* Non-smoke journeys */}
      {nonSmokeJourneys.length > 0 ? (
        <>
          <h5 style={{ margin: "12px 0 4px" }}>Journeys</h5>
          {renderJourneyTable(nonSmokeJourneys)}
          {expanded && expanded !== smokeJourney?.journeyId && (
            <JourneyDetails
              runId={runId}
              resultPath={nonSmokeJourneys.find((j) => j.journeyId === expanded)!.resultPath}
              projectSlug={projectSlug}
            />
          )}
        </>
      ) : detail.options.journeys && detail.options.journeys !== "none" ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12 }}>
          No discovered journeys executed. Discovery may not have found candidates for this site.
        </div>
      ) : null}

      {!smokeJourney && nonSmokeJourneys.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No journeys in this run.</div>
      )}
    </div>
  );

  function renderJourneyTable(journeys: RunIndexJourney[], singleId?: string) {
    return (
      <table className="journey-table">
        <thead>
          <tr>
            <th>Journey</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {journeys.map((j: RunIndexJourney) => {
            const result = journeyResults.get(j.journeyId);
            const displayStatus = getDisplayStatus(j, result);
            const warnCount = result ? deriveWarnings(result).length : 0;
            return (
              <tr
                key={j.journeyId}
                onClick={() => setExpanded(expanded === j.journeyId ? null : j.journeyId)}
                style={expanded === j.journeyId ? { background: "var(--surface)" } : undefined}
              >
                <td>{j.name}</td>
                <td><span className={`ui-badge badge badge-${displayStatus}`}>{displayStatus}</span></td>
                <td>{j.durationMs}ms</td>
                <td>
                  {warnCount > 0 && (
                    <span className="journey-warn-note">{warnCount} warning{warnCount !== 1 ? "s" : ""}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
}
