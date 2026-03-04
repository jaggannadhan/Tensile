import type { SelectedEntity, IssuesFile, StepEditPatch, JourneySpec } from "../types";
import { JourneyDetails } from "./JourneyDetails";

interface Props {
  selectedEntity: SelectedEntity | null;
  runId: string;
  issues: IssuesFile | null;
  projectSlug?: string;
  onSavePinnedTest?: (journeySpec: JourneySpec, patches: StepEditPatch[], name: string, tags: string[]) => void;
  onRepairJourney?: (runId: string, journeyId: string, patches: StepEditPatch[]) => void;
}

export function InspectorDetails({ selectedEntity, runId, issues, projectSlug, onSavePinnedTest, onRepairJourney }: Props) {
  if (!selectedEntity) {
    return <div className="inspector-empty">Select a journey or issue to see details.</div>;
  }

  if (selectedEntity.type === "journey") {
    return (
      <JourneyDetails
        runId={runId}
        resultPath={selectedEntity.resultPath}
        projectSlug={projectSlug}
        journeyId={selectedEntity.journeyId}
        onSavePinnedTest={onSavePinnedTest}
        onRepairJourney={onRepairJourney}
      />
    );
  }

  // Issue detail
  const issue = issues?.issues.find((i) => i.issueId === selectedEntity.issueId);
  if (!issue) {
    return <div className="inspector-empty">Issue not found.</div>;
  }

  const uniqueJourneys = new Set(issue.occurrences.map((o) => o.journeyId)).size;

  return (
    <div className="issue-detail">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span className={`ui-badge badge badge-${issue.severity}`}>{issue.severity}</span>
        <h4 style={{ margin: 0 }}>{issue.title}</h4>
      </div>

      <div className="issue-detail-meta">
        <span>{issue.count} occurrence{issue.count !== 1 ? "s" : ""} across {uniqueJourneys} journey{uniqueJourneys !== 1 ? "s" : ""}</span>
        {issue.ownershipHint && (
          <span className="issues-ownership-hint">
            Likely: {issue.ownershipHint.likelyRepo} ({issue.ownershipHint.confidence})
          </span>
        )}
      </div>

      <h5 style={{ marginTop: 12 }}>Occurrences</h5>
      <table className="issue-occurrences-table">
        <thead>
          <tr>
            <th>Journey</th>
            <th>Step</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {issue.occurrences.map((occ, i) => (
            <tr key={i}>
              <td>{occ.journeyName}</td>
              <td>{occ.stepName}</td>
              <td className="issue-error-cell">{occ.errorMessage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
