import type { InspectorTab, SelectedEntity, RunDetail, IssuesFile, CoverageResponse, PlannerSelection, StepEditPatch, JourneySpec } from "../types";
import { InspectorDetails } from "./InspectorDetails";
import { RunConsole } from "./RunConsole";
import { CoveragePanel } from "./CoveragePanel";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { PlannerPanel } from "./PlannerPanel";

interface Props {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  selectedEntity: SelectedEntity | null;
  runId: string;
  detail: RunDetail | null;
  issues: IssuesFile | null;
  coverage: CoverageResponse | null;
  plannerSelection: PlannerSelection | null;
  lines: string[];
  sseStatus: string | null;
  projectSlug?: string;
  onSavePinnedTest?: (journeySpec: JourneySpec, patches: StepEditPatch[], name: string, tags: string[]) => void;
  onRepairJourney?: (runId: string, journeyId: string, patches: StepEditPatch[]) => void;
}

const TABS: { key: InspectorTab; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "console", label: "Console" },
  { key: "coverage", label: "Coverage" },
  { key: "artifacts", label: "Artifacts" },
  { key: "planner", label: "Planner" },
];

export function Inspector({
  activeTab, onTabChange, selectedEntity, runId, detail,
  issues, coverage, plannerSelection,
  lines, sseStatus, projectSlug,
  onSavePinnedTest, onRepairJourney,
}: Props) {
  return (
    <div className="inspector">
      <div className="inspector-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`inspector-tab${activeTab === t.key ? " inspector-tab-active" : ""}`}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {activeTab === "details" && (
          <InspectorDetails
            selectedEntity={selectedEntity}
            runId={runId}
            issues={issues}
            projectSlug={projectSlug}
            onSavePinnedTest={onSavePinnedTest}
            onRepairJourney={onRepairJourney}
          />
        )}
        {activeTab === "console" && (
          <RunConsole
            lines={lines}
            status={sseStatus}
            historical={detail?.historical}
            runId={runId}
            projectSlug={projectSlug}
            journeyIds={detail?.runIndex?.journeys.map((j) => j.journeyId)}
          />
        )}
        {activeTab === "coverage" && (
          coverage
            ? <CoveragePanel coverage={coverage} runId={runId} projectSlug={projectSlug} />
            : <div className="inspector-empty">Coverage data not yet available.</div>
        )}
        {activeTab === "artifacts" && (
          <ArtifactsPanel detail={detail} runId={runId} projectSlug={projectSlug} />
        )}
        {activeTab === "planner" && (
          <PlannerPanel plannerSelection={plannerSelection} />
        )}
      </div>
    </div>
  );
}
