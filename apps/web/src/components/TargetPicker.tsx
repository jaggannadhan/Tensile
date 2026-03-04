import { useState, useEffect, useMemo } from "react";
import { fetchPageActions } from "../api";
import type { StepResult, ActionTarget, SelectorSpec, TargetSuggestion } from "../types";

interface Props {
  runId: string;
  projectSlug?: string;
  currentStep: StepResult;
  onSelect: (selector: SelectorSpec, label?: string) => void;
  onCancel: () => void;
}

const SHOW_LIMIT = 20;

const TIMESTAMP_RE = /\b(last|ago|today|yesterday|version|build|v\d|updated|modified|\d{2}:\d{2}|\d{4}-\d{2})/i;

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = new Set(tokenize(b));
  if (tokensA.length === 0 || tokensB.size === 0) return 0;
  let matches = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) matches++;
  }
  return matches / Math.max(tokensA.length, tokensB.size);
}

function scoreTarget(target: ActionTarget, step: StepResult): TargetSuggestion {
  let score = 0;
  const reasons: string[] = [];

  const refLabel = step.label ?? step.name;
  const labelSim = tokenOverlap(target.humanLabel, refLabel);
  score += Math.round(labelSim * 30);
  if (labelSim > 0.5) reasons.push("Same label");

  if (target.selector.startsWith("[data-testid=") || target.selector.startsWith("[data-test=") || target.selector.startsWith("[data-cy=")) {
    score += 20;
    reasons.push("Has testid");
  } else if (target.selector.startsWith("[role=") || target.selector.startsWith("#")) {
    score += 10;
    reasons.push("Stable selector");
  }

  score += Math.round(target.confidence * 10);
  if (target.confidence > 0.8) reasons.push("High confidence");

  if (TIMESTAMP_RE.test(target.humanLabel)) {
    score -= 20;
  }

  if (target.riskFlags.looksDestructive) {
    score -= 15;
    reasons.push("Destructive");
  }

  return { ...target, score, reasons };
}

export function TargetPicker({ runId, projectSlug, currentStep, onSelect, onCancel }: Props) {
  const [actions, setActions] = useState<ActionTarget[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [customSelector, setCustomSelector] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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

      {filteredSuggestions.length > 0 ? (
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
                  </td>
                </tr>
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
