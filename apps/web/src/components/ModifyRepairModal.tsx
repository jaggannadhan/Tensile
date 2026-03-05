import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogHeader, DialogBody, DialogFooter } from "./ui/Dialog";
import { OverlayPicker } from "./OverlayPicker";
import { scoreTarget } from "./TargetPicker";
import { fetchPageActions, captureOverlay } from "../api";
import type { StepResult, ActionTarget, SelectorSpec, TargetSuggestion, OverlayData } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  runId: string;
  projectSlug?: string;
  currentStep: StepResult;
  stepIndex: number;
  onApply: (selector: SelectorSpec, label?: string) => void;
}

const CANDIDATE_LIMIT = 20;

type ActionFilter = "ALL" | "CLICK" | "NAVIGATE" | "FILL";

function deriveReasonChips(s: TargetSuggestion): string[] {
  const chips: string[] = [];
  if (s.selector.startsWith("[data-testid=") || s.selector.startsWith("[data-test=") || s.selector.startsWith("[data-cy=")) {
    chips.push("testid");
  } else if (s.selector.startsWith("[role=") || s.selector.startsWith("#")) {
    chips.push("stable");
  }
  if (s.confidence >= 0.8) chips.push("high conf");
  if (s.reasons.includes("Same label")) chips.push("same label");
  if (s.riskFlags.looksDestructive) chips.push("destructive");
  return chips;
}

