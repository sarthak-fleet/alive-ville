import { type FormEvent, useEffect, useRef, useState } from "react";

import { type DialogueResponse, fetchDialogueHistory, postDialogue, postDialogueChoose, postDialogueStream, type StoryOption } from "../api/client.ts";
import { followChime, questChime, talkBlip, uiBlip } from "../audio/sfx.ts";
import { setFollowing } from "../characters/followers.ts";
import { useCombatStore } from "../combat/store.ts";
import { useUiStore } from "../store/ui.ts";
import { npcById, useWorldStore } from "../store/world.ts";
import { portraitApiUrl, portraitStaticUrl } from "./portrait.ts";

interface Relationship {
  score: number;
  label: string;
}

export function Dialogue() {
  const dialogueNpcId = useUiStore((state) => state.dialogueNpcId);
  const lines = useUiStore((state) => state.dialogueLines);
  const busy = useUiStore((state) => state.dialogueBusy);
  const pushLine = useUiStore((state) => state.pushDialogueLine);
  const setLines = useUiStore((state) => state.setDialogueLines);
  const setBusy = useUiStore((state) => state.setDialogueBusy);
  const closeDialogue = useUiStore((state) => state.closeDialogue);
  const world = useWorldStore((state) => state.world);
  const send = useWorldStore((state) => state.send);
  const [draft, setDraft] = useState("");
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  // keyed by npc so switching conversations resets without a sync setState in the effect
  const [story, setStory] = useState<{ npcId: string; options: StoryOption[] } | null>(null);
  const storyOptions = story && story.npcId === dialogueNpcId ? story.options : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const npc = npcById(world, dialogueNpcId);

  // draft is per-conversation: clear it when the conversation changes,
  // via render-time state adjustment (no setState-in-effect cascade)
  const [draftNpcId, setDraftNpcId] = useState(dialogueNpcId);
  if (draftNpcId !== dialogueNpcId) {
    setDraftNpcId(dialogueNpcId);
    setDraft("");
  }

  // load the shared past: previous conversations + current relationship
  useEffect(() => {
    if (!dialogueNpcId) return;
    inputRef.current?.focus();
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchDialogueHistory(dialogueNpcId);
        if (cancelled) return;
        if (!response.llm) {
          // story mode: choice-driven dialogue served from live sim state
          if (response.story && response.options) setStory({ npcId: dialogueNpcId, options: response.options });
          return;
        }
        if (response.relationship) setRelationship(response.relationship);
        const currentNpc = npcById(useWorldStore.getState().world, dialogueNpcId);
        if (response.turns?.length && currentNpc) {
          setLines(
            response.turns.map((turn) => ({
              speaker: turn.speaker,
              speakerName: turn.speaker === "player" ? "You" : turn.speaker === "npc" ? currentNpc.name : "",
              text: turn.text,
            }))
          );
        }
      } catch {
        // history is a nice-to-have; conversation still works without it
      } finally {
        // NPC-initiated conversation: show their opening line
        const ui = useUiStore.getState();
        const opener = ui.dialogueOpener;
        const openerNpc = npcById(useWorldStore.getState().world, dialogueNpcId);
        if (!cancelled && opener && openerNpc) {
          ui.pushDialogueLine({ speaker: "npc", speakerName: openerNpc.name, text: opener });
          useUiStore.setState({ dialogueOpener: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialogueNpcId, setLines]);

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

  // Portrait state: "static" → "api" → "letter"
  // Must be before any early-return to satisfy rules of hooks.
  const [portraitStage, setPortraitStage] = useState<"static" | "api" | "letter">("static");
  // Reset portrait stage when the NPC changes
  const [portraitNpcId, setPortraitNpcId] = useState(dialogueNpcId);
  if (portraitNpcId !== dialogueNpcId) {
    setPortraitNpcId(dialogueNpcId);
    setPortraitStage("static");
  }

  if (!npc) return null;

  const worldId = world?.id ?? "";

  const handleLlmResponse = (response: DialogueResponse): boolean => {
    if (!response.llm) return false;
    if (response.relationship) setRelationship(response.relationship);
    if (response.reply) {
      pushLine({ speaker: "npc", speakerName: npc.name, text: response.reply });
      if (response.action) {
        pushLine({ speaker: "event", speakerName: "", text: response.action.text });
        if (response.action.type === "follow") setFollowing(npc.id, true);
        if (response.action.type === "unfollow") setFollowing(npc.id, false);
        if (response.action.type === "spar") {
          useCombatStore.getState().engageSpar(npc.id);
          window.setTimeout(() => useUiStore.getState().closeDialogue(), 900);
        }
        if (response.action.type === "fight" || response.action.type === "move") {
          window.setTimeout(() => useUiStore.getState().closeDialogue(), 1100);
        }
      }
      return true;
    }
    // LLM mode is on but this call hiccuped (model cooldown/timeout): soft retry line
    pushLine({ speaker: "event", speakerName: "", text: `${npc.name} pauses, lost in thought. (say that again)` });
    return true;
  };

  const choose = async (option: StoryOption) => {
    if (busy) return;
    pushLine({ speaker: "player", speakerName: world?.player.name ?? "You", text: option.label });
    setBusy(true);
    try {
      const response = await postDialogueChoose(npc.id, option.id);
      talkBlip();
      pushLine({ speaker: "npc", speakerName: npc.name, text: response.reply });
      if (response.action) {
        pushLine({ speaker: "event", speakerName: "", text: response.action.text });
        if (response.action.type === "accept_quest" || response.action.type === "complete_quest") questChime();
        if (response.action.type === "follow") { setFollowing(npc.id, true); followChime(); }
        if (response.action.type === "spar") {
          uiBlip();
          useCombatStore.getState().engageSpar(npc.id);
          window.setTimeout(() => useUiStore.getState().closeDialogue(), 900);
        }
        if (response.action.type === "lead" || response.action.type === "move") {
          window.setTimeout(() => useUiStore.getState().closeDialogue(), 1400);
        }
      }
      setStory({ npcId: npc.id, options: response.options });
      if (option.id === "bye") window.setTimeout(() => useUiStore.getState().closeDialogue(), 700);
    } catch {
      pushLine({ speaker: "event", speakerName: "", text: `${npc.name} didn't catch that.` });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    pushLine({ speaker: "player", speakerName: world?.player.name ?? "You", text });
    setBusy(true);

    // LLM conversation first: streamed in-character reply, no sim tick consumed
    {
      try {
        let streamedAny = false;
        let streamedText = "";
        const ui = useUiStore.getState();
        const response = await postDialogueStream(npc.id, text, (delta) => {
          if (!streamedAny) {
            streamedAny = true;
            talkBlip();
            ui.pushDialogueLine({ speaker: "npc", speakerName: npc.name, text: "" });
          }
          streamedText += delta;
          ui.updateLastDialogueLine(streamedText.trimStart());
        });
        if (response.llm) {
          setBusy(false);
          if (response.relationship) setRelationship(response.relationship);
          if (response.reply) {
            if (streamedAny) ui.updateLastDialogueLine(response.reply);
            else ui.pushDialogueLine({ speaker: "npc", speakerName: npc.name, text: response.reply });
            if (response.action) {
              ui.pushDialogueLine({ speaker: "event", speakerName: "", text: response.action.text });
              if (response.action.type === "create_quest" || response.action.type === "offer_quest" || response.action.type === "complete_quest") questChime();
              if (response.action.type === "follow") { setFollowing(npc.id, true); followChime(); }
              if (response.action.type === "spar") {
                uiBlip();
                useCombatStore.getState().engageSpar(npc.id);
                window.setTimeout(() => useUiStore.getState().closeDialogue(), 900);
              }
              if (response.action.type === "unfollow") setFollowing(npc.id, false);
              if (response.action.type === "fight" || response.action.type === "move") {
                window.setTimeout(() => useUiStore.getState().closeDialogue(), 1100);
              }
            }
          } else {
            const soft = `${npc.name} pauses, lost in thought. (say that again)`;
            if (streamedAny) ui.updateLastDialogueLine(soft);
            else ui.pushDialogueLine({ speaker: "event", speakerName: "", text: soft });
          }
          inputRef.current?.focus();
          return;
        }
      } catch {
        // streaming/network failure: try non-streaming once, else scripted path
        try {
          const response = await postDialogue(npc.id, text);
          if (handleLlmResponse(response)) {
            setBusy(false);
            inputRef.current?.focus();
            return;
          }
        } catch {
          // fall through to scripted
        }
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
        {portraitStage === "letter" ? (
          <div className="dialogue-avatar">{npc.name.charAt(0).toUpperCase()}</div>
        ) : portraitStage === "api" ? (
          <img
            className="dialogue-portrait"
            src={portraitApiUrl(npc.id)}
            alt=""
            onError={() => setPortraitStage("letter")}
          />
        ) : (
          <img
            className="dialogue-portrait"
            src={portraitStaticUrl(npc.id, worldId)}
            alt=""
            onError={() => setPortraitStage("api")}
          />
        )}
        <div>
          <div className="dialogue-name">{npc.name}</div>
          {npc.role ? <div className="dialogue-role">{npc.role}</div> : null}
        </div>
        {relationship ? (
          <div className={`rel-chip ${relationship.score > 1 ? "good" : relationship.score < -2 ? "bad" : ""}`} title="Relationship">
            {relationship.label}
            <span className="rel-score">{relationship.score > 0 ? `+${relationship.score}` : relationship.score}</span>
          </div>
        ) : null}
        <button type="button" className="dialogue-close" onClick={closeDialogue}>
          ✕
        </button>
      </div>
      <div className="dialogue-log" ref={logRef}>
        {lines.length === 0 ? <div className="dialogue-hint">{storyOptions ? `Choose what to say to ${npc.name}…` : `Say something to ${npc.name}…`}</div> : null}
        {lines.map((line, index) =>
          line.speaker === "event" ? (
            <div key={index} className="dialogue-line event">
              {line.text}
            </div>
          ) : (
            <div key={index} className={`dialogue-line ${line.speaker}`}>
              <span className="dialogue-speaker">{line.speakerName}:</span> {line.text}
            </div>
          )
        )}
        {busy ? <div className="dialogue-line npc thinking">…</div> : null}
      </div>
      {storyOptions ? (
        <div className="dialogue-choices">
          {storyOptions.map((option) => (
            <button key={option.id} type="button" disabled={busy} onClick={() => void choose(option)}>
              {option.label}
            </button>
          ))}
        </div>
      ) : (
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
      )}
    </div>
  );
}
