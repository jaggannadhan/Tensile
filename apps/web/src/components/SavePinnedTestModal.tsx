import { useState } from "react";
import { Dialog, DialogHeader, DialogBody, DialogFooter } from "./ui/Dialog";
import type { StepEditPatch } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, tags: string[]) => void;
  journeyName: string;
  patchCount: number;
  patches?: StepEditPatch[];
}

export function SavePinnedTestModal({ open, onClose, onSave, journeyName, patchCount, patches }: Props) {
  const [name, setName] = useState(`Pinned: ${journeyName}`);
  const [tagsInput, setTagsInput] = useState("pinned");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      onSave(name.trim(), tags);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} width={520}>
      <DialogHeader
        title="Save as Pinned Test"
        description="Save your modifications as a reusable pinned test."
        onClose={onClose}
      />
      <DialogBody>
        <div className="form-group">
          <label>Test Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        <div className="form-group">
          <label>Tags (comma-separated)</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
        </div>
        <div className="modal-description">
          {patchCount} step modification{patchCount !== 1 ? "s" : ""} will be saved.
          {patches && patches.length > 0 && (
            <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11 }}>
              Step {patches[0].stepIndex}: {patches[0].from.label ?? "(original)"} → {patches[0].to.label ?? patches[0].to.selector.primary}
              {patches.length > 1 && ` (+${patches.length - 1} more)`}
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <button className="btn btn-sm btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleSave}
          disabled={!name.trim() || saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
