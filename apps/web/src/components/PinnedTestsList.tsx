import { useState, useEffect, useCallback } from "react";
import { fetchPinnedTests, runPinnedTest, deletePinnedTest } from "../api";
import type { PinnedTestSummary } from "../types";

interface Props {
  slug: string;
  onRunPinnedTest: (runId: string) => void;
}

export function PinnedTestsList({ slug, onRunPinnedTest }: Props) {
  const [tests, setTests] = useState<PinnedTestSummary[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchPinnedTests(slug).then(setTests);
  }, [slug]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRun = async (testId: string) => {
    setRunning(testId);
    try {
      const result = await runPinnedTest(slug, testId);
      onRunPinnedTest(result.runId);
    } catch (err) {
      console.error("[Tensile] failed to run pinned test:", err);
    } finally {
      setRunning(null);
    }
  };

  const handleDelete = async (testId: string) => {
    try {
      await deletePinnedTest(slug, testId);
      refresh();
    } catch (err) {
      console.error("[Tensile] failed to delete pinned test:", err);
    }
  };

  if (tests.length === 0) return null;

  return (
    <div className="pinned-tests-section">
      <div className="pinned-tests-header">Pinned Tests</div>
      {tests.map((t) => (
        <div key={t.testId} className="pinned-test-card">
          <div className="pinned-test-info">
            <span className="pinned-test-name">{t.name}</span>
            <span className="pinned-test-meta">
              {t.patchCount} patch{t.patchCount !== 1 ? "es" : ""}
            </span>
          </div>
          <div className="pinned-test-actions">
            <button
              className="btn btn-sm btn-primary"
              onClick={() => handleRun(t.testId)}
              disabled={running === t.testId}
            >
              {running === t.testId ? "..." : "Run"}
            </button>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => handleDelete(t.testId)}
              title="Delete pinned test"
            >
              Del
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
