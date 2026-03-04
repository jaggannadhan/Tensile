import { useState } from "react";
import type { RunIndexJourney, JourneyResult, SelectedEntity } from "../types";
import { deriveWarnings, getDisplayStatus } from "../hooks/useRunData";

type StatusFilter = "ALL" | "PASS" | "WARN" | "FAIL";

interface Props {
  journeys: RunIndexJourney[];
  journeyResults: Map<string, JourneyResult>;
  selectedEntity: SelectedEntity | null;
  onSelectJourney: (journeyId: string, resultPath: string) => void;
  loading?: boolean;
}

export function JourneysTable({ journeys, journeyResults, selectedEntity, onSelectJourney, loading }: Props) {
  const [filter, setFilter] = useState<StatusFilter>("ALL");

  const filtered = journeys.filter((j) => {
    if (filter === "ALL") return true;
    const result = journeyResults.get(j.journeyId);
    return getDisplayStatus(j, result) === filter;
  });

  const counts = {
    ALL: journeys.length,
    PASS: journeys.filter((j) => getDisplayStatus(j, journeyResults.get(j.journeyId)) === "PASS").length,
    WARN: journeys.filter((j) => getDisplayStatus(j, journeyResults.get(j.journeyId)) === "WARN").length,
    FAIL: journeys.filter((j) => getDisplayStatus(j, journeyResults.get(j.journeyId)) === "FAIL").length,
  };

  if (journeys.length === 0) {
    if (loading) {
      return <div className="inspector-empty">Loading journeys...</div>;
    }
    return <div className="inspector-empty">No journeys in this run.</div>;
  }

  return (
    <div>
      <div className="filter-bar">
        {(["ALL", "PASS", "WARN", "FAIL"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            className={`filter-btn${filter === f ? " filter-btn-active" : ""}${f !== "ALL" ? ` filter-btn-${f}` : ""}`}
            onClick={() => setFilter(f)}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>
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
          {filtered.map((j) => {
            const result = journeyResults.get(j.journeyId);
            const displayStatus = getDisplayStatus(j, result);
            const warnCount = result ? deriveWarnings(result).length : 0;
            const isSelected =
              selectedEntity?.type === "journey" && selectedEntity.journeyId === j.journeyId;

            return (
              <tr
                key={j.journeyId}
                className={isSelected ? "journey-row-selected" : undefined}
                onClick={() => onSelectJourney(j.journeyId, j.resultPath)}
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
    </div>
  );
}
