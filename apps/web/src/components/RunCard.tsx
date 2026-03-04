import type { RunSummary } from "../types";

interface Props {
  run: RunSummary;
  active: boolean;
  onClick: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

export function RunCard({ run, active, onClick }: Props) {
  return (
    <div className={`run-card ${active ? "active" : ""}`} onClick={onClick}>
      <div className="run-card-header">
        <span className={`ui-badge badge badge-${run.status}`}>{run.status}</span>
        <span className="run-card-url">{run.targetUrl}</span>
      </div>
      <div className="run-card-time">
        {formatTime(run.startedAt)}
        {run.options.smoke && " | smoke"}
        {run.options.discover && " | discover"}
      </div>
    </div>
  );
}
