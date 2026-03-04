import { useState, useEffect } from "react";
import { fetchExcludedCandidates } from "../api";
import type { CoverageResponse, ExcludedCandidate, ExcludedCandidateReason } from "../types";

export type CoverageTab = "pages" | "actions" | "suggested" | "executed" | "clicks" | "excluded";

interface Props {
  coverage: CoverageResponse;
  activeTab: CoverageTab;
  onTabChange: (tab: CoverageTab) => void;
  runId: string;
  projectSlug?: string;
}

const TABS: Array<{ key: CoverageTab; label: string }> = [
  { key: "pages", label: "Pages" },
  { key: "actions", label: "Actions" },
  { key: "suggested", label: "Suggested" },
  { key: "executed", label: "Executed" },
  { key: "clicks", label: "Clicks" },
  { key: "excluded", label: "Excluded" },
];

const SHOW_LIMIT = 50;

export function CoverageDetails({ coverage, activeTab, onTabChange, runId, projectSlug }: Props) {
  return (
    <div className="coverage-details">
      <div className="coverage-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`coverage-tab${activeTab === tab.key ? " coverage-tab-active" : ""}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="coverage-tab-body">
        {activeTab === "pages" && <PagesTab pages={coverage.pagesVisited} />}
        {activeTab === "actions" && <ActionsTab actionsByType={coverage.actionsByType} total={coverage.counts.actionsDiscovered} />}
        {activeTab === "suggested" && <SuggestedTab tests={coverage.suggestedTests} />}
        {activeTab === "executed" && <ExecutedTab tests={coverage.executedTests} />}
        {activeTab === "clicks" && <ClicksTab clicks={coverage.clicksPerformed} />}
        {activeTab === "excluded" && <ExcludedTab runId={runId} projectSlug={projectSlug} />}
      </div>
    </div>
  );
}

