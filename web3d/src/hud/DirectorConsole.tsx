import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { nextObjective } from '../../../src/outcome.ts';
import type { Npc, TickSummary, World } from '../../../src/types.ts';
import { useWorldStore } from '../store/world.ts';

interface DirectorConsoleProps {
  open: boolean;
  onClose: () => void;
}

type DirectorTab = 'trace' | 'agents' | 'loop';

export function DirectorConsole({ open, onClose }: DirectorConsoleProps) {
  const world = useWorldStore((state) => state.world);
  const lastSummary = useWorldStore((state) => state.lastSummary);
  const agentLoopRunning = useWorldStore((state) => state.agentLoopRunning);
  const agentLoopStatus = useWorldStore((state) => state.agentLoopStatus);
  const refreshAgentLoopStatus = useWorldStore((state) => state.refreshAgentLoopStatus);
  const toggleAgentLoop = useWorldStore((state) => state.toggleAgentLoop);
  const stepAgentLoopOnce = useWorldStore((state) => state.stepAgentLoopOnce);
  const [tab, setTab] = useState<DirectorTab>('trace');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void refreshAgentLoopStatus();
  }, [open, refreshAgentLoopStatus]);

  if (!open || !world) return null;

  const runState = agentLoopStatus?.state ?? (agentLoopRunning ? 'running' : 'idle');
  const checkpoints = agentLoopStatus?.checkpoints ?? [];
  const pressure = world.directorState?.pressure ?? world.villainPlans?.[0]?.pressure ?? 0;

  const onToggleLoop = async () => {
    setBusy(true);
    try {
      await toggleAgentLoop();
      await refreshAgentLoopStatus();
    } finally {
      setBusy(false);
    }
  };

  const onStep = async () => {
    setBusy(true);
    try {
      await stepAgentLoopOnce();
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="director-console" aria-label="Director console">
      <header className="director-console-header">
        <div>
          <div className="director-console-kicker">Director</div>
          <div className="director-console-title">{world.story?.title ?? world.name}</div>
        </div>
        <button type="button" className="director-console-close" onClick={onClose}>
          Close
        </button>
      </header>

      <section className="director-console-status">
        <div>
          <span className={`director-state-dot ${runState}`} />
          <span className="director-state-label">{runState}</span>
        </div>
        <div>Tick {world.tick}</div>
        <div>Pressure {pressure}</div>
      </section>

      <section className="director-console-objective">
        <span>Objective</span>
        {nextObjective(world)}
      </section>

      <section className="director-console-controls">
        <button type="button" onClick={onToggleLoop} disabled={busy}>
          {agentLoopRunning ? 'Pause' : 'Resume'}
        </button>
        <button type="button" onClick={onStep} disabled={busy}>
          Step
        </button>
        <button type="button" onClick={() => void refreshAgentLoopStatus()} disabled={busy}>
          Refresh
        </button>
      </section>

      <nav className="director-tabs" aria-label="Director console views">
        <TabButton active={tab === 'trace'} onClick={() => setTab('trace')}>
          Trace
        </TabButton>
        <TabButton active={tab === 'agents'} onClick={() => setTab('agents')}>
          Agents
        </TabButton>
        <TabButton active={tab === 'loop'} onClick={() => setTab('loop')}>
          Loop
        </TabButton>
      </nav>

      <div className="director-console-body">
        {tab === 'trace' ? <TraceView world={world} lastSummary={lastSummary} /> : null}
        {tab === 'agents' ? <AgentsView world={world} /> : null}
        {tab === 'loop' ? (
          <LoopView world={world} lastSummary={lastSummary} checkpoints={checkpoints} />
        ) : null}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? 'active' : ''} onClick={onClick}>
      {children}
    </button>
  );
}

