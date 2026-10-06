import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="card stack" role="alert">
          <h1>Something went wrong</h1>
          <p>
            Your recorded plays are saved on this device. Reloading the app will return you to where you left off.
          </p>
          <p className="muted small">{this.state.error.message}</p>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => window.location.reload()}>
            Reload app
          </button>
          <a className="btn btn-secondary btn-block" href="/">
            Go home
          </a>
        </div>
      </div>
    );
  }
}
