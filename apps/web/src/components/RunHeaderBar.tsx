import { CopyRunReport } from "./CopyRunReport";
import { RepoCards } from "./RepoCards";
import type { RunDetail, JourneyResult, RepoMetaFile } from "../types";

interface Props {
  runId: string;
  detail: RunDetail | null;
  sseStatus: string | null;
  runStatus: string | undefined;
  journeyResults: Map<string, JourneyResult>;
  repoMeta: RepoMetaFile | null;
  repoMetaReady: boolean;
  projectSlug?: string;
  onStop: () => void;
}

export function RunHeaderBar({ runId, detail, sseStatus, runStatus, journeyResults, repoMeta, repoMetaReady, projectSlug, onStop }: Props) {
  const effectiveStatus = sseStatus ?? runStatus ?? null;
  const isRunning = effectiveStatus === null || effectiveStatus === "running";

  const runIndex = detail?.runIndex;
  const duration = runIndex?.endedAt && runIndex?.startedAt
    ? new Date(runIndex.endedAt).getTime() - new Date(runIndex.startedAt).getTime()
    : null;

  return (
    <div className="run-header-bar">
      <div className="run-header-info">
        <span className="run-header-url">{runIndex?.targetUrl ?? runId.slice(0, 8) + "..."}</span>
        {projectSlug && (
          <span className="run-header-slug">{projectSlug}</span>
        )}
        {runIndex?.envName && (
          <span className="ui-badge badge badge-stopped" style={{ fontSize: 10 }}>{runIndex.envName}</span>
        )}
        {effectiveStatus && (
          <span className={`ui-badge badge badge-${effectiveStatus}`}>{effectiveStatus}</span>
        )}
        {effectiveStatus && effectiveStatus !== "running" && (
          <span className="ui-badge badge badge-stopped" style={{ fontSize: 10 }}>Historical</span>
        )}
        {duration !== null && (
          <span className="run-header-duration">{duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}</span>
        )}
        {runIndex?.startedAt && (
          <span className="run-header-time">{new Date(runIndex.startedAt).toLocaleString()}</span>
        )}
      </div>
      <div className="run-header-actions">
        {detail && <CopyRunReport runId={runId} detail={detail} journeyResults={journeyResults} projectSlug={projectSlug} />}
        {isRunning && (
          <button className="btn btn-sm btn-danger" onClick={onStop}>Stop</button>
        )}
      </div>
    </div>
  );
}
