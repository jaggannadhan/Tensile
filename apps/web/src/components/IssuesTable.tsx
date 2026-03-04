import type { IssuesFile, SelectedEntity } from "../types";

const SEVERITY_LABELS: Record<string, string> = {
  S0: "Critical",
  S1: "High",
  S2: "Medium",
  S3: "Info",
};

interface Props {
  issues: IssuesFile | null;
  selectedEntity: SelectedEntity | null;
  onSelectIssue: (issueId: string) => void;
}

export function IssuesTable({ issues, selectedEntity, onSelectIssue }: Props) {
  if (!issues || issues.totalIssues === 0) {
    return <div className="inspector-empty">No issues detected.</div>;
  }

  return (
    <table className="issues-table">
      <thead>
        <tr>
          <th>Severity</th>
          <th>Title</th>
          <th>Count</th>
          <th>Ownership</th>
        </tr>
      </thead>
      <tbody>
        {issues.issues.map((issue) => {
          const isSelected =
            selectedEntity?.type === "issue" && selectedEntity.issueId === issue.issueId;

          return (
            <tr
              key={issue.issueId}
              className={isSelected ? "issue-row-selected" : undefined}
              onClick={() => onSelectIssue(issue.issueId)}
            >
              <td>
                <span className={`ui-badge badge badge-${issue.severity}`}>
                  {issue.severity}
                </span>
                <span className="issues-severity-label">{SEVERITY_LABELS[issue.severity]}</span>
              </td>
              <td>{issue.title}</td>
              <td>{issue.count}</td>
              <td>
                {issue.ownershipHint ? (
                  <span className="issues-ownership-hint">
                    {issue.ownershipHint.likelyRepo} ({issue.ownershipHint.confidence})
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
