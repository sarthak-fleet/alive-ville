import { useEffect, useState } from "react";

import type { AgentLoopStatus } from "../../../src/agent-loop.ts";
import type { TickSummary, World } from "../../../src/types.ts";
import { fetchAgentLoopStatus, restoreAgentLoopCheckpoint, startAgentLoop, stepAgentLoop, stopAgentLoop } from "../api/client.ts";
import { Button } from "../atoms/Button.tsx";
import { Panel } from "../atoms/Panel.tsx";
import { useWorldStore } from "../store/world.ts";

export function AgentLoopPanel() {
  const applyServerTick = useWorldStore((state) => state.applyServerTick);
  const refreshFromServer = useWorldStore((state) => state.refreshFromServer);
  const status = useWorldStore((state) => state.agentLoopStatus);
  const setAgentLoopStatus = useWorldStore((state) => state.setAgentLoopStatus);
  const [busy, setBusy] = useState<"" | "start" | "stop" | "step" | "restore">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await fetchAgentLoopStatus();
        if (cancelled) return;
        setAgentLoopStatus(next);
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
  }, [refreshFromServer, setAgentLoopStatus, status?.state]);

  const run = async (label: typeof busy, action: () => Promise<RunResult>) => {
    setBusy(label);
    try {
      const result = await action();
      const next = "status" in result ? result.status : result;
      setAgentLoopStatus(next);
      setError(null);
      if ("summary" in result) {
        applyServerTick(result.state, result.summary);
      } else if ("state" in result) {
        await refreshFromServer();
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
          <Button
            onClick={() => void run("restore", async () => {
              return restoreAgentLoopCheckpoint();
            })}
            disabled={busy !== "" || !status?.checkpoints.length}
          >
            {busy === "restore" ? "Restoring..." : "Restore latest"}
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
        {status?.restoredCheckpoint && (
          <p className="muted">Restored checkpoint: world tick {status.restoredCheckpoint.tick}</p>
        )}
        {(error || status?.lastError) && <p className="agent-loop-error">{error ?? status?.lastError}</p>}
      </div>
    </Panel>
  );
}

type RunResult =
  | AgentLoopStatus
  | { status: AgentLoopStatus; state: World; summary: TickSummary }
  | { status: AgentLoopStatus; state: World; checkpoint: { tick: number; capturedAt: string; worldId: string } };
