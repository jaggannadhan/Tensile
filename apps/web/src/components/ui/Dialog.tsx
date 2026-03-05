import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  width?: number;
  size?: "md" | "lg" | "xl" | "fullscreen";
  children: ReactNode;
}

const SIZE_CLASS: Record<string, string> = {
  md: "modal-card modal-card-wide",
  lg: "modal-card modal-card-lg",
  xl: "modal-card modal-card-xl",
  fullscreen: "modal-card modal-card-fullscreen",
};

export function Dialog({ open, onClose, width, size, children }: DialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Capture the element that opened the dialog
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement;
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Focus first focusable element on open; restore focus on close
  useEffect(() => {
    if (open && cardRef.current) {
      const focusable = cardRef.current.querySelector<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) focusable.focus();
    }
    if (!open && openerRef.current) {
      try { openerRef.current.focus(); } catch { /* ignore */ }
      openerRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  const cardClass = size
    ? SIZE_CLASS[size] ?? "modal-card"
    : width && width > 440
      ? "modal-card modal-card-wide"
      : "modal-card";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className={cardClass}
        style={!size && width && width !== 440 && width !== 520 ? { width } : undefined}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

interface DialogHeaderProps {
  title: string;
  description?: string;
  onClose?: () => void;
}

export function DialogHeader({ title, description, onClose }: DialogHeaderProps) {
  return (
    <div className="modal-header">
      <div className="modal-header-title">
        <span>{title}</span>
        {description && <span className="modal-description">{description}</span>}
      </div>
      {onClose && (
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      )}
    </div>
  );
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="modal-body">{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="modal-footer">{children}</div>;
}
