import { useRef, useEffect } from "react";
import { artifactUrl } from "../api";

interface Props {
  lines: string[];
  status: string | null;
  historical?: boolean;
  runId?: string;
  projectSlug?: string;
  journeyIds?: string[];
}

export function RunConsole({ lines, status, historical, runId, projectSlug, journeyIds }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="console">
      <div className="console-header">
        Console
        {status && <span className={`ui-badge badge badge-${status}`}>{status}</span>}
      </div>
      <div className="console-body">
        {historical && lines.length === 0 ? (
          <div className="console-historical">
            <p>No live output for historical runs.</p>
            {runId && (
              <div className="console-log-links">
                <span style={{ fontWeight: 500, marginBottom: 4 }}>Saved logs:</span>
                <a
                  className="console-log-link"
                  href={artifactUrl(runId, "artifacts/console.log", projectSlug)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Run console log
                </a>
                {journeyIds?.map((jId) => (
                  <a
                    key={jId}
                    className="console-log-link"
                    href={artifactUrl(runId, `artifacts/journeys/${jId}/console.log`, projectSlug)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {jId} console log
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : lines.length === 0 ? (
          <div style={{ color: "var(--text-muted)" }}>Waiting for output...</div>
        ) : null}
        {lines.map((line, i) => (
          <div key={i} className="console-line">
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
