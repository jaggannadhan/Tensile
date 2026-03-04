import { useRef, useState, useEffect } from "react";
import type { TargetSuggestion } from "../types";

interface Props {
  screenshotUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  candidates: TargetSuggestion[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function OverlayPicker({
  screenshotUrl,
  viewportWidth,
  viewportHeight,
  candidates,
  selectedIndex,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(360);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);

    return () => ro.disconnect();
  }, []);

  const scale = containerWidth / viewportWidth;
  const scaledHeight = viewportHeight * scale;

  return (
    <div className="overlay-picker" ref={containerRef}>
      <div style={{ position: "relative", width: "100%", height: scaledHeight }}>
        <img
          className="overlay-picker-img"
          src={screenshotUrl}
          alt="Page screenshot"
          style={{ width: "100%", height: scaledHeight, objectFit: "cover" }}
          draggable={false}
        />
        {candidates.map((c, i) => {
          const bbox = c.bbox;
          if (!bbox) return null;
          const isSelected = selectedIndex === i;
          const isHovered = hoveredIndex === i;
          const confidence = c.confidence;
          const borderColor = confidence > 0.8 ? "var(--pass)" : confidence < 0.6 ? "var(--warn)" : "var(--accent)";

          return (
            <div
              key={i}
              className={`overlay-box${isSelected ? " selected" : ""}`}
              style={{
                left: bbox.x * scale,
                top: bbox.y * scale,
                width: bbox.width * scale,
                height: bbox.height * scale,
                borderColor: isSelected ? "var(--pass)" : borderColor,
              }}
              onClick={() => onSelect(i)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className="overlay-box-label">{i + 1}</span>
              {isHovered && (
                <div className="overlay-tooltip">
                  {c.humanLabel}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
