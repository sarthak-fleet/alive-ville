import { Panel } from "../atoms/Panel.tsx";
import { useWorldStore } from "../store/world.ts";

export function StoryPanel() {
  const story = useWorldStore((s) => s.world?.story);
  if (!story) return null;
  return (
    <Panel title={story.title}>
      <p className="story-opening">{story.opening}</p>
      {story.currentObjective && <p className="story-objective">{story.currentObjective}</p>}
    </Panel>
  );
}
