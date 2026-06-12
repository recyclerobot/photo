import { Component } from 'react';

interface Props {
  /** Shown in the fallback so the user knows which part crashed. */
  label: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  /** Bumped on "Try again" to force a full remount of the children. */
  attempt: number;
}

/**
 * Catches render errors so one crashing component doesn't white-screen the
 * whole editor. The document lives in the zustand store outside React, and
 * autosave keeps running from the surviving tree, so no work is lost.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.label}] crashed:`, error, info.componentStack);
  }

  private retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  private copyDetails = () => {
    const e = this.state.error;
    void navigator.clipboard
      .writeText(`${e?.name}: ${e?.message}\n${e?.stack ?? ''}`)
      .catch(() => {});
  };

  render() {
    if (this.state.error) {
      return (
        <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-[#1a1b1e]/95 text-zinc-200">
          <div className="flex max-w-md flex-col gap-3 rounded-lg border border-black/50 bg-panel-2 p-5 text-sm shadow-2xl">
            <div className="font-semibold text-red-300">{this.props.label} crashed</div>
            <div className="break-words rounded bg-panel p-2 font-mono text-[11px] text-zinc-400">
              {this.state.error.message}
            </div>
            <div className="text-xs text-zinc-400">
              Your document is safe — it lives outside the crashed view and autosave keeps running.
              Try again, or reload the app.
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={this.copyDetails}
                className="rounded px-2.5 py-1.5 text-zinc-300 hover:bg-panel-3"
              >
                Copy details
              </button>
              <button
                onClick={this.retry}
                className="rounded px-2.5 py-1.5 text-zinc-300 hover:bg-panel-3"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded bg-accent px-2.5 py-1.5 font-semibold text-white hover:opacity-90"
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }
    // Key forces a clean remount after "Try again" — stale internal state in
    // the crashed subtree (e.g. a Pixi app handle) must not be reused.
    return (
      <div key={this.state.attempt} className="contents">
        {this.props.children}
      </div>
    );
  }
}
