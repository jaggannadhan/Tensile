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

export function ModifyRepairModal({ open, onClose, runId, projectSlug, currentStep, stepIndex, onApply }: Props) {
  const [actions, setActions] = useState<ActionTarget[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [overlayData, setOverlayData] = useState<OverlayData | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);
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

  // Score and sort suggestions
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

  const visibleSuggestions = filteredSuggestions.slice(0, CANDIDATE_LIMIT);

  // Fetch overlay data once suggestions are ready
  useEffect(() => {
    if (!open || overlayData || overlayLoading || visibleSuggestions.length === 0) return;

    const pageUrl = visibleSuggestions[0]?.pageUrl;
    if (!pageUrl) return;

    const selectors = visibleSuggestions.slice(0, CANDIDATE_LIMIT).map((s, i) => ({
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
  }, [open, overlayData, overlayLoading, runId, projectSlug, visibleSuggestions]);

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
                  candidates={visibleSuggestions}
                  selectedIndex={selectedIndex}
                  onSelect={setSelectedIndex}
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
            <input
              className="target-picker-search"
              type="text"
              placeholder="Search by label or selector..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedIndex(null); }}
            />

            {/* Current target info */}
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              <strong>Current:</strong> {currentStep.label ?? currentStep.name}
              {currentStep.selector && (
                <code style={{ display: "block", marginTop: 2, fontSize: 11 }}>{currentStep.selector.primary}</code>
              )}
            </div>

            {/* Candidate list */}
            <div className="modify-candidate-list">
              {visibleSuggestions.map((s, i) => (
                <div key={i}>
                  <div
                    className={`modify-candidate-item${selectedIndex === i ? " selected" : ""}`}
                    onClick={() => setSelectedIndex(i)}
                  >
                    <span className="modify-candidate-num">{i + 1}</span>
                    <span className="modify-candidate-label" title={s.humanLabel}>
                      {s.humanLabel || "(no label)"}
                    </span>
                    <span className="ui-badge badge" style={{ fontSize: 10 }}>{s.actionType}</span>
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
              ))}
              {filteredSuggestions.length === 0 && !loading && (
                <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "8px 0" }}>
                  {search.trim() ? "No matches found." : "No discovery data available."}
                </div>
              )}
              {filteredSuggestions.length > CANDIDATE_LIMIT && (
                <div style={{ color: "var(--text-muted)", fontSize: 11, padding: "4px 8px" }}>
                  Showing top {CANDIDATE_LIMIT} of {filteredSuggestions.length}
                </div>
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

            {/* Custom selector */}
            <div style={{ display: "flex", gap: 6 }}>
              <input
                style={{ flex: 1 }}
                type="text"
                placeholder="Custom selector (e.g. button:has-text('Save'))"
                value={customSelector}
                onChange={(e) => setCustomSelector(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
              />
              <button
                className="btn btn-sm btn-secondary"
                onClick={handleCustomSubmit}
                disabled={!customSelector.trim()}
              >
                Use Custom
              </button>
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
        >
          Apply
        </button>
      </DialogFooter>
    </Dialog>
  );
}
