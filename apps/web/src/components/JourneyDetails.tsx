import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchJourneyResult, fetchRepoMeta, fetchOwnershipHints, fetchExecutedJourneys, artifactUrl } from "../api";
import { CopyBugReport } from "./CopyBugReport";
import { ModifyRepairModal } from "./ModifyRepairModal";
import { SavePinnedTestModal } from "./SavePinnedTestModal";
import type { JourneyResult, RepoMetaFile, OwnershipHint, StepResult, StepEditPatch, SelectorSpec, JourneySpec } from "../types";

interface Props {
  runId: string;
  resultPath: string;
  projectSlug?: string;
  journeyId?: string;
  onSavePinnedTest?: (journeySpec: JourneySpec, patches: StepEditPatch[], name: string, tags: string[]) => void;
  onRepairJourney?: (runId: string, journeyId: string, patches: StepEditPatch[]) => void;
}

/** Derive deduplicated warnings from journey result + SOFT_FAIL steps. */
function deriveWarnings(result: JourneyResult): { stepName?: string; message: string }[] {
  const seen = new Set<string>();
  const out: { stepName?: string; message: string }[] = [];

  for (const w of result.warnings ?? []) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push({ message: w });
    }
  }

  for (const step of result.steps ?? []) {
    if (step.status === "SOFT_FAIL") {
      const msg = step.error?.message ?? `Soft-fail at step "${step.name}"`;
      if (!seen.has(msg)) {
        seen.add(msg);
        out.push({ stepName: step.name, message: msg });
      }
    }
  }

  return out;
}

function isModifiableStep(step: StepResult): boolean {
  return step.actionType === "click" || step.actionType === "fill";
}

