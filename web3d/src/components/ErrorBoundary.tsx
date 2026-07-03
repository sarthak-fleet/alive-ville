import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override componentDidCatch(err: Error) {
    console.error('[ErrorBoundary]', err);
  }
  override render() {
    return this.state.hasError ? (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        Something went wrong.{' '}
        <button
          type="button"
          onClick={() => location.reload()}
          style={{ textDecoration: 'underline' }}
        >
          Reload
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