function TraceView({ world, lastSummary }: { world: World; lastSummary: TickSummary | null }) {
  const entries = useMemo(() => {
    const summaryEntries =
      lastSummary?.actions.map((entry) => ({
        id: `summary-${lastSummary.tick}-${entry.action.actorId}-${entry.text}`,
        label: entry.fromDirector ? 'Director' : entry.action.type,
        text: entry.text,
      })) ?? [];
    const rejectedEntries =
      lastSummary?.rejected.map((entry) => ({
        id: `rejected-${lastSummary.tick}-${entry.action.actorId}-${entry.reason}`,
        label: 'Rejected',
        text: entry.reason,
      })) ?? [];
    const chronicleEntries = [...(world.chronicle ?? [])]
      .reverse()
      .slice(0, 8)
      .map((entry) => ({
        id: `chronicle-${entry.id}`,
        label: entry.playerCaused ? 'Player' : entry.kind,
        text: entry.text,
      }));
    return [...summaryEntries, ...rejectedEntries, ...chronicleEntries].slice(0, 12);
  }, [lastSummary, world.chronicle]);

  if (entries.length === 0) {
    return <div className="director-empty">No trace yet.</div>;
  }

  return (
    <ul className="director-trace-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <span>{entry.label}</span>
          {entry.text}
        </li>
      ))}
    </ul>
  );
}

function AgentsView({ world }: { world: World }) {
  const locations = useMemo(
    () => new Map(world.locations.map((location) => [location.id, location.name])),
    [world.locations]
  );
  const npcs = useMemo(() => sortNpcs(world.npcs), [world.npcs]);

  return (
    <ul className="director-agent-list">
      {npcs.map((npc) => (
        <li key={npc.id} className={npc.combat?.defeated ? 'defeated' : ''}>
          <div className="director-agent-row">
            <span className={`director-agent-dot ${npc.tier ?? 'normal'}`} />
            <span className="director-agent-name">{npc.name}</span>
            <span className="director-agent-place">
              {locations.get(npc.locationId) ?? npc.locationId}
            </span>
          </div>
          <div className="director-agent-sub">{agentLine(npc)}</div>
        </li>
      ))}
    </ul>
  );
}

function LoopView({
  world,
  lastSummary,
  checkpoints,
}: {
  world: World;
  lastSummary: TickSummary | null;
  checkpoints: Array<{ tick: number; capturedAt: string; worldId: string }>;
}) {
  const eventLog = [...world.eventLog].reverse().slice(0, 6);
  return (
    <div className="director-loop-view">
      <div className="director-loop-card">
        <span>Last tick</span>
        {lastSummary ? `#${lastSummary.tick} · ${lastSummary.actions.length} actions` : 'None'}
      </div>
      <div className="director-loop-card">
        <span>Checkpoints</span>
        {checkpoints.length}
      </div>
      {checkpoints.length > 0 ? (
        <ul className="director-checkpoints">
          {[...checkpoints]
            .reverse()
            .slice(0, 5)
            .map((checkpoint) => (
              <li key={`${checkpoint.tick}-${checkpoint.capturedAt}`}>
                <span>Tick {checkpoint.tick}</span>
                {formatTime(checkpoint.capturedAt)}
              </li>
            ))}
        </ul>
      ) : null}
      {eventLog.length > 0 ? (
        <ul className="director-eventlog">
          {eventLog.map((summary) => (
            <li key={`${summary.tick}-${summary.checksum}`}>
              <span>#{summary.tick}</span>
              {summary.actions.length} actions · {summary.rejected.length} rejected
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function sortNpcs(npcs: Npc[]): Npc[] {
  return [...npcs].sort((a, b) => {
    const tierRank = (tier: Npc['tier']) => (tier === 'quest' ? 0 : tier === 'normal' ? 1 : 2);
    const defeatedRank = Number(Boolean(a.combat?.defeated)) - Number(Boolean(b.combat?.defeated));
    if (defeatedRank !== 0) return defeatedRank;
    const tierDiff = tierRank(a.tier) - tierRank(b.tier);
    return tierDiff || a.name.localeCompare(b.name);
  });
}

function agentLine(npc: Npc): string {
  if (npc.combat?.defeated) return 'Defeated';
  if (npc.followingPlayer) return 'Following player';
  if (npc.plan?.currentIntent)
    return `${npc.plan.currentIntent.kind}: ${npc.plan.currentIntent.reason}`;
  if (npc.plan?.nextActionHint) return npc.plan.nextActionHint;
  const ambition = npc.ambitions?.find((entry) => (entry.status ?? 'active') === 'active');
  if (ambition) return ambition.title;
  return npc.role ?? npc.goals?.[0] ?? 'Resident';
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
