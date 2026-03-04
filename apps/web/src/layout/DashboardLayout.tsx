import { EmptyState } from "../components/EmptyState";

interface Props {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  hasRun: boolean;
  hasRuns: boolean;
  onNewRun?: () => void;
}

export function DashboardLayout({ left, center, right, hasRun, hasRuns, onNewRun }: Props) {
  return (
    <div className="dashboard-layout">
      <div className="dashboard-left">{left}</div>
      <div className="dashboard-center">
        {hasRun ? center : (
          hasRuns
            ? <EmptyState title="Select a run to view results" hint="Click a run in the sidebar" />
            : <EmptyState
                title="No runs yet"
                hint="Start a new run to begin testing"
                action={onNewRun ? { label: "New Run", onClick: onNewRun } : undefined}
              />
        )}
      </div>
      <div className="dashboard-right">
        {hasRun ? right : (
          <EmptyState title="Select a run" hint="Run details will appear here" />
        )}
      </div>
    </div>
  );
}