export function ModifyRepairModal({ open, onClose, runId, projectSlug, currentStep, stepIndex, onApply }: Props) {
  const [actions, setActions] = useState<ActionTarget[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [overlayData, setOverlayData] = useState<OverlayData | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customSelector, setCustomSelector] = useState("");
  const [zoom, setZoom] = useState<"fit" | "100%">("fit");

  // Fetch page actions on mount
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchPageActions(runId, projectSlug).then((data) => {
      setActions(data);
      setLoading(false);
    });
  }, [open, runId, projectSlug]);

  // Score and sort all suggestions (unfiltered)
  const allSuggestions = useMemo(() => {
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

  // Apply search + action filter
  const filteredSuggestions = useMemo(() => {
    let list = allSuggestions;

    if (actionFilter !== "ALL") {
      list = list.filter((s) => s.actionType === actionFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) => s.humanLabel.toLowerCase().includes(q) || s.selector.toLowerCase().includes(q),
      );
    }

    return list;
  }, [allSuggestions, actionFilter, search]);

  const visibleSuggestions = filteredSuggestions.slice(0, CANDIDATE_LIMIT);

  // Compute available action types for filter chips
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const s of allSuggestions) types.add(s.actionType);
    return types;
  }, [allSuggestions]);

  // Fetch overlay data once suggestions are ready
  useEffect(() => {
    if (!open || overlayData || overlayLoading || allSuggestions.length === 0) return;

    const pageUrl = allSuggestions[0]?.pageUrl;
    if (!pageUrl) return;

    // Always capture top 20 from allSuggestions (unfiltered) for stable overlay
    const selectors = allSuggestions.slice(0, CANDIDATE_LIMIT).map((s, i) => ({
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
  }, [open, overlayData, overlayLoading, runId, projectSlug, allSuggestions]);

  const selectedSuggestion = selectedIndex !== null ? visibleSuggestions[selectedIndex] : null;

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
    onApply(selector, s.humanLabel);
  };

  const handleCustomSubmit = () => {
    if (!customSelector.trim()) return;
    const selector: SelectorSpec = {
      primary: customSelector.trim(),
      fallbacks: [],
      strategy: "css",
    };
    onApply(selector);
  };

  // Map filtered visibleSuggestions indices to allSuggestions indices for overlay
  const overlayIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    for (let vi = 0; vi < visibleSuggestions.length; vi++) {
      const idx = allSuggestions.indexOf(visibleSuggestions[vi]);
      if (idx !== -1 && idx < CANDIDATE_LIMIT) map.set(vi, idx);
    }
    return map;
  }, [visibleSuggestions, allSuggestions]);

  // For overlay: map selectedIndex in filtered list to allSuggestions index
  const overlaySelectedIndex = selectedIndex !== null ? (overlayIndexMap.get(selectedIndex) ?? null) : null;

  // When overlay selects, map back to filtered index
  const handleOverlaySelect = (overlayIdx: number) => {
    for (const [vi, ai] of overlayIndexMap) {
      if (ai === overlayIdx) { setSelectedIndex(vi); return; }
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} size="fullscreen">
      <DialogHeader
        title={`Modify Step: "${currentStep.name}"`}
        description={`Step ${stepIndex + 1} \u00b7 ${currentStep.actionType ?? "action"}`}
        onClose={onClose}
      />
      <DialogBody>
        <div className="modify-modal-body">
          {/* Left: Preview */}
          <div className="modify-modal-preview">
            {loading ? (
              <div className="modify-preview-empty">Loading actions...</div>
            ) : overlayLoading ? (
              <div className="modify-preview-empty">Generating preview...</div>
            ) : overlayError ? (
              <div className="modify-preview-empty">
                Preview unavailable: {overlayError}
              </div>
            ) : overlayData ? (
              <div style={zoom === "100%" ? { width: overlayData.viewportWidth } : undefined}>
                <OverlayPicker
                  screenshotUrl={overlayData.screenshotUrl}
                  viewportWidth={overlayData.viewportWidth}
                  viewportHeight={overlayData.viewportHeight}
                  candidates={allSuggestions.slice(0, CANDIDATE_LIMIT)}
                  selectedIndex={overlaySelectedIndex}
                  onSelect={handleOverlaySelect}
                  maxVisible={10}
                />
              </div>
            ) : (
              <div className="modify-preview-empty">No preview data available.</div>
            )}
            <div className="modify-zoom-controls">
              <button
                className={`btn btn-sm ${zoom === "fit" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setZoom("fit")}
              >Fit</button>
              <button
                className={`btn btn-sm ${zoom === "100%" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setZoom("100%")}
              >100%</button>
            </div>
          </div>

          {/* Right: Selection */}
          <div className="modify-modal-selection">
            {/* Search */}
            <input
              className="modify-search-input"
              type="text"
              placeholder="Search by label or selector..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedIndex(null); }}
            />

            {/* Filter chips */}
            <div className="modify-filter-chips">
              {(["ALL", "CLICK", "NAVIGATE", "FILL"] as ActionFilter[]).map((f) => (
                (f === "ALL" || availableTypes.has(f)) && (
                  <button
                    key={f}
                    className={`modify-filter-chip${actionFilter === f ? " active" : ""}`}
                    onClick={() => { setActionFilter(f); setSelectedIndex(null); }}
                  >
                    {f === "ALL" ? `All (${allSuggestions.length})` : f}
                  </button>
                )
              ))}
            </div>

            {/* Candidate list */}
            <div className="modify-candidate-list">
              {visibleSuggestions.map((s, i) => {
                const chips = deriveReasonChips(s);
                const isSelected = selectedIndex === i;
                return (
                  <div key={i}>
                    <div
                      className={`modify-candidate-item${isSelected ? " selected" : ""}`}
                      onClick={() => setSelectedIndex(i)}
                    >
                      <span className="modify-candidate-num">{i + 1}</span>
                      <div className="modify-candidate-info">
                        <span className="modify-candidate-label" title={s.humanLabel}>
                          {s.humanLabel || "(no label)"}
                        </span>
                        <div className="modify-candidate-meta">
                          <span className="modify-candidate-type">{s.actionType}</span>
                          {chips.map((chip, j) => (
                            <span
                              key={j}
                              className={`modify-reason-chip${chip === "destructive" ? " destructive" : ""}`}
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="modify-candidate-score">{s.score}</span>
                      <button
                        className="btn-why"
                        onClick={(e) => { e.stopPropagation(); setExpandedIndex(expandedIndex === i ? null : i); }}
                        title="Score breakdown"
                      >
                        {expandedIndex === i ? "Hide" : "Why?"}
                      </button>
                    </div>
                    {expandedIndex === i && (
                      <div className="modify-breakdown">
                        {s.breakdown.map((b, k) => (
                          <div key={k} className="modify-breakdown-entry">
                            <span className={`modify-breakdown-delta ${b.delta >= 0 ? "modify-breakdown-positive" : "modify-breakdown-negative"}`}>
                              {b.delta >= 0 ? "+" : ""}{b.delta}
                            </span>
                            <span>{b.note}</span>
                          </div>
                        ))}
                        {s.breakdown.length === 0 && (
                          <span style={{ color: "var(--text-muted)", fontSize: 10 }}>Base score only</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredSuggestions.length === 0 && !loading && (
                <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "8px 0" }}>
                  {search.trim() || actionFilter !== "ALL" ? "No matches found." : "No discovery data available."}
                </div>
              )}
              {filteredSuggestions.length > CANDIDATE_LIMIT && (
                <div style={{ color: "var(--text-muted)", fontSize: 11, padding: "4px 8px" }}>
                  Showing top {CANDIDATE_LIMIT} of {filteredSuggestions.length}
                </div>
              )}
            </div>

            {/* Selected summary */}
            <div className="modify-selected-summary">
              {selectedSuggestion ? (
                <>
                  <strong>Selected:</strong> #{selectedIndex! + 1} {selectedSuggestion.humanLabel}
                  <span className="modify-candidate-type" style={{ marginLeft: 4 }}>{selectedSuggestion.actionType}</span>
                  <span style={{ marginLeft: 4, fontFamily: "var(--font-mono)", fontSize: 11 }}>score {selectedSuggestion.score}</span>
                </>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>No replacement selected</span>
              )}
            </div>

            {/* Before/After comparison */}
            {selectedSuggestion && (
              <div className="modify-comparison">
                <div className="modify-comparison-row">
                  <span className="modify-comparison-label">Current</span>
                  <span className="modify-comparison-value">{currentStep.label ?? currentStep.name}</span>
                  {currentStep.selector && <code style={{ fontSize: 11 }}>{currentStep.selector.primary}</code>}
                </div>
                <div className="modify-comparison-row">
                  <span className="modify-comparison-label">Selected</span>
                  <span className="modify-comparison-value">{selectedSuggestion.humanLabel}</span>
                  <code style={{ fontSize: 11 }}>{selectedSuggestion.selector}</code>
                </div>
              </div>
            )}

            {/* Custom selector accordion */}
            <div className="modify-custom-section">
              <button
                className="modify-custom-toggle"
                onClick={() => setCustomOpen(!customOpen)}
              >
                {customOpen ? "\u25BC" : "\u25B6"} Use custom selector
              </button>
              {customOpen && (
                <div className="modify-custom-body">
                  <input
                    type="text"
                    placeholder="e.g. button:has-text('Save')"
                    value={customSelector}
                    onChange={(e) => setCustomSelector(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
                    style={{ width: "100%" }}
                  />
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={handleCustomSubmit}
                    disabled={!customSelector.trim()}
                  >
                    Apply Custom
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <button className="btn btn-sm btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleApplySelected}
          disabled={selectedIndex === null}
          title={selectedIndex === null ? "Select a replacement target first" : undefined}
        >
          Apply
        </button>
      </DialogFooter>
    </Dialog>
  );
}
