import type { TickSummary } from "../../../src/types.ts";
import { useWorldStore } from "../store/world.ts";

export function OutcomeToast() {
  const summary = useWorldStore((s) => s.lastSummary);
  const message = summary ? outcomeMessage(summary) : null;
  const tone = summary ? outcomeTone(summary) : "default";

  if (!message) return null;
  return (
    <section key={`${summary?.tick ?? 0}:${message}`} className={`outcome-toast ${tone}`} aria-live="polite">
      <span>{tone === "combat" ? "Combat" : tone === "story" ? "Story" : "Updated"}</span>
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
    if (/ inspected /i.test(text)) return text;
    if (/ gave /i.test(text)) return text;
  }
  for (const entry of [...summary.actions].reverse()) {
    const text = entry.text;
    if (entry.fromDirector) return text;
    if (entry.action.type === "fight") return text;
    if (entry.action.type === "move" && entry.action.actorId !== "player") return text;
  }
  return null;
}

function outcomeTone(summary: TickSummary): "combat" | "story" | "default" {
  if (summary.actions.some((entry) => entry.action.type === "fight")) return "combat";
  if (summary.actions.some((entry) => entry.fromDirector || /Director|clue|beat|night|alert/i.test(entry.text))) return "story";
  return "default";
}
