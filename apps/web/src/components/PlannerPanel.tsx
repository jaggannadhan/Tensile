import type { PlannerSelection } from "../types";

interface Props {
  plannerSelection: PlannerSelection | null;
}

export function PlannerPanel({ plannerSelection }: Props) {
  if (!plannerSelection) {
    return <div className="inspector-empty">Planner selection data not available.</div>;
  }

  const { mode, param, totalCandidates, selected, skippedByScore } = plannerSelection;

  return (
    <div className="planner-panel">
      <div className="planner-header">
        <span className="planner-mode">Mode: {mode}</span>
        <span className="planner-param">Param: {param}</span>
        <span className="planner-total">{totalCandidates} total candidates</span>
      </div>

      {selected.length > 0 && (
        <>
          <h5 style={{ marginTop: 12, marginBottom: 4 }}>Selected ({selected.length})</h5>
          <table className="planner-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Priority</th>
                <th>Score</th>
                <th>Adj. Score</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.priority}</td>
                  <td>{c.score}</td>
                  <td>{c.adjustedScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {skippedByScore.length > 0 && (
        <>
          <h5 style={{ marginTop: 12, marginBottom: 4 }}>Skipped ({skippedByScore.length})</h5>
          <table className="planner-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Priority</th>
                <th>Score</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {skippedByScore.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.priority}</td>
                  <td>{c.score}</td>
                  <td className="planner-skip-reason">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
