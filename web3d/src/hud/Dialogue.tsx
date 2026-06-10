import { type FormEvent, useEffect, useRef, useState } from "react";

import { postDialogue } from "../api/client.ts";
import { useUiStore } from "../store/ui.ts";
import { npcById, useWorldStore } from "../store/world.ts";

// remembered per session so the scripted fallback skips a wasted round-trip
let llmDialogueAvailable: boolean | null = null;

export function Dialogue() {
  const dialogueNpcId = useUiStore((state) => state.dialogueNpcId);
  const lines = useUiStore((state) => state.dialogueLines);
  const busy = useUiStore((state) => state.dialogueBusy);
  const pushLine = useUiStore((state) => state.pushDialogueLine);
  const setBusy = useUiStore((state) => state.setDialogueBusy);
  const closeDialogue = useUiStore((state) => state.closeDialogue);
  const world = useWorldStore((state) => state.world);
  const send = useWorldStore((state) => state.send);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const npc = npcById(world, dialogueNpcId);

  useEffect(() => {
    if (dialogueNpcId) inputRef.current?.focus();
  }, [dialogueNpcId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape") closeDialogue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDialogue]);

  if (!npc) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    pushLine({ speaker: "player", speakerName: world?.player.name ?? "You", text });
    setBusy(true);

    // LLM conversation first: in-character, free-flowing, no sim tick consumed
    if (llmDialogueAvailable !== false) {
      try {
        const response = await postDialogue(npc.id, text);
        llmDialogueAvailable = response.llm;
        if (response.llm && response.reply) {
          setBusy(false);
          pushLine({ speaker: "npc", speakerName: npc.name, text: response.reply });
          inputRef.current?.focus();
          return;
        }
        if (response.llm && response.error) {
          // LLM mode on but this call failed — fall through to the scripted path
        }
      } catch {
        llmDialogueAvailable = false;
      }
    }

    // scripted fallback: a talk action through the tick engine
    const summary = await send({ type: "talk", targetId: npc.id, text });
    setBusy(false);
    if (!summary) return;
    const replies = summary.actions.filter((entry) => {
      const action = entry.action;
      return (
        action.actorId === npc.id &&
        (action.type === "talk" || action.type === "confront" || action.type === "gossip")
      );
    });
    for (const entry of replies) {
      const action = entry.action as { text?: string };
      pushLine({ speaker: "npc", speakerName: npc.name, text: action.text ?? entry.text });
    }
    if (replies.length === 0) {
      pushLine({ speaker: "npc", speakerName: npc.name, text: `${npc.name} has nothing to say right now.` });
    }
    inputRef.current?.focus();
  };

  return (
    <div className="dialogue">
      <div className="dialogue-header">
        {npc.appearance?.portrait ? <img className="dialogue-portrait" src={npc.appearance.portrait} alt="" /> : null}
        <div>
          <div className="dialogue-name">{npc.name}</div>
          {npc.role ? <div className="dialogue-role">{npc.role}</div> : null}
        </div>
        <button type="button" className="dialogue-close" onClick={closeDialogue}>
          ✕
        </button>
      </div>
      <div className="dialogue-log" ref={logRef}>
        {lines.length === 0 ? <div className="dialogue-hint">Say something to {npc.name}…</div> : null}
        {lines.map((line, index) => (
          <div key={index} className={`dialogue-line ${line.speaker}`}>
            <span className="dialogue-speaker">{line.speakerName}:</span> {line.text}
          </div>
        ))}
        {busy ? <div className="dialogue-line npc thinking">…</div> : null}
      </div>
      <form className="dialogue-input" onSubmit={submit}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Talk to ${npc.name}`}
          maxLength={240}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
