import { useEffect } from "react";

import { useWorldStore } from "../store/world.ts";
import { AppShell } from "../templates/AppShell.tsx";

export function App() {
  const init = useWorldStore((s) => s.init);
  const error = useWorldStore((s) => s.error);
  const loading = useWorldStore((s) => s.loading);
  const world = useWorldStore((s) => s.world);

  useEffect(() => { void init(); }, [init]);

  if (error) return <div className="banner error">Error: {error}</div>;
  if (loading || !world) return <div className="banner">Loading Ashbend…</div>;
  return <AppShell />;
}
