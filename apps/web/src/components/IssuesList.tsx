import { useState, useEffect } from "react";
import type { IssuesFile, Issue } from "../types";

interface Props {
  issues: IssuesFile;
  runId: string;
}

const SEVERITY_LABELS: Record<string, string> = {
  S0: "Critical",
  S1: "High",
  S2: "Medium",
  S3: "Info",
};

export function IssuesList({ issues }: Props) {
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

  // Auto-expand when issues first appear
  useEffect(() => {
    if (isOpen === null && issues.totalIssues > 0) {
      setIsOpen(true);
    }
  }, [issues, isOpen]);

  const open = isOpen ?? false;

  return (
    <div className="issues-panel">
      <div
        className="issues-panel-header"
        onClick={() => setIsOpen(!open)}
      >
        <span>
          Issues ({issues.totalIssues} issue{issues.totalIssues !== 1 ? "s" : ""}, {issues.totalOccurrences} occurrence{issues.totalOccurrences !== 1 ? "s" : ""})
        </span>
        <span className="issues-panel-toggle">{open ? "collapse" : "expand"}</span>
      </div>
      {open && (
        <div className="issues-panel-body">
          {issues.issues.map((issue) => (
            <IssueCard
              key={issue.issueId}
              issue={issue}
              expanded={expandedIssue === issue.issueId}
              onToggle={() =>
                setExpandedIssue(expandedIssue === issue.issueId ? null : issue.issueId)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueCard({
  issue,
  expanded,
  onToggle,
}: {
  issue: Issue;
  expanded: boolean;
  onToggle: () => void;
}) {
  const uniqueJourneys = new Set(issue.occurrences.map((o) => o.journeyId)).size;

  return (
    <div className="issue-card">
      <div className="issue-card-header" onClick={onToggle}>
        <span className={`ui-badge badge badge-${issue.severity}`}>{issue.severity}</span>
        <span className="issue-card-title">{issue.title}</span>
        <span className="issue-card-count">
          {issue.count} occurrence{issue.count !== 1 ? "s" : ""} across {uniqueJourneys} journey{uniqueJourneys !== 1 ? "s" : ""}
        </span>
      </div>
      {expanded && (
        <div className="issue-card-detail">
          <div className="issue-card-meta">
            <span>Severity: {SEVERITY_LABELS[issue.severity] ?? issue.severity}</span>
            {issue.ownershipHint && (
              <span className="issue-ownership">
                Likely: {issue.ownershipHint.likelyRepo} ({issue.ownershipHint.confidence})
              </span>
            )}
          </div>
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
      )}
    </div>
  );
}
