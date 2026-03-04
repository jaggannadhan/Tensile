import { NewRunForm } from "./NewRunForm";

interface Props {
  open: boolean;
  onClose: () => void;
  onNewRun: (runId: string) => void;
}

export function NewRunModal({ open, onClose, onNewRun }: Props) {
  if (!open) return null;

  const handleNewRun = (runId: string) => {
    onNewRun(runId);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>New Run</span>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
        </div>
        <NewRunForm onNewRun={handleNewRun} />
      </div>
    </div>
  );
}
