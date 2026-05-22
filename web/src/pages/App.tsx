import { useEffect } from "react";

import { useWorldStore } from "../store/world.ts";
import { AppShell } from "../templates/AppShell.tsx";

export function App() {
  const init = useWorldStore((s) => s.init);
  const error = useWorldStore((s) => s.error);
  const clearError = useWorldStore((s) => s.clearError);
  const loading = useWorldStore((s) => s.loading);
  const world = useWorldStore((s) => s.world);

  useEffect(() => { void init(); }, [init]);

  if (error && !world) {
    return (
      <div className="banner error">
        <div className="error-icon">×</div>
        <div className="loading-text" style={{ color: '#ff6b6b' }}>Protocol Failure</div>
        <div style={{ maxWidth: '400px', textAlign: 'center', opacity: 0.8 }}>{error}</div>
        <button className="primary" onClick={() => window.location.reload()} style={{ marginTop: '12px' }}>Initialize Reboot</button>
      </div>
    );
  }

  if (loading || !world) {
    return (
      <div className="banner">
        <div className="loading-spinner" />
        <div className="loading-text">Synchronizing World State</div>
      </div>
    );
  }
  return (
    <>
      {error && (
        <div className="recoverable-error" role="alert" aria-label="Recoverable app error">
          <span>Action failed: {error}</span>
          <button type="button" onClick={clearError}>Dismiss</button>
        </div>
      )}
      <AppShell />
    </>
  );
}
