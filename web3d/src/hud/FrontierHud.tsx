import { useLocalBrain } from '../ai/local-llm.ts';
import { useWorldStore } from '../store/world.ts';

/**
 * Frontier legibility HUD: NPC count + the active dialogue compute backend, with
 * a "no server" badge when the in-browser brain is driving NPC dialogue.
 * (FPS now lives in the dedicated corner <FpsCounter />.)
 */
export function FrontierHud(): React.ReactElement {
  const npcCount = useWorldStore((state) => state.world?.npcs.length ?? 0);
  const brainStatus = useLocalBrain((state) => state.status);
  const caps = useLocalBrain((state) => state.caps);

  const local = brainStatus === 'ready' || brainStatus === 'generating';
  const backend = local ? 'WebGPU · local' : caps?.webgpu ? 'cloud (WebGPU idle)' : 'cloud LLM';

  return (
    <div className="frontier-hud" title="Frontier capability readout">
      <span className="fh-stat">{npcCount} NPCs</span>
      <span className="fh-sep">·</span>
      <span className={`fh-backend ${local ? 'local' : ''}`}>{backend}</span>
      {local ? <span className="fh-badge">no server</span> : null}
    </div>
  );
}
