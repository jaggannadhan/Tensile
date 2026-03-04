interface Props {
  title: string;
  hint?: string;
  error?: boolean;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, hint, error, action }: Props) {
  return (
    <div className={`empty-state${error ? " empty-state-error" : ""}`}>
      <div className="empty-state-title">{title}</div>
      {hint && <div className="empty-state-hint">{hint}</div>}
      {action && (
        <button className="btn btn-sm btn-primary" style={{ marginTop: 12 }} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
