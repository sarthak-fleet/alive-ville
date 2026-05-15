import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; fallback?: (error: Error) => ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught", error, info);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback?.(this.state.error) ?? (
        <div className="banner error">Component crashed: {this.state.error.message}</div>
      );
    }
    return this.props.children;
  }
}
