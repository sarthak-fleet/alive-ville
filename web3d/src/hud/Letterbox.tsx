import { useEffect } from 'react';

import { useDirectorStore } from '../director/store.ts';
import { npcById, useWorldStore } from '../store/world.ts';

export function Letterbox() {
  const cutscene = useDirectorStore((state) => state.cutscene);
  const endCutscene = useDirectorStore((state) => state.endCutscene);
  const world = useWorldStore((state) => state.world);

  useEffect(() => {
    if (!cutscene) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape' || event.code === 'Enter') endCutscene();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cutscene, endCutscene]);

  if (!cutscene) return null;

  const actor = npcById(world, cutscene.actorId);

  return (
    <div className="letterbox">
      <div className="letterbox-bar top" />
      <div className="letterbox-bar bottom" />
      <div className="letterbox-beat">
        <div className="letterbox-kind">
          {cutscene.kind === 'villain' ? 'The plan advances' : 'Story beat'}
        </div>
        <div className="letterbox-text">
          {actor ? <span className="letterbox-actor">{actor.name} — </span> : null}
          {cutscene.text}
        </div>
        <div className="letterbox-skip">Esc to skip</div>
      </div>
    </div>
  );
}
