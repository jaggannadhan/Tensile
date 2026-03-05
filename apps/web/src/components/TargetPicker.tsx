import { useState, useEffect, useMemo } from "react";
import { fetchPageActions, captureOverlay } from "../api";
import { OverlayPicker } from "./OverlayPicker";
import type { StepResult, ActionTarget, SelectorSpec, TargetSuggestion, ScoreBreakdownEntry, OverlayData } from "../types";

interface Props {
  runId: string;
  projectSlug?: string;
  currentStep: StepResult;
  onSelect: (selector: SelectorSpec, label?: string) => void;
  onCancel: () => void;
}

const SHOW_LIMIT = 20;

const TIMESTAMP_RE = /\b(last|ago|today|yesterday|version|build|v\d|updated|modified|\d{2}:\d{2}|\d{4}-\d{2})/i;

export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

export function tokenOverlap(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = new Set(tokenize(b));
  if (tokensA.length === 0 || tokensB.size === 0) return 0;
  let matches = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) matches++;
  }
  return matches / Math.max(tokensA.length, tokensB.size);
}

export function scoreTarget(target: ActionTarget, step: StepResult): TargetSuggestion {
  let score = 0;
  const reasons: string[] = [];
  const breakdown: ScoreBreakdownEntry[] = [];

  const refLabel = step.label ?? step.name;
  const labelSim = tokenOverlap(target.humanLabel, refLabel);
  const labelDelta = Math.round(labelSim * 30);
  score += labelDelta;
  if (labelDelta > 0) breakdown.push({ key: "label_similarity", delta: labelDelta, note: "Label token overlap" });
  if (labelSim > 0.5) reasons.push("Same label");

  if (target.selector.startsWith("[data-testid=") || target.selector.startsWith("[data-test=") || target.selector.startsWith("[data-cy=")) {
    score += 20;
    breakdown.push({ key: "selector_quality", delta: 20, note: "Has data-testid" });
    reasons.push("Has testid");
  } else if (target.selector.startsWith("[role=") || target.selector.startsWith("#")) {
    score += 10;
    breakdown.push({ key: "selector_quality", delta: 10, note: "Role or ID selector" });
    reasons.push("Stable selector");
  }

  const confDelta = Math.round(target.confidence * 10);
  score += confDelta;
  breakdown.push({ key: "confidence", delta: confDelta, note: `Confidence ${(target.confidence * 100).toFixed(0)}%` });
  if (target.confidence > 0.8) reasons.push("High confidence");

  if (TIMESTAMP_RE.test(target.humanLabel)) {
    score -= 20;
    breakdown.push({ key: "timestamp_penalty", delta: -20, note: "Looks like timestamp/version" });
  }

  if (target.riskFlags.looksDestructive) {
    score -= 15;
    breakdown.push({ key: "destructive_penalty", delta: -15, note: "Looks destructive" });
    reasons.push("Destructive");
  }

  return { ...target, score, reasons, breakdown };
}

