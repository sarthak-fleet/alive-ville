import { useMemo, useState } from "react";

import type { TickSummary, World } from "../../../src/types.ts";
import { Button } from "../atoms/Button.tsx";
import { useWorldStore } from "../store/world.ts";

export function RouteCompleteOverlay() {
  const world = useWorldStore((s) => s.world);
  const lastSummary = useWorldStore((s) => s.lastSummary);
  const send = useWorldStore((s) => s.send);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!world || world.storyProgress?.phase !== "dawn_after_tasks") return null;
    if (hasFreshVictoryResolution(world, lastSummary)) return null;
    const routeKey = `${world.id}:${world.tick}:${world.storyProgress.phase}`;
    const questsDone = (world.quests ?? []).filter((quest) => quest.status === "done").length;
    const questsTotal = world.quests?.length ?? 0;
    const tensionsResolved = (world.tensions ?? []).filter((tension) => tension.status === "resolved").length;
    const tensionsTotal = world.tensions?.length ?? 0;
    const defeatedHostiles = world.npcs.filter((npc) => npc.combat?.defeated).length;
    const agentMemories = world.npcs.reduce((total, npc) => total + npc.memories.length, 0);
    const title = world.id === "opm_z_city" ? "Z-City Patrol Cleared" : `${world.name} Route Cleared`;
    const copy = world.id === "opm_z_city"
      ? "The grocery coupon, cyborg core, overpass proof, and Sonic challenge are resolved."
      : "The starter route has reached its first stable ending.";

    return {
      routeKey,
      title,
      copy,
      stats: [
        ["Quests", `${questsDone}/${questsTotal}`],
        ["Tensions", `${tensionsResolved}/${tensionsTotal}`],
        ["Hostiles", String(defeatedHostiles)],
        ["Agent memories", String(agentMemories)],
      ],
    };
  }, [lastSummary, world]);

  if (!summary || dismissedKey === summary.routeKey) return null;

  return (
    <section className="route-complete" aria-label="Route complete">
      <div className="route-complete-copy">
        <span>Episode Clear</span>
        <strong>{summary.title}</strong>
        <p>{summary.copy}</p>
      </div>
      <dl className="route-complete-stats">
        {summary.stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="route-complete-actions">
        <Button variant="primary" onClick={() => setDismissedKey(summary.routeKey)}>Keep exploring</Button>
        <Button onClick={() => void send(null)}>Let agents react</Button>
      </div>
    </section>
  );
}

function hasFreshVictoryResolution(world: World, lastSummary: TickSummary | null): boolean {
  return (lastSummary?.actions ?? []).some((entry) => {
    const action = entry.action;
    if (action.type !== "fight" || action.actorId !== "player" || action.targetId === "player") return false;
    return Boolean(world.npcs.find((npc) => npc.id === action.targetId)?.combat?.defeated);
  });
}