export function JourneyDetails({ runId, resultPath, projectSlug, journeyId, onSavePinnedTest, onRepairJourney }: Props) {
  const [result, setResult] = useState<JourneyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repoMeta, setRepoMeta] = useState<RepoMetaFile | null>(null);
  const [ownershipHint, setOwnershipHint] = useState<OwnershipHint | null>(null);

  // Modify/Repair state
  const [originalSpec, setOriginalSpec] = useState<JourneySpec | null>(null);
  const [patches, setPatches] = useState<StepEditPatch[]>([]);
  const [modifyingStep, setModifyingStep] = useState<number | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    setResult(null);
    setError(null);
    setRepoMeta(null);
    setOwnershipHint(null);
    setOriginalSpec(null);
    setPatches([]);
    setModifyingStep(null);
    fetchJourneyResult(runId, resultPath, projectSlug)
      .then((r) => {
        setResult(r);
        if (r.status === "FAIL") {
          fetchRepoMeta(runId, projectSlug).then(setRepoMeta);
          fetchOwnershipHints(runId, projectSlug).then((hints) => {
            if (hints) {
              const match = hints.hints.find((h) => h.journeyId === r.journeyId);
              setOwnershipHint(match ?? null);
            }
          });
        }
        fetchExecutedJourneys(runId, projectSlug).then((records) => {
          if (records) {
            const match = records.find((rec) => rec.spec.id === r.journeyId);
            if (match) setOriginalSpec(match.spec);
          }
        });
      })
      .catch((err) => setError((err as Error).message));
  }, [runId, resultPath, projectSlug]);

  const warnings = useMemo(() => (result ? deriveWarnings(result) : []), [result]);

  const handleOpenModify = useCallback((stepIndex: number) => {
    setModifyingStep(stepIndex);
  }, []);

  const handleCancelModify = useCallback(() => {
    setModifyingStep(null);
  }, []);

  const handleSelectTarget = useCallback((stepIndex: number, step: StepResult, selector: SelectorSpec, label?: string) => {
    const patch: StepEditPatch = {
      stepIndex,
      from: {
        selector: step.selector ? { primary: step.selector.primary, fallbacks: [], strategy: step.selector.strategy } : undefined,
        label: step.label ?? step.name,
      },
      to: { selector, label },
      editedAt: new Date().toISOString(),
      editedBy: "local",
    };
    setPatches((prev) => {
      const filtered = prev.filter((p) => p.stepIndex !== stepIndex);
      return [...filtered, patch];
    });
    setModifyingStep(null);
  }, []);

  const handleSave = useCallback((name: string, tags: string[]) => {
    if (!originalSpec || !onSavePinnedTest) return;
    const modifiedSpec: JourneySpec = JSON.parse(JSON.stringify(originalSpec));
    for (const patch of patches) {
      const step = modifiedSpec.steps[patch.stepIndex];
      if (step) {
        step.selector = patch.to.selector;
        if (patch.to.label) step.description = patch.to.label;
      }
    }
    onSavePinnedTest(modifiedSpec, patches, name, tags);
    setShowSaveModal(false);
    setPatches([]);
  }, [originalSpec, patches, onSavePinnedTest]);

  const handleRepair = useCallback(() => {
    if (!journeyId || !onRepairJourney || patches.length === 0) return;
    onRepairJourney(runId, journeyId, patches);
  }, [runId, journeyId, patches, onRepairJourney]);

  const handleModifyFirst = useCallback(() => {
    if (!result) return;
    const firstModifiable = (result.steps ?? []).find(isModifiableStep);
    if (firstModifiable) setModifyingStep(firstModifiable.index);
  }, [result]);

  if (error) return <div style={{ color: "var(--fail)", padding: 8 }}>Error: {error}</div>;
  if (!result) return <div style={{ padding: 8, color: "var(--text-muted)" }}>Loading...</div>;

  const hasWarnings = warnings.length > 0;
  const displayStatus = result.status === "FAIL" ? "FAIL" : hasWarnings ? "WARN" : "PASS";
  const hasPatches = patches.length > 0;
  const hasModifiableSteps = (result.steps ?? []).some(isModifiableStep);

  return (
    <div className="journey-details">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h4>{result.name}</h4>
        <span className={`ui-badge badge badge-${displayStatus}`}>{displayStatus}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{result.durationMs}ms</span>
        {result.status === "FAIL" && (
          <CopyBugReport result={result} runId={runId} repoMeta={repoMeta} ownershipHint={ownershipHint} projectSlug={projectSlug} />
        )}
      </div>

      {/* Journey Actions toolbar — always visible */}
      <div className="journey-actions-bar">
        <button
          className="btn btn-sm btn-primary"
          onClick={handleModifyFirst}
          disabled={!hasModifiableSteps}
        >
          Modify
        </button>
        {hasPatches && onSavePinnedTest && originalSpec && (
          <button className="btn btn-sm btn-secondary" onClick={() => setShowSaveModal(true)}>
            Save as Pinned
          </button>
        )}
        {hasPatches && onRepairJourney && journeyId && (
          <button className="btn btn-sm btn-primary" onClick={handleRepair}>
            Repair &amp; Run
          </button>
        )}
        {hasPatches && (
          <>
            <button className="btn btn-sm btn-ghost" onClick={() => setPatches([])}>
              Clear
            </button>
            <span className="patch-badge">
              {patches.length} mod{patches.length !== 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>

      {/* Warnings section */}
      {hasWarnings && (
        <>
          <h5>Warnings ({warnings.length})</h5>
          <ul className="warnings-list" style={{ marginBottom: 8 }}>
            {warnings.map((w, i) => (
              <li key={i}>
                {w.stepName && <span style={{ color: "var(--text-muted)" }}>[{w.stepName}] </span>}
                {w.message}
              </li>
            ))}
          </ul>
        </>
      )}

      <h5>Steps</h5>
      {(result.steps ?? []).map((step) => {
        const isWarn = step.status === "SOFT_FAIL";
        const isFail = step.status === "FAIL";
        const hasPatch = patches.some((p) => p.stepIndex === step.index);
        const isModifying = modifyingStep === step.index;
        const canModify = isModifiableStep(step);
        const canRepair = isFail || isWarn;

        return (
          <div key={step.index}>
            <div className={`step-row${isWarn ? " step-row-warn" : ""}${hasPatch ? " step-row-patched" : ""}`}>
              <span className={`ui-badge badge badge-${step.status}`} style={{ marginRight: 6 }}>
                {step.status === "SOFT_FAIL" ? "WARN" : step.status}
              </span>
              <span>{step.name}</span>
              {hasPatch && <span className="patch-badge">Modified</span>}
              <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>({step.durationMs}ms)</span>
              {step.failureKind && (
                <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: 11 }}>
                  [{step.failureKind}]
                </span>
              )}

              {/* Always-visible action buttons */}
              <span className="step-actions">
                {canModify && (
                  <button
                    className="step-action-btn"
                    onClick={(e) => { e.stopPropagation(); handleOpenModify(step.index); }}
                    title="Modify target selector"
                  >
                    Modify
                  </button>
                )}
                {canRepair && (
                  <button
                    className="step-action-btn step-action-btn-repair"
                    onClick={(e) => { e.stopPropagation(); handleOpenModify(step.index); }}
                    title="Repair this step"
                  >
                    Repair
                  </button>
                )}
              </span>

              {step.error && (
                <div className={isWarn ? "step-warn-message" : "step-error"} style={{ width: "100%" }}>
                  {step.error.message}
                </div>
              )}
            </div>

            {/* Modal renders once outside the loop */}
          </div>
        );
      })}

      <h5>Artifacts</h5>
      <ul className="artifact-list">
        {result.artifacts.map((a) => {
          const href = artifactUrl(runId, a.path, projectSlug);
          const filename = a.path.split("/").pop();
          return (
            <li key={a.path}>
              <a href={href} target="_blank" rel="noopener noreferrer">
                [{a.kind}] {filename}
              </a>
            </li>
          );
        })}
      </ul>

      {result.video && (
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
          Video: {result.video.saved ? "saved" : `not saved${result.video.reason ? ` (${result.video.reason})` : ""}`}
        </div>
      )}

      {ownershipHint && (
        <>
          <h5>Ownership Analysis</h5>
          <div className="ui-panel ownership-hint">
            <span className={`ui-badge ownership-badge ownership-badge-${ownershipHint.likelyRepo}`}>
              {ownershipHint.likelyRepo}
            </span>
            <span className={`ownership-confidence ownership-confidence-${ownershipHint.confidence}`}>
              {ownershipHint.confidence} confidence
            </span>
            <div style={{ fontSize: 12, marginTop: 4 }}>{ownershipHint.reason}</div>
            {ownershipHint.failedUrl && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {ownershipHint.httpMethod ?? "GET"} {ownershipHint.failedUrl}
                {ownershipHint.httpStatus ? ` → ${ownershipHint.httpStatus}` : ""}
              </div>
            )}
            {ownershipHint.relatedFiles.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Related files: {ownershipHint.relatedFiles.join(", ")}
              </div>
            )}
          </div>
        </>
      )}

      <SavePinnedTestModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSave}
        journeyName={result.name}
        patchCount={patches.length}
        patches={patches}
      />

      {modifyingStep !== null && (result.steps ?? [])[modifyingStep] && (
        <ModifyRepairModal
          key={modifyingStep}
          open={modifyingStep !== null}
          onClose={handleCancelModify}
          runId={runId}
          projectSlug={projectSlug}
          currentStep={(result.steps ?? [])[modifyingStep]!}
          stepIndex={modifyingStep}
          onApply={(selector, label) => {
            const step = (result.steps ?? [])[modifyingStep];
            if (step) handleSelectTarget(modifyingStep, step, selector, label);
          }}
        />
      )}
    </div>
  );
}
