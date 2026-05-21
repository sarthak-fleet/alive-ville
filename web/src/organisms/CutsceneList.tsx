import { Button } from "../atoms/Button.tsx";
import { Panel } from "../atoms/Panel.tsx";
import { cutscenesForScope, isCutsceneUnlocked, playCutscene } from "../cutscenes.ts";
import { useWorldStore } from "../store/world.ts";

const DEFAULT_STORY_ID = "ember_beneath_ashbend";

export function CutsceneList() {
  const world = useWorldStore((s) => s.world);
  const worldId = world?.id ?? "ashbend";
  const cutscenes = cutscenesForScope({ worldId, storyId: DEFAULT_STORY_ID });

  return (
    <Panel title="Scenes">
      <ul className="cutscene-list">
        {cutscenes.map((cutscene) => {
          const unlocked = isCutsceneUnlocked(cutscene, world);
          return (
            <li key={cutscene.id} className={unlocked ? "" : "locked"} aria-disabled={!unlocked}>
              <img src={cutscene.poster} alt="" />
              <div>
                <span>{cutscene.moment}</span>
                <strong>{cutscene.title}</strong>
              </div>
              <Button onClick={() => playCutscene(cutscene.id)} disabled={!unlocked}>
                {unlocked ? "Play" : "Locked"}
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
