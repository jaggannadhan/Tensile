import { useRef, useState, useEffect, useMemo } from "react";
import type { TargetSuggestion } from "../types";

interface Props {
  screenshotUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  candidates: TargetSuggestion[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  maxVisible?: number;
}

interface Cluster {
  indices: number[];
  anchorX: number;
  anchorY: number;
}

function computeIoU(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  return inter / (areaA + areaB - inter);
}

function buildClusters(
  candidates: TargetSuggestion[],
  visibleCount: number,
): { singles: number[]; clusters: Cluster[] } {
  const visible = candidates.slice(0, visibleCount);
  const assigned = new Set<number>();
  const clusters: Cluster[] = [];
  const singles: number[] = [];

  for (let i = 0; i < visible.length; i++) {
    if (assigned.has(i)) continue;
    const a = visible[i].bbox;
    if (!a) { singles.push(i); assigned.add(i); continue; }

    const group = [i];
    for (let j = i + 1; j < visible.length; j++) {
      if (assigned.has(j)) continue;
      const b = visible[j].bbox;
      if (!b) continue;
      if (computeIoU(a, b) > 0.35) {
        group.push(j);
        assigned.add(j);
      }
    }
    assigned.add(i);

    if (group.length === 1) {
      singles.push(i);
    } else {
      clusters.push({
        indices: group,
        anchorX: a.x,
        anchorY: a.y,
      });
    }
  }

  return { singles, clusters };
}

export function OverlayPicker({
  screenshotUrl,
  viewportWidth,
  viewportHeight,
  candidates,
  selectedIndex,
  onSelect,
  maxVisible = 10,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(360);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null);

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

  const visibleCount = showAll ? Math.min(candidates.length, 20) : maxVisible;
  const { singles, clusters } = useMemo(
    () => buildClusters(candidates, visibleCount),
    [candidates, visibleCount],
  );

  const scale = containerWidth / viewportWidth;
  const scaledHeight = viewportHeight * scale;

  // Check if selected index is within a cluster (show its box even if clustered)
  const selectedInCluster = clusters.find((c) => selectedIndex !== null && c.indices.includes(selectedIndex));

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

        {/* Single (non-clustered) boxes */}
        {singles.map((i) => {
          const c = candidates[i];
          const bbox = c.bbox;
          if (!bbox) return null;
          const isSelected = selectedIndex === i;
          const isHovered = hoveredIndex === i;

          return (
            <div
              key={`s-${i}`}
              className={`overlay-box${isSelected ? " overlay-box--selected" : ""}${isHovered ? " overlay-box--hover" : ""}`}
              style={{
                left: bbox.x * scale,
                top: bbox.y * scale,
                width: bbox.width * scale,
                height: bbox.height * scale,
              }}
              onClick={() => onSelect(i)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span
                className={`overlay-chip${isSelected ? " overlay-chip--selected" : ""}`}
                onClick={(e) => { e.stopPropagation(); onSelect(i); }}
              >
                {i + 1}
              </span>
              {(isHovered || isSelected) && (
                <div className="overlay-tooltip">
                  {c.humanLabel}
                </div>
              )}
            </div>
          );
        })}

        {/* Selected box within a cluster (show its outline) */}
        {selectedInCluster && selectedIndex !== null && (() => {
          const c = candidates[selectedIndex];
          const bbox = c?.bbox;
          if (!bbox) return null;
          return (
            <div
              key={`sel-${selectedIndex}`}
              className="overlay-box overlay-box--selected"
              style={{
                left: bbox.x * scale,
                top: bbox.y * scale,
                width: bbox.width * scale,
                height: bbox.height * scale,
                pointerEvents: "none",
              }}
            />
          );
        })()}

        {/* Cluster chips */}
        {clusters.map((cluster, ci) => {
          const isExpanded = expandedCluster === ci;
          return (
            <div
              key={`c-${ci}`}
              className="overlay-cluster"
              style={{
                left: cluster.anchorX * scale,
                top: cluster.anchorY * scale - 12,
              }}
            >
              <span
                className="overlay-chip overlay-chip--cluster"
                onClick={() => setExpandedCluster(isExpanded ? null : ci)}
              >
                +{cluster.indices.length}
              </span>
              {isExpanded && (
                <div className="overlay-cluster-popover">
                  {cluster.indices.map((idx) => {
                    const c = candidates[idx];
                    return (
                      <div
                        key={idx}
                        className={`overlay-cluster-item${selectedIndex === idx ? " selected" : ""}`}
                        onClick={() => { onSelect(idx); setExpandedCluster(null); }}
                      >
                        <span className="overlay-chip overlay-chip--sm">{idx + 1}</span>
                        <span className="overlay-cluster-item-label">{c.humanLabel || "(no label)"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Overlay count toggle */}
      {candidates.length > maxVisible && (
        <div className="overlay-count-toggle">
          <button
            className={`btn btn-sm ${!showAll ? "btn-primary" : "btn-ghost"}`}
            onClick={() => { setShowAll(false); setExpandedCluster(null); }}
          >
            Show {maxVisible}
          </button>
          <button
            className={`btn btn-sm ${showAll ? "btn-primary" : "btn-ghost"}`}
            onClick={() => { setShowAll(true); setExpandedCluster(null); }}
          >
            Show {Math.min(candidates.length, 20)}
          </button>
        </div>
      )}
    </div>
  );
}
