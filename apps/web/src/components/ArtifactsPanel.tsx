import { useState } from "react";
import { artifactUrl } from "../api";
import { JsonViewerModal } from "./JsonViewerModal";
import type { RunDetail } from "../types";

interface Props {
  detail: RunDetail | null;
  runId: string;
  projectSlug?: string;
}

export function ArtifactsPanel({ detail, runId, projectSlug }: Props) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("");

  if (!detail?.runIndex) {
    return <div className="inspector-empty">Run index not yet available.</div>;
  }

  const { runIndex } = detail;

  // Discovery artifacts
  const discoveryFiles: { label: string; path: string }[] = [];
  if (runIndex.discovery) {
    const d = runIndex.discovery;
    if (d.siteMapPath) discoveryFiles.push({ label: "Site Map", path: d.siteMapPath });
    if (d.actionsPath) discoveryFiles.push({ label: "Actions", path: d.actionsPath });
    if (d.candidatesPath) discoveryFiles.push({ label: "Candidates", path: d.candidatesPath });
    if (d.discoveryMdPath) discoveryFiles.push({ label: "Discovery Summary", path: d.discoveryMdPath });
  }

  const openViewer = (path: string, title: string) => {
    setViewerUrl(artifactUrl(runId, path, projectSlug));
    setViewerTitle(title);
  };

  return (
    <div className="artifacts-panel">
      {discoveryFiles.length > 0 && (
        <div className="artifacts-section">
          <div className="artifacts-section-title">Discovery</div>
          <ul className="artifact-list">
            {discoveryFiles.map((f) => {
              const isJson = f.path.endsWith(".json");
              return (
                <li key={f.path}>
                  {isJson ? (
                    <button className="artifact-view-btn" onClick={() => openViewer(f.path, f.label)}>
                      {f.label}
                    </button>
                  ) : (
                    <a href={artifactUrl(runId, f.path, projectSlug)} target="_blank" rel="noopener noreferrer">
                      {f.label}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {runIndex.journeys.length > 0 && (
        <div className="artifacts-section">
          <div className="artifacts-section-title">Journeys</div>
          {runIndex.journeys.map((j) => (
            <div key={j.journeyId} className="artifact-journey-row">
              <div className="artifact-journey-info">
                <span className={`ui-badge badge badge-${j.status}`} style={{ marginRight: 4, fontSize: 9 }}>{j.status}</span>
                {j.name}
              </div>
              <button
                className="artifact-view-btn"
                onClick={() => openViewer(j.resultPath, `${j.name} — result.json`)}
              >
                View JSON
              </button>
            </div>
          ))}
        </div>
      )}

      {viewerUrl && (
        <JsonViewerModal
          url={viewerUrl}
          title={viewerTitle}
          onClose={() => setViewerUrl(null)}
        />
      )}
    </div>
  );
}
