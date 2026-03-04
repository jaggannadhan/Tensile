import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(_error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleCopy = () => {
    const { error, componentStack } = this.state;
    const text = [
      `Error: ${error?.message ?? "Unknown"}`,
      "",
      error?.stack ?? "",
      componentStack ? `\nComponent stack:\n${componentStack}` : "",
    ].join("\n");
    navigator.clipboard.writeText(text);
  };

  render() {
    if (this.state.hasError) {
      return <CrashPanel
        message={this.state.error?.message ?? "Unknown error"}
        stack={this.state.error?.stack ?? null}
        componentStack={this.state.componentStack}
        onReload={this.handleReload}
        onCopy={this.handleCopy}
      />;
    }
    return this.props.children;
  }
}

interface CrashPanelProps {
  message: string;
  stack: string | null;
  componentStack: string | null;
  onReload: () => void;
  onCopy: () => void;
}

function CrashPanel({ message, stack, componentStack, onReload, onCopy }: CrashPanelProps) {
  return (
    <div className="crash-panel">
      <div className="crash-panel-inner">
        <h2 className="crash-title">Something went wrong</h2>
        <p className="crash-message">{message}</p>
        <div className="crash-actions">
          <button className="btn btn-sm btn-primary" onClick={onReload}>Reload</button>
          <button className="btn btn-sm" onClick={onCopy}>Copy error details</button>
        </div>
        {(stack || componentStack) && (
          <details className="crash-details">
            <summary>Error details</summary>
            {stack && <pre className="crash-stack">{stack}</pre>}
            {componentStack && (
              <>
                <strong>Component stack:</strong>
                <pre className="crash-stack">{componentStack}</pre>
              </>
            )}
          </details>
        )}
      </div>
    </div>
  );
}