export function TargetPicker({ runId, projectSlug, currentStep, onSelect, onCancel }: Props) {
  const [actions, setActions] = useState<ActionTarget[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [customSelector, setCustomSelector] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "overlay">("list");
  const [overlayData, setOverlayData] = useState<OverlayData | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchPageActions(runId, projectSlug).then((data) => {
      setActions(data);
      setLoading(false);
    });
  }, [runId, projectSlug]);

  const suggestions = useMemo(() => {
    if (!actions) return [];

    const relevantTypes = new Set<string>();
    if (currentStep.actionType === "click") {
      relevantTypes.add("CLICK");
      relevantTypes.add("NAVIGATE");
    } else if (currentStep.actionType === "fill") {
      relevantTypes.add("FILL");
    } else {
      for (const a of actions) relevantTypes.add(a.actionType);
    }

    const filtered = actions.filter((a) => relevantTypes.has(a.actionType));
    const scored = filtered.map((a) => scoreTarget(a, currentStep));
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [actions, currentStep]);

  // Apply search filter
  const filteredSuggestions = useMemo(() => {
    if (!search.trim()) return suggestions;
    const q = search.toLowerCase();
    return suggestions.filter(
      (s) => s.humanLabel.toLowerCase().includes(q) || s.selector.toLowerCase().includes(q),
    );
  }, [suggestions, search]);

  const visibleSuggestions = showAll ? filteredSuggestions : filteredSuggestions.slice(0, SHOW_LIMIT);

  // Fetch overlay data on demand when switching to overlay view
  useEffect(() => {
    if (viewMode !== "overlay" || overlayData || overlayLoading) return;

    const pageUrl = visibleSuggestions[0]?.pageUrl;
    if (!pageUrl) return;

    const selectors = visibleSuggestions.slice(0, 20).map((s, i) => ({
      id: String(i),
      selector: s.selector,
      strategy: s.selector.startsWith("[data-testid=") ? "data-testid"
        : s.selector.startsWith("[role=") ? "role"
        : s.selector.startsWith("#") ? "id"
        : "css",
    }));

    setOverlayLoading(true);
    setOverlayError(null);
    captureOverlay(runId, projectSlug, pageUrl, selectors)
      .then(setOverlayData)
      .catch((err) => setOverlayError((err as Error).message))
      .finally(() => setOverlayLoading(false));
  }, [viewMode, overlayData, overlayLoading, runId, projectSlug, visibleSuggestions]);

  const handleApplySelected = () => {
    if (selectedIndex === null) return;
    const s = visibleSuggestions[selectedIndex];
    if (!s) return;
    const selector: SelectorSpec = {
      primary: s.selector,
      fallbacks: s.selectorCandidates ?? [],
      strategy: s.selector.startsWith("[data-testid=") ? "data-testid"
        : s.selector.startsWith("[role=") ? "role"
        : s.selector.startsWith("#") ? "id"
        : "css",
    };
    onSelect(selector, s.humanLabel);
  };

  const handleCustomSubmit = () => {
    if (!customSelector.trim()) return;
    const selector: SelectorSpec = {
      primary: customSelector.trim(),
      fallbacks: [],
      strategy: "css",
    };
    onSelect(selector);
  };

  if (loading) {
    return (
      <div className="target-picker">
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Loading alternatives...</div>
      </div>
    );
  }

  const selectedSuggestion = selectedIndex !== null ? visibleSuggestions[selectedIndex] : null;

  return (
    <div className="target-picker">
      <div className="target-picker-header">
        <span>Select replacement target</span>
        <input
          className="target-picker-search"
          type="text"
          placeholder="Search by label or selector..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedIndex(null); }}
        />
        <div className="target-picker-view-toggle">
          <button
            className={`btn btn-sm ${viewMode === "list" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setViewMode("list")}
          >List</button>
          <button
            className={`btn btn-sm ${viewMode === "overlay" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setViewMode("overlay")}
          >Preview</button>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
      </div>

      {/* Current target info */}
      <div className="target-picker-current">
        <span className="target-picker-current-label">Current:</span>
        <span>{currentStep.label ?? currentStep.name}</span>
        {currentStep.selector && (
          <code>{currentStep.selector.primary}</code>
        )}
      </div>

      {/* Before/After comparison block */}
      {selectedSuggestion && (
        <div className="target-picker-comparison">
          <div className="comparison-row comparison-before">
            <span className="comparison-label">Current</span>
            <span className="comparison-value">{currentStep.label ?? currentStep.name}</span>
            {currentStep.selector && <code>{currentStep.selector.primary}</code>}
          </div>
          <div className="comparison-row comparison-after">
            <span className="comparison-label">Selected</span>
            <span className="comparison-value">{selectedSuggestion.humanLabel}</span>
            <code>{selectedSuggestion.selector}</code>
            <span className="comparison-score">Score: {selectedSuggestion.score}</span>
          </div>
        </div>
      )}

      {viewMode === "list" ? (
        /* List view */
        filteredSuggestions.length > 0 ? (
          <>
            <table className="target-picker-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Selector</th>
                  <th>Score</th>
                  <th>Reasons</th>
                </tr>
              </thead>
              <tbody>
                {visibleSuggestions.map((s, i) => (
                  <>
                    <tr
                      key={i}
                      className={selectedIndex === i ? "target-picker-row-selected" : ""}
                      onClick={() => setSelectedIndex(i)}
                    >
                      <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.humanLabel || "(no label)"}
                      </td>
                      <td>{s.actionType}</td>
                      <td className="coverage-selector-cell">{s.selector}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{s.score}</td>
                      <td>
                        {s.reasons.map((r, j) => (
                          <span
                            key={j}
                            className={`reason-chip ${r === "Destructive" ? "reason-chip-negative" : "reason-chip-positive"}`}
                          >
                            {r}
                          </span>
                        ))}
                        <button
                          className="btn-why"
                          onClick={(e) => { e.stopPropagation(); setExpandedIndex(expandedIndex === i ? null : i); }}
                          title="Score breakdown"
                        >
                          {expandedIndex === i ? "Hide" : "Why?"}
                        </button>
                      </td>
                    </tr>
                    {expandedIndex === i && (
                      <tr key={`${i}-breakdown`} className="breakdown-row">
                        <td colSpan={5}>
                          <div className="breakdown-entries">
                            {s.breakdown.map((b, k) => (
                              <div key={k} className="breakdown-entry">
                                <span className={`breakdown-delta ${b.delta >= 0 ? "breakdown-positive" : "breakdown-negative"}`}>
                                  {b.delta >= 0 ? "+" : ""}{b.delta}
                                </span>
                                <span className="breakdown-note">{b.note}</span>
                              </div>
                            ))}
                            {s.breakdown.length === 0 && (
                              <span style={{ color: "var(--text-muted)", fontSize: 10 }}>Base score only</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            {!showAll && filteredSuggestions.length > SHOW_LIMIT && (
              <button className="coverage-show-more" onClick={() => setShowAll(true)}>
                Show all ({filteredSuggestions.length})
              </button>
            )}
          </>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "4px 0" }}>
            {search.trim() ? "No matches found." : "No discovery data available. Enter a custom selector below."}
          </div>
        )
      ) : (
        /* Overlay view */
        overlayLoading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "12px 0", textAlign: "center" }}>
            Generating preview...
          </div>
        ) : overlayError ? (
          <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "8px 0" }}>
            Preview unavailable: {overlayError}.{" "}
            <button className="btn btn-sm btn-ghost" onClick={() => setViewMode("list")}>Use list</button>
          </div>
        ) : overlayData ? (
          <OverlayPicker
            screenshotUrl={overlayData.screenshotUrl}
            viewportWidth={overlayData.viewportWidth}
            viewportHeight={overlayData.viewportHeight}
            candidates={visibleSuggestions.slice(0, 20)}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
        ) : null
      )}

      {/* Footer with Apply/Cancel */}
      <div className="target-picker-footer">
        <div className="target-picker-custom">
          <input
            type="text"
            placeholder="Custom selector (e.g. button:has-text('Save'))"
            value={customSelector}
            onChange={(e) => setCustomSelector(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
          />
          <button className="btn btn-sm btn-secondary" onClick={handleCustomSubmit} disabled={!customSelector.trim()}>
            Use Custom
          </button>
        </div>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleApplySelected}
          disabled={selectedIndex === null}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
