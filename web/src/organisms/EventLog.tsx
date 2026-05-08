import { Panel } from "../atoms/Panel.tsx";
import { useWorldStore } from "../store/world.ts";

export function EventLog() {
  const world = useWorldStore((s) => s.world);
  if (!world) return <Panel title="Event log"><ol></ol></Panel>;
  const items = [...world.eventLog].slice(-25).reverse().flatMap((entry) =>
    entry.actions.map((action, idx) => ({
      key: `${entry.tick}-${idx}`,
      tick: entry.tick,
      director: Boolean(action.fromDirector),
      text: action.text,
    }))
  );
  return (
    <Panel title="Event log">
      <ol>
        {items.length === 0 ? (
          <li className="muted">(no events)</li>
        ) : (
          items.map((item) => (
            <li key={item.key}>
              t{item.tick}{item.director ? "★" : ""}: {item.text}
            </li>
          ))
        )}
      </ol>
    </Panel>
  );
}
