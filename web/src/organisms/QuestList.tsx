import { Button } from "../atoms/Button.tsx";
import { Panel } from "../atoms/Panel.tsx";
import { useWorldStore } from "../store/world.ts";

export function QuestList() {
  const world = useWorldStore((s) => s.world);
  const send = useWorldStore((s) => s.send);
  const quests = world?.quests ?? [];
  return (
    <Panel title="Quests">
      <ul>
        {quests.length === 0 ? (
          <li className="muted">(no quests)</li>
        ) : (
          quests.map((quest) => (
            <li key={quest.id}>
              <div className="quest-row">
                <span><strong>{quest.title}</strong> — <em>{quest.status ?? "draft"}</em></span>
                {quest.status === "open" && (
                  <Button onClick={() => void send({ type: "accept_quest", questId: quest.id } as never)}>Accept</Button>
                )}
              </div>
              {quest.description && <p className="quest-desc">{quest.description}</p>}
            </li>
          ))
        )}
      </ul>
    </Panel>
  );
}
