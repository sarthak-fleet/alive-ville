import { Panel } from "../atoms/Panel.tsx";
import { useWorldStore } from "../store/world.ts";

export function QuestList() {
  const world = useWorldStore((s) => s.world);
  const quests = world?.quests ?? [];
  return (
    <Panel title="Quests">
      <ul>
        {quests.length === 0 ? (
          <li className="muted">(no quests)</li>
        ) : (
          quests.map((quest) => (
            <li key={quest.id}>
              <strong>{quest.title}</strong> — <em>{quest.status ?? "draft"}</em>
            </li>
          ))
        )}
      </ul>
    </Panel>
  );
}
