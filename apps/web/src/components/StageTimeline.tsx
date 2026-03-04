import type { StageStats, RunOptions } from "../types";

interface Props {
  stages?: StageStats;
  options: RunOptions;
}

function statusDot(status: "pass" | "fail" | "skip"): string {
  if (status === "pass") return "stage-dot-pass";
  if (status === "fail") return "stage-dot-fail";
  return "stage-dot-skip";
}

export function StageTimeline({ stages, options }: Props) {
  const showSmoke = options.smoke !== false;
  const showDiscovery = !!options.discover;
  const showJourneys = !!options.journeys && options.journeys !== "none";

  if (!showSmoke && !showDiscovery && !showJourneys) return null;

  return (
    <div className="stage-timeline">
      {showSmoke && (
        <div className="stage-timeline-item">
          <span className={`stage-dot ${stages?.smoke ? statusDot(stages.smoke.status) : "stage-dot-pending"}`} />
          <span className="stage-timeline-label">Smoke</span>
          {stages?.smoke?.durationMs !== undefined && (
            <span className="stage-timeline-stats">{stages.smoke.durationMs}ms</span>
          )}
          {!stages?.smoke && <span className="stage-timeline-pending">pending</span>}
        </div>
      )}

      {showDiscovery && (
        <div className="stage-timeline-item">
          <span className={`stage-dot ${stages?.discovery ? statusDot(stages.discovery.status) : "stage-dot-pending"}`} />
          <span className="stage-timeline-label">Discovery</span>
          {stages?.discovery && (
            <span className="stage-timeline-stats">
              {stages.discovery.pages !== undefined && `${stages.discovery.pages}p`}
              {stages.discovery.candidates !== undefined && ` / ${stages.discovery.candidates}c`}
            </span>
          )}
          {!stages?.discovery && <span className="stage-timeline-pending">pending</span>}
        </div>
      )}

      {showJourneys && (
        <div className="stage-timeline-item">
          <span className={`stage-dot ${stages?.journeys ? statusDot(stages.journeys.status) : "stage-dot-pending"}`} />
          <span className="stage-timeline-label">Journeys</span>
          {stages?.journeys && (
            <span className="stage-timeline-stats">
              {stages.journeys.passed}P
              {stages.journeys.warned > 0 && ` / ${stages.journeys.warned}W`}
              {stages.journeys.failed > 0 && ` / ${stages.journeys.failed}F`}
            </span>
          )}
          {!stages?.journeys && <span className="stage-timeline-pending">pending</span>}
        </div>
      )}

      {options.journeys && options.journeys !== "none" && (
        <div className="stage-timeline-item">
          <span className={`stage-dot ${stages?.journeys ? "stage-dot-pass" : "stage-dot-pending"}`} />
          <span className="stage-timeline-label">Issues</span>
          {!stages?.journeys && <span className="stage-timeline-pending">pending</span>}
        </div>
      )}
    </div>
  );
}