function PagesTab({ pages }: { pages: CoverageResponse["pagesVisited"] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? pages : pages.slice(0, SHOW_LIMIT);

  return (
    <>
      <table className="coverage-table">
        <thead>
          <tr>
            <th>URL</th>
            <th>Depth</th>
            <th>Title</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p, i) => (
            <tr key={i}>
              <td className="coverage-url-cell">{p.url}</td>
              <td>{p.depth}</td>
              <td>{p.title ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!showAll && pages.length > SHOW_LIMIT && (
        <button className="coverage-show-more" onClick={() => setShowAll(true)}>
          Show all {pages.length} pages
        </button>
      )}
    </>
  );
}

function ActionsTab({ actionsByType, total }: { actionsByType: Record<string, number>; total: number }) {
  const entries = Object.entries(actionsByType).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div className="coverage-actions-total">Total actions: {total}</div>
      <table className="coverage-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Count</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([type, count]) => (
            <tr key={type}>
              <td><span className="ui-badge badge badge-stopped">{type}</span></td>
              <td>{count}</td>
              <td>{total > 0 ? Math.round((count / total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function SuggestedTab({ tests }: { tests: CoverageResponse["suggestedTests"] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? tests : tests.slice(0, SHOW_LIMIT);

  return (
    <>
      <table className="coverage-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Priority</th>
            <th>Score</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.priority ? <span className="ui-badge badge badge-stopped">{t.priority}</span> : "—"}</td>
              <td>{t.score != null ? t.score.toFixed(1) : "—"}</td>
              <td>{t.tags?.join(", ") ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!showAll && tests.length > SHOW_LIMIT && (
        <button className="coverage-show-more" onClick={() => setShowAll(true)}>
          Show all {tests.length} suggested tests
        </button>
      )}
    </>
  );
}

function ExecutedTab({ tests }: { tests: CoverageResponse["executedTests"] }) {
  return (
    <table className="coverage-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        {tests.map((t) => (
          <tr key={t.journeyId}>
            <td>{t.name}</td>
            <td><span className={`ui-badge badge badge-${t.status}`}>{t.status}</span></td>
            <td>{t.durationMs != null ? `${t.durationMs}ms` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ClicksTab({ clicks }: { clicks: CoverageResponse["clicksPerformed"] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? clicks : clicks.slice(0, SHOW_LIMIT);

  return (
    <>
      <table className="coverage-table">
        <thead>
          <tr>
            <th>Journey</th>
            <th>Label</th>
            <th>Selector</th>
            <th>Status</th>
            <th>Page</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((c, i) => (
            <tr key={i}>
              <td>{c.journeyName}</td>
              <td>{c.label}</td>
              <td className="coverage-selector-cell">
                {c.selector ? `${c.selector.strategy}: ${c.selector.query}` : "—"}
              </td>
              <td><span className={`ui-badge badge badge-${c.status}`}>{c.status}</span></td>
              <td className="coverage-url-cell">{c.pageUrl ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!showAll && clicks.length > SHOW_LIMIT && (
        <button className="coverage-show-more" onClick={() => setShowAll(true)}>
          Show all {clicks.length} clicks
        </button>
      )}
    </>
  );
}

const REASON_LABELS: Record<ExcludedCandidateReason, string> = {
  DESTRUCTIVE_LABEL: "Destructive",
  DISABLED: "Disabled",
  DUPLICATE_INTENT: "Duplicate",
  LOW_CONFIDENCE_SELECTOR: "Low Confidence",
  TIMESTAMP_STATUS: "Timestamp/Status",
  READ_ONLY_BLOCKED: "Read-Only Blocked",
  CAP_LIMIT: "Cap Limit",
  OTHER: "Other",
};

type FilterReason = "ALL" | ExcludedCandidateReason;

function ExcludedTab({ runId, projectSlug }: { runId: string; projectSlug?: string }) {
  const [data, setData] = useState<ExcludedCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterReason>("ALL");

  useEffect(() => {
    setData(null);
    setError(null);
    fetchExcludedCandidates(runId, projectSlug)
      .then((result) => {
        if (!result) {
          setError("No excluded candidates data available.");
        } else {
          setData(result);
        }
      })
      .catch((err) => setError((err as Error).message));
  }, [runId, projectSlug]);

  const filtered = data
    ? filter === "ALL"
      ? data
      : data.filter((e) => e.reason === filter)
    : [];

  const reasonCounts = data
    ? data.reduce<Record<string, number>>((acc, e) => {
        acc[e.reason] = (acc[e.reason] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  const activeReasons = Object.keys(reasonCounts) as ExcludedCandidateReason[];

  if (error) {
    return <div style={{ color: "var(--fail)", fontSize: 13 }}>{error}</div>;
  }

  if (!data) {
    return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading...</div>;
  }

  return (
    <>
      <div className="excluded-filter-bar">
        <button
          className={`filter-btn${filter === "ALL" ? " filter-btn-active" : ""}`}
          onClick={() => setFilter("ALL")}
        >
          ALL ({data.length})
        </button>
        {activeReasons.map((r) => (
          <button
            key={r}
            className={`filter-btn${filter === r ? " filter-btn-active" : ""}`}
            onClick={() => setFilter(r)}
          >
            {REASON_LABELS[r]} ({reasonCounts[r]})
          </button>
        ))}
      </div>
      <table className="coverage-table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Reason</th>
            <th>Type</th>
            <th>Score</th>
            <th>Selector</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e, i) => (
            <tr key={i}>
              <td>{e.humanLabel || "(empty)"}</td>
              <td><span className="ui-badge badge badge-stopped">{REASON_LABELS[e.reason]}</span></td>
              <td>{e.actionType}</td>
              <td>{e.score != null ? e.score : "—"}</td>
              <td className="coverage-selector-cell">{e.selector}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && (
        <div style={{ padding: 12, color: "var(--text-muted)", fontSize: 13 }}>
          No excluded candidates match this filter.
        </div>
      )}
    </>
  );
}
