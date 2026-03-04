import { useRef, useEffect } from "react";

interface Props {
  lines: string[];
  status: string | null;
}

export function RunConsole({ lines, status }: Props) {
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
        {lines.length === 0 && (
          <div style={{ color: "var(--text-muted)" }}>Waiting for output...</div>
        )}
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
