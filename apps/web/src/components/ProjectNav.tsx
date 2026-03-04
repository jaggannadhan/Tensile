import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchRuns } from "../api";
import { RunCard } from "./RunCard";
import { NewRunModal } from "./NewRunModal";
import { PinnedTestsList } from "./PinnedTestsList";
import type { RunSummary } from "../types";

interface Props {
  runs: RunSummary[];
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  onNewRun: (runId: string) => void;
  onRunsUpdate: (runs: RunSummary[]) => void;
  showNewRunModal?: boolean;
  onCloseNewRunModal?: () => void;
}

interface ProjectGroup {
  slug: string;
  targetUrl: string;
  runs: RunSummary[];
}

export function ProjectNav({
  runs, selectedRunId, onSelectRun, onNewRun, onRunsUpdate,
  showNewRunModal, onCloseNewRunModal,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Track which projects have been auto-selected on expand
  const autoSelectedProjectsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const data = await fetchRuns();
      onRunsUpdate(data);
    } catch { /* ignore */ }
  }, [onRunsUpdate]);

  // Initial fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while any run is active
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === "running");
    if (!hasActive && runs.length > 0) return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [runs, refresh]);

  const handleNewRun = useCallback((runId: string) => {
    setLocalModal(false);
    onCloseNewRunModal?.();
    onNewRun(runId);
    refresh();
  }, [onNewRun, onCloseNewRunModal, refresh]);

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

    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
      const aLatest = a.runs.reduce((max, r) => r.startedAt > max ? r.startedAt : max, "");
      const bLatest = b.runs.reduce((max, r) => r.startedAt > max ? r.startedAt : max, "");
      return bLatest.localeCompare(aLatest);
    });

    for (const group of sortedGroups) {
      group.runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    }

    return { groups: sortedGroups, ungrouped: ungroupedRuns.reverse() };
  }, [runs]);

  const toggleCollapse = useCallback((slug: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const wasCollapsed = next.has(slug);
      if (wasCollapsed) {
        next.delete(slug);

        // Auto-select newest run from this project when expanding
        // (only if no run from this project is currently selected)
        if (!autoSelectedProjectsRef.current.has(slug)) {
          const group = groups.find((g) => g.slug === slug);
          if (group && group.runs.length > 0) {
            const currentRunInGroup = selectedRunId && group.runs.some((r) => r.runId === selectedRunId);
            if (!currentRunInGroup) {
              autoSelectedProjectsRef.current.add(slug);
              const newest = group.runs[0]; // already sorted newest-first
              if (import.meta.env.DEV) console.log("[Tensile] autoSelect on expand:", newest.runId, slug);
              onSelectRun(newest.runId);
            }
          }
        }
      } else {
        next.add(slug);
      }
      return next;
    });
  }, [groups, selectedRunId, onSelectRun]);

  const handlePinnedTestRun = useCallback((runId: string) => {
    onNewRun(runId);
    refresh();
  }, [onNewRun, refresh]);

  const hasGroups = groups.length > 0;

  // Local modal state (sidebar button) merged with lifted state (empty-state CTA)
  const [localModal, setLocalModal] = useState(false);
  const modalOpen = localModal || (showNewRunModal ?? false);
  const closeModal = () => {
    setLocalModal(false);
    onCloseNewRunModal?.();
  };

  return (
    <>
      <div className="sidebar-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Tensile</span>
        <button className="btn btn-sm btn-primary" style={{ margin: 0, width: "auto" }} onClick={() => setLocalModal(true)}>
          + New Run
        </button>
      </div>
      <div className="sidebar-runs">
        {runs.length === 0 && (
          <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
            No runs yet. Click "New Run" to start.
          </div>
        )}

        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.slug);
          return (
            <div key={group.slug} className="project-group">
              <div className="project-group-header" onClick={() => toggleCollapse(group.slug)}>
                <span className="project-group-toggle">{isCollapsed ? "\u25B6" : "\u25BC"}</span>
                <span className="project-group-slug">{group.slug}</span>
                <span className="project-group-count">{group.runs.length}</span>
              </div>
              {!isCollapsed && (
                <>
                  {group.runs.map((run) => (
                    <RunCard key={run.runId} run={run} active={run.runId === selectedRunId} onClick={() => onSelectRun(run.runId)} />
                  ))}
                  <PinnedTestsList slug={group.slug} onRunPinnedTest={handlePinnedTestRun} />
                </>
              )}
            </div>
          );
        })}

        {ungrouped.length > 0 && hasGroups && (
          <div className="project-group">
            <div className="project-group-header" style={{ color: "var(--text-muted)" }}>
              <span className="project-group-slug">Other</span>
              <span className="project-group-count">{ungrouped.length}</span>
            </div>
            {ungrouped.map((run) => (
              <RunCard key={run.runId} run={run} active={run.runId === selectedRunId} onClick={() => onSelectRun(run.runId)} />
            ))}
          </div>
        )}

        {ungrouped.length > 0 && !hasGroups && ungrouped.map((run) => (
          <RunCard key={run.runId} run={run} active={run.runId === selectedRunId} onClick={() => onSelectRun(run.runId)} />
        ))}
      </div>

      <NewRunModal open={modalOpen} onClose={closeModal} onNewRun={handleNewRun} />
    </>
  );
}
