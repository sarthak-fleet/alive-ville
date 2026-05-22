import { useWorldStore } from "../store/world.ts";

export function RelationshipsPanel() {
  const world = useWorldStore((s) => s.world);
  if (!world) return null;

  return (
    <div className="social-bonds">
      <div className="bonds-grid">
        {world.npcs.map((npc) => (
          <div key={npc.id} className="npc-bond-card">
            <div className="bond-header">
              <div className="bond-portrait" style={{ background: `var(--npc)` }}>
                {npc.name[0]}
              </div>
              <div className="bond-meta">
                <span className="bond-name">{npc.name}</span>
                <span className="bond-emotion">{npc.mood?.emotion ?? "neutral"}</span>
              </div>
            </div>

            <div className="bond-stats">
              {Object.entries(npc.relationships ?? {}).map(([toId, score]) => {
                const target = world.npcs.find(n => n.id === toId);
                if (!target) return null;
                return (
                  <div key={toId} className="bond-line">
                    <span className="bond-target">{target.name}</span>
                    <div className="bond-meter">
                      <div className="bond-fill" style={{ width: `${Math.max(0, Math.min(100, (score + 10) * 5))}%` }}></div>
                    </div>
                    <span className="bond-score">{score > 0 ? `+${score}` : score}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
