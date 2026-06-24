import { useWorldStore } from '../store/world.ts';

const STAGE_LABELS: Record<string, string> = {
  training: 'I — Training',
  trial: 'II — The Trial',
  confrontation: 'III — Confrontation',
  complete: 'Complete',
};

export function ArcPanel() {
  const world = useWorldStore((state) => state.world);
  const arc = world?.arc;
  if (!arc) return null;

  return (
    <div className={`arc-panel ${arc.stage === 'complete' ? 'complete' : ''}`}>
      <div className="arc-title">{arc.title}</div>
      <div className="arc-stage">{STAGE_LABELS[arc.stage] ?? arc.stage}</div>
      <div className="arc-objective">{arc.stageTexts[arc.stage]}</div>
    </div>
  );
}
