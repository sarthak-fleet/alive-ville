import { useEffect, useState } from "react";

import type { AgentLoopStatus } from "../../../src/agent-loop.ts";
import type { TickSummary, World } from "../../../src/types.ts";
import { fetchAgentLoopStatus, startAgentLoop, stepAgentLoop, stopAgentLoop } from "../api/client.ts";
import { Button } from "../atoms/Button.tsx";
import { Panel } from "../atoms/Panel.tsx";
import { useWorldStore } from "../store/world.ts";

export function AgentLoopPanel() {
  const applyServerTick = useWorldStore((state) => state.applyServerTick);
  const refreshFromServer = useWorldStore((state) => state.refreshFromServer);
  const [status, setStatus] = useState<AgentLoopStatus | null>(null);
  const [busy, setBusy] = useState<"" | "start" | "stop" | "step">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await fetchAgentLoopStatus();
        if (cancelled) return;
        setStatus(next);
        setError(null);
        if (next.state === "running") await refreshFromServer(next.lastTick);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), status?.state === "running" ? 1_000 : 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshFromServer, status?.state]);

  const run = async (label: "start" | "stop" | "step", action: () => Promise<RunResult>) => {
    setBusy(label);
    try {
      const result = await action();
      const next = "status" in result ? result.status : result;
      setStatus(next);
      setError(null);
      if ("summary" in result) {
        applyServerTick(result.state, result.summary);
      } else {
        await refreshFromServer(next.lastTick);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <Panel title="Agent loop">
      <div className="agent-loop-panel" aria-label="Agent loop controls">
        <div className="agent-loop-status">
          <span className={`agent-loop-dot ${status?.state ?? "idle"}`} />
          <strong>{status?.state ?? "loading"}</strong>
          <small>{status ? `${status.ticksRun} autonomous ticks` : "checking status"}</small>
        </div>
        <div className="agent-loop-actions">
          <Button
            onClick={() => void run("step", async () => {
              return stepAgentLoop();
            })}
            disabled={busy !== "" || status?.state === "running"}
          >
            {busy === "step" ? "Stepping..." : "Step"}
          </Button>
          <Button onClick={() => void run("start", startAgentLoop)} disabled={busy !== "" || status?.state === "running"}>
            {busy === "start" ? "Starting..." : "Start"}
          </Button>
          <Button onClick={() => void run("stop", stopAgentLoop)} disabled={busy !== "" || status?.state !== "running"}>
            {busy === "stop" ? "Stopping..." : "Stop"}
          </Button>
        </div>
        <dl className="agent-loop-metrics">
          <div><dt>Interval</dt><dd>{status ? `${status.intervalMs}ms` : "-"}</dd></div>
          <div><dt>Checkpoints</dt><dd>{status?.checkpoints.length ?? 0}</dd></div>
          <div><dt>Every</dt><dd>{status?.checkpointEveryTicks ?? "-"}</dd></div>
        </dl>
        {status?.lastTick && (
          <p className="muted">Last tick: {status.lastTick.actions.length} action(s), world tick {status.lastTick.tick}</p>
        )}
        {(error || status?.lastError) && <p className="agent-loop-error">{error ?? status?.lastError}</p>}
      </div>
    </Panel>
  );
}

type RunResult = AgentLoopStatus | { status: AgentLoopStatus; state: World; summary: TickSummary };
