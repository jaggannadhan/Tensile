import type { CoverageResponse } from "../types";

interface Props {
  coverage: CoverageResponse | null;
  onOpenCoverage: () => void;
}

export function CompactCoverageStrip({ coverage, onOpenCoverage }: Props) {
  if (!coverage) return null;

  const items = [
    { label: "Pages", value: coverage.counts.pagesVisited },
    { label: "Actions", value: coverage.counts.actionsDiscovered },
    { label: "Suggested", value: coverage.counts.suggestedTests },
    { label: "Executed", value: coverage.counts.executedTests },
    { label: "Clicks", value: coverage.counts.clicksPerformed },
  ];

  return (
    <div className="compact-coverage-strip" onClick={onOpenCoverage} title="Click to open Coverage inspector">
      {items.map((item) => (
        <div key={item.label} className="compact-coverage-item">
          <span className="compact-coverage-label">{item.label}</span>
          <span className="compact-coverage-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
