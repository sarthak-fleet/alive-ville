import type { TickSummary } from "../../../src/types.ts";
import { useWorldStore } from "../store/world.ts";

export function OutcomeToast() {
  const summary = useWorldStore((s) => s.lastSummary);
  const message = summary ? outcomeMessage(summary) : null;

  if (!message) return null;
  return (
    <section key={`${summary?.tick ?? 0}:${message}`} className="outcome-toast" aria-live="polite">
      <span>Updated</span>
      <strong>{message}</strong>
    </section>
  );
}

function outcomeMessage(summary: TickSummary): string | null {
  for (const entry of [...summary.actions].reverse()) {
    const text = entry.text;
    if (/ is complete\.| completed "/i.test(text)) return text;
    if (/ accepted "/i.test(text)) return text;
    if (/ picked up /i.test(text)) return text;
    if (/ gave /i.test(text)) return text;
  }
  return null;
}
