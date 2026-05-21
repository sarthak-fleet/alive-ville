import { counterplayForTension } from "../../../src/agents.ts";
import { Panel } from "../atoms/Panel.tsx";
import { useWorldStore } from "../store/world.ts";

export function StoryPanel() {
  const world = useWorldStore((s) => s.world);
  const story = world?.story;
  if (!world || !story) return null;
  const villainPlan = world.villainPlans?.[0];
  const tensions = [...(world.tensions ?? [])]
    .filter((tension) => tension.status !== "resolved")
    .sort((a, b) => b.pressure - a.pressure)
    .slice(0, 3);
  return (
    <Panel title={story.title}>
      <p className="story-opening">{story.opening}</p>
      {story.currentObjective && <p className="story-objective">{story.currentObjective}</p>}
      <div className="story-state">
        <span>Phase: {world.storyProgress?.phase ?? "starter"}</span>
        <span>Director pressure: {world.directorState?.pressure ?? 0}</span>
        {villainPlan && <span>Hidden plan stage: {villainPlan.stage}</span>}
      </div>
      {tensions.length > 0 && (
        <div className="story-tensions">
          {tensions.map((tension) => (
            <div key={tension.id} className={`story-tension ${tension.status ?? "quiet"}`}>
              <span>{tension.status ?? "quiet"}</span>
              <strong>{tension.title}</strong>
              <div className="pressure-meter" aria-label={`${tension.title} pressure ${tension.pressure}`}>
                <i style={{ width: `${Math.max(4, Math.min(100, tension.pressure))}%` }} />
              </div>
              <small>Counter: {counterplayForTension(world.id, tension.id)}</small>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
