import { Panel } from "../atoms/Panel.tsx";
import { RelationCell } from "../molecules/RelationCell.tsx";
import { useWorldStore } from "../store/world.ts";

export function RelationshipsPanel() {
  const world = useWorldStore((s) => s.world);
  if (!world) return <Panel title="Relationships"><table /></Panel>;
  const rows = world.npcs.flatMap((npc) =>
    Object.entries(npc.relationships ?? {}).map(([to, score]) => ({
      key: `${npc.id}-${to}`,
      from: npc.id,
      to,
      score,
    }))
  );
  return (
    <Panel title="Relationships">
      <table>
        <thead>
          <tr><th>From</th><th></th><th>To</th><th>Score</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.from}</td><td>→</td><td>{row.to}</td><td><RelationCell score={row.score} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
