import { useState, useEffect } from "react";

interface Props {
  url: string;
  title: string;
  onClose: () => void;
}

export function JsonViewerModal({ url, title, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setContent(null);
    setError(null);
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setContent(JSON.stringify(json, null, 2));
      })
      .catch((err) => setError((err as Error).message));
  }, [url]);

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="json-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="json-viewer-header">
          <span className="json-viewer-title">{title}</span>
          <div className="json-viewer-actions">
            <button className="btn btn-sm" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
            <a
              className="btn btn-sm"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open
            </a>
            <button className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="json-viewer-body">
          {error && <div className="json-viewer-error">Error: {error}</div>}
          {!error && !content && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading...</div>}
          {content && <pre>{content}</pre>}
        </div>
      </div>
    </div>
  );
}
