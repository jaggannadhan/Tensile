import { useState } from "react";
import { CoverageDetails } from "./CoverageDetails";
import type { CoverageTab } from "./CoverageDetails";
import { InfoTooltip } from "./InfoTooltip";
import type { CoverageResponse } from "../types";

interface Props {
  coverage: CoverageResponse;
  runId: string;
  projectSlug?: string;
}

const CARDS: Array<{ key: CoverageTab; label: string; countKey: keyof CoverageResponse["counts"]; tooltip: string }> = [
  { key: "pages", label: "Pages Visited", countKey: "pagesVisited", tooltip: "Unique pages discovered during the crawl phase." },
  { key: "actions", label: "Actions Discovered", countKey: "actionsDiscovered", tooltip: "Interactive elements (links, buttons, inputs) found across all pages." },
  { key: "suggested", label: "Suggested Tests", countKey: "suggestedTests", tooltip: "Candidate journeys generated from discovered actions after filtering." },
  { key: "executed", label: "Executed Tests", countKey: "executedTests", tooltip: "Journeys that were actually run by the test runner." },
  { key: "clicks", label: "Clicks Performed", countKey: "clicksPerformed", tooltip: "Individual click actions executed across all journeys." },
];

export function CoveragePanel({ coverage, runId, projectSlug }: Props) {
  const [activeTab, setActiveTab] = useState<CoverageTab | null>(null);

  const excludedCount = coverage.counts.suggestedTests > 0
    ? coverage.counts.actionsDiscovered - coverage.counts.suggestedTests
    : null;

  return (
    <div className="coverage-section">
      <div className="stage-cards">
        {CARDS.map((card) => (
          <div
            key={card.key}
            className={`stage-card coverage-card${activeTab === card.key ? " coverage-card-active" : ""}`}
            onClick={() => setActiveTab(activeTab === card.key ? null : card.key)}
          >
            <div className="stage-card-title">
              {card.label}
              <InfoTooltip text={card.tooltip} />
            </div>
            <div className="stage-card-body">
              <span className="coverage-card-count">{coverage.counts[card.countKey]}</span>
            </div>
          </div>
        ))}
        {excludedCount != null && excludedCount > 0 && (
          <div
            className={`stage-card coverage-card coverage-card-excluded${activeTab === "excluded" ? " coverage-card-active" : ""}`}
            onClick={() => setActiveTab(activeTab === "excluded" ? null : "excluded")}
          >
            <div className="stage-card-title">
              Excluded Tests
              <InfoTooltip text="Candidates filtered out due to safety, duplicates, low confidence, or cap limits." />
            </div>
            <div className="stage-card-body">
              <span className="coverage-card-count">{excludedCount}</span>
            </div>
          </div>
        )}
      </div>
      <div className="coverage-explain">
        <strong>Suggested</strong>: {coverage.explain.suggested}{" "}
        <strong>Executed</strong>: {coverage.explain.executed}
      </div>
      {activeTab && (
        <CoverageDetails
          coverage={coverage}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          runId={runId}
          projectSlug={projectSlug}
        />
      )}
    </div>
  );
}
