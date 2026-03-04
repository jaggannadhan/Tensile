import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchRuns } from "../api";
import { NewRunForm } from "./NewRunForm";
import { RunCard } from "./RunCard";
import type { RunSummary } from "../types";

interface Props {
  runs: RunSummary[];
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  onNewRun: (runId: string) => void;
  onRunsUpdate: (runs: RunSummary[]) => void;
}

interface ProjectGroup {
  slug: string;
  targetUrl: string;
  runs: RunSummary[];
}

export function Sidebar({ runs, selectedRunId, onSelectRun, onNewRun, onRunsUpdate }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const data = await fetchRuns();
      onRunsUpdate(data);
    } catch {
      // ignore fetch errors
    }
  }, [onRunsUpdate]);

  // Poll while any run is active
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === "running");
    if (!hasActive && runs.length > 0) return;

    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [runs, refresh]);

  const handleNewRun = useCallback(
    (runId: string) => {
      onNewRun(runId);
      refresh();
    },
    [onNewRun, refresh],
  );

  // Group runs by projectSlug
  const { groups, ungrouped } = useMemo(() => {
    const groupMap = new Map<string, ProjectGroup>();
    const ungroupedRuns: RunSummary[] = [];

    for (const run of runs) {
      if (run.projectSlug) {
        let group = groupMap.get(run.projectSlug);
        if (!group) {
          group = { slug: run.projectSlug, targetUrl: run.targetUrl, runs: [] };
          groupMap.set(run.projectSlug, group);
        }
        group.runs.push(run);
      } else {
        ungroupedRuns.push(run);
      }
    }

    // Sort groups by most recent run
    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
      const aLatest = a.runs.reduce((max, r) => r.startedAt > max ? r.startedAt : max, "");
      const bLatest = b.runs.reduce((max, r) => r.startedAt > max ? r.startedAt : max, "");
      return bLatest.localeCompare(aLatest);
    });

    // Sort runs within each group by startedAt descending
    for (const group of sortedGroups) {
      group.runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    }

    return { groups: sortedGroups, ungrouped: ungroupedRuns.reverse() };
  }, [runs]);

  const toggleCollapse = (slug: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const hasGroups = groups.length > 0;

  return (
    <div className="sidebar">
      <div className="sidebar-header">Tensile</div>
      <NewRunForm onNewRun={handleNewRun} />
      <div className="sidebar-runs">
        {runs.length === 0 && (
          <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
            No runs yet. Start one above.
          </div>
        )}

        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.slug);
          return (
            <div key={group.slug} className="project-group">
              <div
                className="project-group-header"
                onClick={() => toggleCollapse(group.slug)}
              >
                <span className="project-group-toggle">{isCollapsed ? "\u25B6" : "\u25BC"}</span>
                <span className="project-group-name">{group.slug}</span>
                <span className="project-group-count">{group.runs.length}</span>
              </div>
              {!isCollapsed && (
                <div className="project-group-runs">
                  {group.runs.map((run) => (
                    <RunCard
                      key={run.runId}
                      run={run}
                      active={run.runId === selectedRunId}
                      onClick={() => onSelectRun(run.runId)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {ungrouped.length > 0 && hasGroups && (
          <div className="project-group">
            <div className="project-group-header" style={{ color: "var(--text-muted)" }}>
              <span className="project-group-name">Other</span>
              <span className="project-group-count">{ungrouped.length}</span>
            </div>
            <div className="project-group-runs">
              {ungrouped.map((run) => (
                <RunCard
                  key={run.runId}
                  run={run}
                  active={run.runId === selectedRunId}
                  onClick={() => onSelectRun(run.runId)}
                />
              ))}
            </div>
          </div>
        )}

        {ungrouped.length > 0 && !hasGroups && (
          ungrouped.map((run) => (
            <RunCard
              key={run.runId}
              run={run}
              active={run.runId === selectedRunId}
              onClick={() => onSelectRun(run.runId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
