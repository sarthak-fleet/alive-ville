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

  if (error && !world) return <div className="banner error">Error: {error}</div>;
  if (loading || !world) return <div className="banner">Loading world…</div>;
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
