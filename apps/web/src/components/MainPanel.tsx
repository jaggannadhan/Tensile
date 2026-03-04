import { useSSE } from "../hooks/useSSE";
import { stopRun } from "../api";
import { RunConsole } from "./RunConsole";
import { RunSummary } from "./RunSummary";

interface Props {
  runId: string | null;
  runStatus?: string;
  projectSlug?: string;
}

export function MainPanel({ runId, runStatus, projectSlug }: Props) {
  const { lines, status: sseStatus, indexReady, repoMetaReady, stagesReady, issuesReady } = useSSE(runId);
  const effectiveStatus = sseStatus ?? runStatus ?? null;
  const isRunning = effectiveStatus === null || effectiveStatus === "running";

  if (!runId) {
    return (
      <div className="main-panel main-empty">
        Select or start a run to see output
      </div>
    );
  }

  return (
    <div className="main-panel">
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 13,
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {runId.slice(0, 8)}...
        </span>
        {isRunning && (
          <button
            className="btn btn-sm btn-danger"
            onClick={() => stopRun(runId)}
          >
            Stop
          </button>
        )}
      </div>
      <RunConsole lines={lines} status={effectiveStatus} />
      {indexReady && (
        <RunSummary
          runId={runId}
          repoMetaReady={repoMetaReady}
          stagesReady={stagesReady}
          issuesReady={issuesReady}
          projectSlug={projectSlug}
        />
      )}
    </div>
  );
}
