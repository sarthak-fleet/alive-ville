import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Cutscene, CutsceneId } from "../cutscenes.ts";
import { CUTSCENE_EVENT, cutsceneById, cutsceneForSummary, introCutsceneForScope, isCutsceneUnlocked } from "../cutscenes.ts";
import { useWorldStore } from "../store/world.ts";

const DEFAULT_STORY_ID = "ember_beneath_ashbend";

export function CutscenePlayer() {
  const world = useWorldStore((s) => s.world);
  const summary = useWorldStore((s) => s.lastSummary);
  const [active, setActive] = useState<Cutscene | null>(null);
  const [pending, setPending] = useState<Cutscene[]>([]);
  const activeRef = useRef<Cutscene | null>(null);
  const lastSummaryCutsceneKey = useRef<string | null>(null);
  const scope = useMemo(() => ({ worldId: world?.id ?? "ashbend", storyId: DEFAULT_STORY_ID }), [world?.id]);
  const introSeenKey = `cutscene:intro:${scope.worldId}:${scope.storyId}`;

  useEffect(() => {
    activeRef.current = active;
    if (active) {
      useWorldStore.getState().setZoom(0.85);
    } else {
      useWorldStore.getState().setZoom(1.35);
    }
  }, [active]);

  const showCutscene = useCallback((cutscene: Cutscene) => {
    if (activeRef.current) {
      setPending((queue) => queue.some((entry) => entry.id === cutscene.id) ? queue : [...queue, cutscene]);
      return;
    }
    activeRef.current = cutscene;
    setActive(cutscene);
  }, []);

  const closeCutscene = () => {
    const [next, ...rest] = pending;
    setPending(rest);
    activeRef.current = next ?? null;
    setActive(next ?? null);
  };

  useEffect(() => {
    const seen = window.sessionStorage.getItem(introSeenKey);
    const intro = introCutsceneForScope(scope);
    if (!seen) {
      window.sessionStorage.setItem(introSeenKey, "1");
      const timer = intro ? window.setTimeout(() => showCutscene(intro), 250) : undefined;
      return () => {
        if (timer) window.clearTimeout(timer);
      };
    }
    return undefined;
  }, [introSeenKey, scope, showCutscene]);

  useEffect(() => {
    const onPlay = (event: Event) => {
      const id = (event as CustomEvent<CutsceneId>).detail;
      const cutscene = cutsceneById(id);
      if (isCutsceneUnlocked(cutscene, world)) showCutscene(cutscene);
    };
    window.addEventListener(CUTSCENE_EVENT, onPlay);
    return () => window.removeEventListener(CUTSCENE_EVENT, onPlay);
  }, [showCutscene, world]);

  useEffect(() => {
    if (!summary) return undefined;
    const triggered = cutsceneForSummary(summary, scope);
    if (!triggered || !isCutsceneUnlocked(triggered, world)) return undefined;
    const key = `${summary.tick}:${triggered.id}`;
    if (lastSummaryCutsceneKey.current === key) return undefined;
    lastSummaryCutsceneKey.current = key;
    const timer = window.setTimeout(() => showCutscene(triggered), 0);
    return () => window.clearTimeout(timer);
  }, [scope, summary, showCutscene, world]);

  useEffect(() => {
    const phase = world?.storyProgress?.phase;
    const storyCutsceneId = phase === "nightfall_warning"
      ? "villain_lantern_shadow"
      : phase === "dawn_after_tasks"
        ? "dawn_after_tasks"
        : null;
    if (!storyCutsceneId) return undefined;
    const key = `cutscene:auto:${scope.worldId}:${scope.storyId}:${storyCutsceneId}`;
    if (window.sessionStorage.getItem(key)) return undefined;
    const cutscene = cutsceneById(storyCutsceneId);
    if (!isCutsceneUnlocked(cutscene, world)) return undefined;
    window.sessionStorage.setItem(key, "1");
    const timer = window.setTimeout(() => showCutscene(cutscene), 300);
    return () => window.clearTimeout(timer);
  }, [scope, showCutscene, world]);

  if (!active) return null;

  return (
    <aside className="cutscene-player" aria-live="polite">
      <div className="cutscene-frame">
        <video key={active.id} src={active.src} poster={active.poster} autoPlay muted playsInline onEnded={closeCutscene} />
      </div>
      <div className="cutscene-meta">
        <span>{active.moment}</span>
        <strong>{active.title}</strong>
      </div>
      <button type="button" onClick={closeCutscene}>Continue</button>
    </aside>
  );
}
