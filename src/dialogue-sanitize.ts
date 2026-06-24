/**
 * dialogue-sanitize.ts — clean an LLM dialogue reply.
 *
 * Pure (no deps) so both the server dialogue path (src/dialogue.ts) and the
 * in-browser brain (web3d) can share it. Strips stray speaker-label prefixes and
 * cuts transcript continuation so a model can't ventriloquise both sides.
 */
const REPLY_MAX_CHARS = 420;

export function sanitizeReply(raw: string, npcName: string, playerName = ''): string {
  let text = raw.trim();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // labels the model wrongly prefixes its reply with, or uses to fake extra turns
  const labels = [npcName, playerName, 'Player', 'Wanderer', 'NPC', 'You'].filter(
    (l) => l && l.length <= 40
  );
  const labelAlt = labels.map(esc).join('|');
  if (!labelAlt) return text.slice(0, REPLY_MAX_CHARS);
  // strip a leading speaker label ("Wanderer:", "Old Doran:", …)
  text = text.replace(new RegExp(`^\\s*(?:${labelAlt})\\s*:\\s*`, 'i'), '').trim();
  // stop transcript continuation: drop from the first later "<Speaker>:" line onward
  const turnRe = new RegExp(`^\\s*(?:${labelAlt})\\s*:`, 'i');
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0 && turnRe.test(lines[i]!)) break;
    kept.push(lines[i]!);
  }
  text = kept.join(' ').replace(/\s+/g, ' ').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith('“') && text.endsWith('”'))
  ) {
    text = text.slice(1, -1).trim();
  }
  if (text.length > REPLY_MAX_CHARS) text = `${text.slice(0, REPLY_MAX_CHARS - 1).trimEnd()}…`;
  return text;
}
