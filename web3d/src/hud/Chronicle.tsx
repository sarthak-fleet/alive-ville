import { useMemo, useState } from 'react';

import type { ChronicleEvent } from '../../../src/types.ts';
import { useWorldStore } from '../store/world.ts';

interface ChronicleProps {
  open: boolean;
  onClose: () => void;
}

const MAX_VISIBLE = 30;

/**
 * The player-facing causal trace: a journal that proves the world's drama
 * threaded through your choices. Newest beats first, gold border on
 * "your doing" entries, click to walk the cause chain back to its root.
 */
export function Chronicle({ open, onClose }: ChronicleProps) {
  const chronicle = useWorldStore((state) => state.world?.chronicle);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const events = useMemo(() => {
    if (!chronicle) return [];
    return [...chronicle].reverse().slice(0, MAX_VISIBLE);
  }, [chronicle]);

  if (!open) return null;

  return (
    <div className="chronicle-panel">
      <div className="chronicle-header">
        <span className="chronicle-title">Chronicle</span>
        <button
          type="button"
          className="chronicle-close"
          onClick={onClose}
          aria-label="Close chronicle"
        >
          ×
        </button>
      </div>
      {events.length === 0 ? (
        <div className="chronicle-empty">Nothing has happened yet. Make some trouble.</div>
      ) : (
        <ul className="chronicle-list">
          {events.map((event) => (
            <ChronicleRow
              key={event.id}
              event={event}
              expanded={expandedId === event.id}
              onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ChronicleRowProps {
  event: ChronicleEvent;
  expanded: boolean;
  onToggle: () => void;
}

function ChronicleRow({ event, expanded, onToggle }: ChronicleRowProps) {
  const chronicle = useWorldStore((state) => state.world?.chronicle);
  const ancestors = useMemo(
    () => (expanded ? walkCauses(chronicle ?? [], event) : []),
    [chronicle, event, expanded]
  );
  const hasCauses = event.causeIds.length > 0;
  return (
    <li className={`chronicle-event ${event.playerCaused ? 'player-caused' : ''}`}>
      <button
        type="button"
        className="chronicle-event-row"
        onClick={onToggle}
        disabled={!hasCauses}
        aria-expanded={expanded}
      >
        <span className="chronicle-time">
          Day {event.day} {String(event.hour).padStart(2, '0')}:00
        </span>
        <span className="chronicle-text">{event.text}</span>
        {event.playerCaused ? <span className="chronicle-tag">your doing</span> : null}
        {hasCauses ? <span className="chronicle-chevron">{expanded ? '▾' : '▸'}</span> : null}
      </button>
      {expanded && ancestors.length > 0 ? (
        <ul className="chronicle-causes">
          {ancestors.map((entry) => (
            <li
              key={`${event.id}-cause-${entry.event.id}`}
              style={{ paddingLeft: `${entry.depth * 14}px` }}
            >
              <span className="chronicle-cause-prefix">↳ because:</span> {entry.event.text}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

interface AncestorEntry {
  event: ChronicleEvent;
  depth: number;
}

function walkCauses(chronicle: ChronicleEvent[], root: ChronicleEvent): AncestorEntry[] {
  const byId = new Map(chronicle.map((entry) => [entry.id, entry]));
  const result: AncestorEntry[] = [];
  const seen = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const ancestor = byId.get(id);
    if (!ancestor) return;
    result.push({ event: ancestor, depth });
    for (const causeId of ancestor.causeIds) visit(causeId, depth + 1);
  };
  for (const id of root.causeIds) visit(id, 0);
  return result;
}
