import type { StageStats, RunOptions } from "../types";

interface Props {
  stages?: StageStats;
  options: RunOptions;
}

function statusBadge(status: "pass" | "fail" | "skip") {
  const cls = status === "pass" ? "badge-PASS" : status === "fail" ? "badge-FAIL" : "badge-stopped";
  const label = status.toUpperCase();
  return <span className={`ui-badge badge ${cls}`}>{label}</span>;
}

export function StageCards({ stages, options }: Props) {
  const showSmoke = options.smoke !== false;
  const showDiscovery = !!options.discover;
  const showJourneys = !!options.journeys && options.journeys !== "none";

  if (!showSmoke && !showDiscovery && !showJourneys) return null;

  return (
    <div className="stage-cards">
      {showSmoke && (
        <div className="ui-panel stage-card">
          <div className="stage-card-title">Smoke</div>
          {stages?.smoke ? (
            <div className="stage-card-body">
              {statusBadge(stages.smoke.status)}
              {stages.smoke.durationMs !== undefined && (
                <span className="stage-card-stat">{stages.smoke.durationMs}ms</span>
              )}
            </div>
          ) : (
            <div className="stage-card-body stage-card-pending">pending</div>
          )}
        </div>
      )}

      {showDiscovery && (
        <div className="ui-panel stage-card">
          <div className="stage-card-title">Discovery</div>
          {stages?.discovery ? (
            <div className="stage-card-body">
              {statusBadge(stages.discovery.status)}
              <div className="stage-card-stats">
                {stages.discovery.pages !== undefined && <span>{stages.discovery.pages} pages</span>}
                {stages.discovery.actions !== undefined && <span>{stages.discovery.actions} actions</span>}
                {stages.discovery.candidates !== undefined && <span>{stages.discovery.candidates} candidates</span>}
              </div>
            </div>
          ) : (
            <div className="stage-card-body stage-card-pending">pending</div>
          )}
        </div>
      )}

      {showJourneys && (
        <div className="ui-panel stage-card">
          <div className="stage-card-title">Journeys ({options.journeys})</div>
          {stages?.journeys ? (
            <div className="stage-card-body">
              {statusBadge(stages.journeys.status)}
              <div className="stage-card-stats">
                <span>{stages.journeys.executed} executed</span>
                <span className="stage-stat-pass">{stages.journeys.passed} passed</span>
                {stages.journeys.failed > 0 && <span className="stage-stat-fail">{stages.journeys.failed} failed</span>}
                {stages.journeys.warned > 0 && <span className="stage-stat-warn">{stages.journeys.warned} warned</span>}
              </div>
            </div>
          ) : (
            <div className="stage-card-body stage-card-pending">pending</div>
          )}
        </div>
      )}
    </div>
  );
}
