import { activeObjectives } from "../../../src/objectives.ts";
import { Button } from "../atoms/Button.tsx";
import { useWorldStore } from "../store/world.ts";

export function ObjectiveTracker() {
  const world = useWorldStore((s) => s.world);
  const send = useWorldStore((s) => s.send);
  const openDrawer = useWorldStore((s) => s.openDrawer);
  if (!world) return null;

  const objective = activeObjectives(world)[0];
  if (!objective) return null;

  const canMove = world.player.locationId !== objective.locationId;
  const open = objective.status === "open";
  const here = !canMove;

  const act = () => {
    if (canMove) {
      window.dispatchEvent(new CustomEvent("ashbend:travel-to", { detail: { locationId: objective.locationId } }));
      return;
    }
    if (objective.targetType === "npc") {
      openDrawer(objective.targetId);
      return;
    }
    if (objective.targetType === "item") {
      void send({ type: "pickup", itemId: objective.targetId } as never);
    }
  };

  const actionLabel = canMove
    ? "Go"
    : objective.targetType === "npc"
      ? "Talk"
      : objective.targetType === "item"
        ? "Pick up"
        : "Here";

  return (
    <section className="objective-tracker" aria-label="Current objective">
      <div>
        <span>{open ? "Available" : "Current"}</span>
        <strong>{objective.questTitle}</strong>
        <p>{objective.text}</p>
      </div>
      {(canMove || objective.targetType !== "location") && (
        <Button onClick={act} variant={here ? "primary" : "default"}>
          {actionLabel}
        </Button>
      )}
    </section>
  );
}
