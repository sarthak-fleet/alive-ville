import { useState } from 'react';

import { objectiveForQuest } from '../../../src/objectives.ts';
import { questObjectiveMet } from '../../../src/quest-objectives.ts';
import { useWorldStore } from '../store/world.ts';

const STATUS_ORDER = { active: 0, open: 1, done: 2, failed: 3 } as const;

export function QuestTracker() {
  const world = useWorldStore((state) => state.world);
  const [collapsed, setCollapsed] = useState(false);
  const quests = (world?.quests ?? [])
    .slice()
    .sort((a, b) => STATUS_ORDER[a.status ?? 'open'] - STATUS_ORDER[b.status ?? 'open']);

  if (!world || quests.length === 0) return null;

  return (
    <div className="quests">
      <button type="button" className="quests-header" onClick={() => setCollapsed(!collapsed)}>
        Quests {collapsed ? '▸' : '▾'}
      </button>
      {!collapsed
        ? quests.map((quest) => {
            const status = quest.status ?? 'open';
            const inProgress = status === 'active' || status === 'open';
            const objective = inProgress ? objectiveForQuest(world, quest) : null;
            const met = status === 'active' ? questObjectiveMet(world, quest) : null;
            const giver = quest.giverId
              ? world.npcs.find((npc) => npc.id === quest.giverId)?.name
              : null;
            return (
              <div key={quest.id} className={`quest ${status}`}>
                <span className="quest-status">{statusGlyph(status)}</span>
                <div>
                  <div className="quest-title">
                    {quest.title}
                    {giver && inProgress ? <span className="quest-giver"> · {giver}</span> : null}
                  </div>
                  {quest.description && inProgress ? (
                    <div className="quest-desc">{quest.description}</div>
                  ) : null}
                  {objective ? (
                    <div className={`quest-step ${met === true ? 'met' : ''}`}>
                      {met === true ? '✓ ' : '→ '}
                      {met === true ? 'Done — tell them about it' : objective.text}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        : null}
    </div>
  );
}

function statusGlyph(status: string | undefined): string {
  if (status === 'done') return '✓';
  if (status === 'failed') return '✗';
  if (status === 'active') return '●';
  return '○';
}
