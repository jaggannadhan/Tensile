import { useState, useEffect } from "react";
import { fetchRepoMeta } from "../api";
import type { RepoMetaFile, RepoMeta } from "../types";

interface Props {
  runId: string;
  repoMetaReady: boolean;
  projectSlug?: string;
}

export function RepoCards({ runId, repoMetaReady, projectSlug }: Props) {
  const [meta, setMeta] = useState<RepoMetaFile | null>(null);

  useEffect(() => {
    if (!repoMetaReady) return;
    fetchRepoMeta(runId, projectSlug).then(setMeta);
  }, [runId, repoMetaReady, projectSlug]);

  if (!meta || meta.repos.length === 0) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <h5 style={{ marginBottom: 6 }}>Linked Repositories</h5>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {meta.repos.map((r) => (
          <RepoCard key={`${r.owner}/${r.repo}`} repo={r} />
        ))}
      </div>
    </div>
  );
}

function RepoCard({ repo }: { repo: RepoMeta }) {
  const shortSha = repo.latestSha.slice(0, 7);
  const { stack } = repo;
  const tags = [...stack.frameworks, ...stack.runtimes];

  return (
    <div className="ui-panel repo-card">
      <div className="repo-card-header">
        <span className={`repo-card-role repo-card-role-${repo.role}`}>{repo.role}</span>
        <a
          className="repo-card-name"
          href={repo.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {repo.owner}/{repo.repo}
        </a>
      </div>
      {repo.description && (
        <div className="repo-card-desc">{repo.description}</div>
      )}
      <div className="repo-card-meta">
        <span title={repo.latestSha}>{shortSha}</span>
        <span>{repo.defaultBranch}</span>
        {repo.language && <span>{repo.language}</span>}
      </div>
      {tags.length > 0 && (
        <div className="repo-card-stack">
          {tags.map((t) => (
            <span key={t} className="stack-tag">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
