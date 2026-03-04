interface Props {
  message?: string;
}

export function LoadingState({ message }: Props) {
  return (
    <div className="loading-state">
      <div className="loading-state-spinner" />
      <div className="loading-state-text">{message ?? "Loading..."}</div>
    </div>
  );
}
