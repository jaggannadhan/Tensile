import { useState } from "react";
import { createRun } from "../api";

interface Props {
  onNewRun: (runId: string) => void;
}

interface RepoEntry {
  url: string;
  role: string;
}

const ROLE_OPTIONS = ["frontend", "backend", "api", "shared", "other"];

export function NewRunForm({ onNewRun }: Props) {
  const [url, setUrl] = useState("https://example.com");
  const [smoke, setSmoke] = useState(true);
  const [discover, setDiscover] = useState(true);
  const [journeys, setJourneys] = useState("topN:3");
  const [maxPages, setMaxPages] = useState(10);
  const [maxDepth, setMaxDepth] = useState(2);
  const [showRepos, setShowRepos] = useState(false);
  const [repos, setRepos] = useState<RepoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addRepo = () => setRepos([...repos, { url: "", role: "frontend" }]);
  const removeRepo = (i: number) => setRepos(repos.filter((_, idx) => idx !== i));
  const updateRepo = (i: number, field: keyof RepoEntry, value: string) => {
    const copy = [...repos];
    copy[i] = { ...copy[i], [field]: value };
    setRepos(copy);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validRepos = repos.filter((r) => r.url.trim());
      const { runId } = await createRun({
        url,
        options: {
          smoke,
          discover,
          journeys: discover && journeys !== "none" ? journeys : undefined,
          headless: true,
          maxPages,
          maxDepth,
        },
        repos: validRepos.length > 0 ? validRepos : undefined,
      });
      onNewRun(runId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="sidebar-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label>Target URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          required
        />
      </div>

      <div className="form-row" style={{ marginBottom: 8 }}>
        <label className="form-checkbox">
          <input type="checkbox" checked={smoke} onChange={(e) => setSmoke(e.target.checked)} />
          Smoke
        </label>
        <label className="form-checkbox">
          <input type="checkbox" checked={discover} onChange={(e) => setDiscover(e.target.checked)} />
          Discover
        </label>
      </div>

      {discover && (
        <>
          <div className="form-group">
            <label>Journeys</label>
            <select value={journeys} onChange={(e) => setJourneys(e.target.value)}>
              <option value="topN:3">Top 3</option>
              <option value="topN:5">Top 5</option>
              <option value="topN:10">Top 10</option>
              <option value="critical">Critical only (P0)</option>
              <option value="none">None</option>
            </select>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Max Pages</label>
              <input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                min={1}
                max={20}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Max Depth</label>
              <input
                type="number"
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
                min={1}
                max={5}
              />
            </div>
          </div>
        </>
      )}

      <div style={{ marginBottom: 8 }}>
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={showRepos}
            onChange={(e) => {
              setShowRepos(e.target.checked);
              if (e.target.checked && repos.length === 0) addRepo();
            }}
          />
          Link GitHub repos
        </label>
      </div>

      {showRepos && (
        <div className="repos-section">
          {repos.map((repo, i) => (
            <div key={i} className="repo-entry">
              <div className="repo-entry-fields">
                <input
                  type="text"
                  value={repo.url}
                  onChange={(e) => updateRepo(i, "url", e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="repo-entry-url"
                />
                <select
                  value={repo.role}
                  onChange={(e) => updateRepo(i, "role", e.target.value)}
                  className="repo-entry-role"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="repo-entry-remove"
                  onClick={() => removeRepo(i)}
                  title="Remove"
                >
                  x
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-secondary" onClick={addRepo} style={{ marginBottom: 8 }}>
            + Add repo
          </button>
        </div>
      )}

      <div className="form-preview">
        Will run: {smoke ? "Smoke" : ""}
        {smoke && discover ? " + " : ""}
        {discover ? "Discovery" : ""}
        {discover && journeys !== "none" ? ` + Journeys (${journeys})` : ""}
      </div>

      {error && <div style={{ color: "var(--fail)", fontSize: 12, marginBottom: 4 }}>{error}</div>}

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Starting..." : "Start Run"}
      </button>
    </form>
  );
}
