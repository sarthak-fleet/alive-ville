import { Chip } from "../atoms/Chip.tsx";
import { Panel } from "../atoms/Panel.tsx";
import { useWorldStore } from "../store/world.ts";

export function InventoryPanel() {
  const world = useWorldStore((s) => s.world);
  const send = useWorldStore((s) => s.send);
  if (!world) return null;
  const inventory = world.items.filter((i) => i.holderId === "player");
  const ground = world.items.filter((i) => i.locationId === world.player.locationId);

  return (
    <Panel title="Inventory + ground">
      <div className="chips">
        {inventory.length === 0 ? (
          <Chip muted>empty pack</Chip>
        ) : (
          inventory.map((item) => (
            <Chip key={item.id} title={item.description} onClick={() => void send({ type: "drop", itemId: item.id } as never)}>
              {item.name} <small>drop</small>
            </Chip>
          ))
        )}
      </div>
      <div className="chips">
        {ground.length === 0 ? (
          <Chip muted>nothing here</Chip>
        ) : (
          ground.map((item) => (
            <Chip key={item.id} title={item.description} onClick={() => void send({ type: "pickup", itemId: item.id } as never)}>
              {item.name} <small>pick up</small>
            </Chip>
          ))
        )}
      </div>
    </Panel>
  );
}
