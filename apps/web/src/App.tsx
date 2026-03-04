import { useState, useCallback, useRef } from "react";
import { useSSE } from "./hooks/useSSE";
import { useRunData } from "./hooks/useRunData";
import { stopRun, createPinnedTest, repairJourney } from "./api";
import type { JourneySpec, StepEditPatch } from "./types";
import { DashboardLayout } from "./layout/DashboardLayout";
import { ProjectNav } from "./components/ProjectNav";
import { RunHeaderBar } from "./components/RunHeaderBar";
import { StageTimeline } from "./components/StageTimeline";
import { MainTabs } from "./components/MainTabs";
import { JourneysTable } from "./components/JourneysTable";
import { IssuesTable } from "./components/IssuesTable";
import { CompactCoverageStrip } from "./components/CompactCoverageStrip";
import { Inspector } from "./components/Inspector";
import { LoadingState } from "./components/LoadingState";
import { EmptyState } from "./components/EmptyState";
import type { RunSummary, SelectedEntity, MainTab, InspectorTab } from "./types";

export function App() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<MainTab>("journeys");
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>("details");
  const [showNewRunModal, setShowNewRunModal] = useState(false);

  // Track whether user explicitly selected a run (vs auto-select)
  const userSelectedRef = useRef(false);
  const didAutoSelectRef = useRef(false);

  const selectedRun = runs.find((r) => r.runId === selectedRunId);
  const projectSlug = selectedRun?.projectSlug;

  // SSE for live updates
  const { lines, status: sseStatus, indexReady, repoMetaReady, stagesReady, issuesReady } = useSSE(selectedRunId);

  // Central data hook
  const runData = useRunData(selectedRunId, projectSlug, { indexReady, stagesReady, issuesReady, repoMetaReady });

  // Handlers
  const handleSelectRun = useCallback((runId: string) => {
    if (import.meta.env.DEV) console.log("[Tensile] selectRun:", runId, "(user)");
    userSelectedRef.current = true;
    setSelectedRunId(runId);
    setSelectedEntity(null);
    setActiveMainTab("journeys");
    setActiveInspectorTab("details");
  }, []);

  const handleNewRun = useCallback((runId: string) => {
    if (import.meta.env.DEV) console.log("[Tensile] newRun:", runId);
    userSelectedRef.current = true;
    setSelectedRunId(runId);
    setSelectedEntity(null);
    setActiveMainTab("journeys");
    setActiveInspectorTab("console");
  }, []);

  const handleRunsUpdate = useCallback((newRuns: RunSummary[]) => {
    setRuns(newRuns);

    // Auto-select latest run on first load if nothing selected
    if (!didAutoSelectRef.current && !userSelectedRef.current && newRuns.length > 0) {
      didAutoSelectRef.current = true;
      const sorted = [...newRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const latest = sorted[0];
      if (import.meta.env.DEV) console.log("[Tensile] autoSelect:", latest.runId);
      setSelectedRunId(latest.runId);
      setSelectedEntity(null);
      setActiveMainTab("journeys");
      setActiveInspectorTab("details");
    }
  }, []);

  const handleSelectJourney = useCallback((journeyId: string, resultPath: string) => {
    setSelectedEntity({ type: "journey", journeyId, resultPath });
    setActiveInspectorTab("details");
  }, []);

  const handleSelectIssue = useCallback((issueId: string) => {
    setSelectedEntity({ type: "issue", issueId });
    setActiveInspectorTab("details");
  }, []);

  const handleOpenCoverage = useCallback(() => {
    setActiveInspectorTab("coverage");
  }, []);

  const handleStop = useCallback(() => {
    if (selectedRunId) stopRun(selectedRunId);
  }, [selectedRunId]);

  const handleOpenNewRunModal = useCallback(() => {
    setShowNewRunModal(true);
  }, []);

  const handleSavePinnedTest = useCallback(async (journeySpec: JourneySpec, patches: StepEditPatch[], name: string, tags: string[]) => {
    if (!selectedRunId || !projectSlug) return;
    const entity = selectedEntity;
    if (!entity || entity.type !== "journey") return;
    try {
      await createPinnedTest(projectSlug, {
        baseRunId: selectedRunId,
        baseJourneyId: entity.journeyId,
        name,
        journeySpec,
        patches,
        tags,
      });
      if (import.meta.env.DEV) console.log("[Tensile] pinnedTest saved:", name);
    } catch (err) {
      console.error("[Tensile] failed to save pinned test:", err);
    }
  }, [selectedRunId, projectSlug, selectedEntity]);

  const handleRepairJourney = useCallback(async (runId: string, journeyId: string, patches: StepEditPatch[]) => {
    try {
      const result = await repairJourney(runId, journeyId, patches);
      if (import.meta.env.DEV) console.log("[Tensile] repair spawned:", result.runId);
      // Auto-select the new repair run
      userSelectedRef.current = true;
      setSelectedRunId(result.runId);
      setSelectedEntity(null);
      setActiveMainTab("journeys");
      setActiveInspectorTab("console");
    } catch (err) {
      console.error("[Tensile] repair failed:", err);
    }
  }, []);

  const effectiveStatus = sseStatus ?? selectedRun?.status ?? null;

  // Center column content
  const centerContent = selectedRunId ? (
    <>
      <RunHeaderBar
        runId={selectedRunId}
        detail={runData.detail}
        sseStatus={sseStatus}
        runStatus={selectedRun?.status}
        journeyResults={runData.journeyResults}
        repoMeta={runData.repoMeta}
        repoMetaReady={repoMetaReady}
        projectSlug={projectSlug}
        onStop={handleStop}
      />
      {runData.detail ? (
        <>
          <StageTimeline
            stages={runData.detail.stages}
            options={runData.detail.options}
          />
          <MainTabs
            activeTab={activeMainTab}
            onTabChange={setActiveMainTab}
            issues={runData.issues}
          >
            {activeMainTab === "journeys" && (
              <JourneysTable
                journeys={runData.detail.runIndex?.journeys ?? []}
                journeyResults={runData.journeyResults}
                selectedEntity={selectedEntity}
                onSelectJourney={handleSelectJourney}
                loading={runData.loading}
              />
            )}
            {activeMainTab === "issues" && (
              <IssuesTable
                issues={runData.issues}
                selectedEntity={selectedEntity}
                onSelectIssue={handleSelectIssue}
              />
            )}
          </MainTabs>
          <CompactCoverageStrip
            coverage={runData.coverage}
            onOpenCoverage={handleOpenCoverage}
          />
        </>
      ) : (
        runData.loading
          ? <LoadingState message="Loading run data..." />
          : <EmptyState title="Could not load run data" hint="run.index.json may be missing" error />
      )}
    </>
  ) : null;

  // Right column content
  const rightContent = selectedRunId ? (
    <Inspector
      activeTab={activeInspectorTab}
      onTabChange={setActiveInspectorTab}
      selectedEntity={selectedEntity}
      runId={selectedRunId}
      detail={runData.detail}
      issues={runData.issues}
      coverage={runData.coverage}
      plannerSelection={runData.plannerSelection}
      lines={lines}
      sseStatus={effectiveStatus}
      projectSlug={projectSlug}
      onSavePinnedTest={handleSavePinnedTest}
      onRepairJourney={handleRepairJourney}
    />
  ) : null;

  return (
    <DashboardLayout
      left={
        <ProjectNav
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={handleSelectRun}
          onNewRun={handleNewRun}
          onRunsUpdate={handleRunsUpdate}
          showNewRunModal={showNewRunModal}
          onCloseNewRunModal={() => setShowNewRunModal(false)}
        />
      }
      center={centerContent}
      right={rightContent}
      hasRun={!!selectedRunId}
      hasRuns={runs.length > 0}
      onNewRun={handleOpenNewRunModal}
    />
  );
}
