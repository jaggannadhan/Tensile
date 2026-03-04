import { useEffect, useRef, useState } from "react";
import type { SSEEvent } from "../types";

export function useSSE(runId: string | null) {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [indexReady, setIndexReady] = useState(false);
  const [repoMetaReady, setRepoMetaReady] = useState(false);
  const [stagesReady, setStagesReady] = useState(false);
  const [issuesReady, setIssuesReady] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Reset on runId change
    setLines([]);
    setStatus(null);
    setIndexReady(false);
    setRepoMetaReady(false);
    setStagesReady(false);
    setIssuesReady(false);

    if (!runId) return;

    const es = new EventSource(`/api/runs/${runId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data);
        switch (event.type) {
          case "line":
            setLines((prev) => [...prev, event.text]);
            break;
          case "status":
            setStatus(event.status);
            break;
          case "indexReady":
            setIndexReady(true);
            break;
          case "repoMetaReady":
            setRepoMetaReady(true);
            break;
          case "stagesReady":
            setStagesReady(true);
            break;
          case "issuesReady":
            setIssuesReady(true);
            break;
        }
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [runId]);

  return { lines, status, indexReady, repoMetaReady, stagesReady, issuesReady };
}
