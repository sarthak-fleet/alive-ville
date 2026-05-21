import { questHintsFor } from "../../../src/hints.ts";
import { activeObjectives } from "../../../src/objectives.ts";
import { Button } from "../atoms/Button.tsx";
import { useWorldStore } from "../store/world.ts";

export function ObjectiveTracker() {
  const world = useWorldStore((s) => s.world);
  const send = useWorldStore((s) => s.send);
  const openDrawer = useWorldStore((s) => s.openDrawer);
  if (!world) return null;

  const objective = activeObjectives(world)[0];
  if (!objective) {
    const completed = (world.quests ?? []).filter((quest) => quest.status === "done").length;
    if (completed === 0) return null;
    return (
      <section className="objective-tracker complete" aria-label="Current objective">
        <div>
          <span>Complete</span>
          <strong>Starter path complete</strong>
          <p>All village starter tasks are resolved. You can keep exploring, talking, saving, or waiting.</p>
        </div>
      </section>
    );
  }
  const resolved = objective.status === "done";
  const quest = (world.quests ?? []).find((candidate) => candidate.id === objective.questId);
  const hint = quest ? questHintsFor(world, quest).at(-1) : null;

  const canMove = world.player.locationId !== objective.locationId;
  const open = objective.status === "open";
  const here = !canMove;

  const act = () => {
    if (objective.storyAction === "confront_shadow" && !canMove) {
      void send({
        type: "confront",
        targetId: objective.storyTargetId ?? "lena",
        text: objective.text,
      } as never);
      return;
    }
    if (objective.storyAction === "fight_challenger" && !canMove) {
      void send({
        type: "fight",
        targetId: objective.storyTargetId ?? "pax",
        moveId: "clean_finisher",
        text: objective.text,
      } as never);
      return;
    }
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

  const actionLabel = objective.actionLabel ?? (canMove
    ? "Go"
    : objective.targetType === "npc"
      ? "Talk"
      : objective.targetType === "item"
        ? "Pick up"
        : "Here");

  return (
    <section className={`objective-tracker${resolved ? " complete" : ""}`} aria-label="Current objective">
      <div>
        <span>{resolved ? "Complete" : open ? "Available" : "Current"}</span>
        <strong>{objective.questTitle}</strong>
        <p>{objective.text}</p>
        {hint && (
          <p className="objective-hint">
            <small>Hint</small>
            {hint.text}
          </p>
        )}
      </div>
      {!resolved && (canMove || objective.targetType !== "location" || objective.storyAction) && (
        <Button onClick={act} variant={here ? "primary" : "default"}>
          {actionLabel}
        </Button>
      )}
    </section>
  );
}
