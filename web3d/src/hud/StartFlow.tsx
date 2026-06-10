import { useEffect, useState } from "react";

import { api } from "../api/client.ts";
import { ensureAudio, uiBlip } from "../audio/sfx.ts";
import { actorVisualFor, clothingColorsFor } from "../mapping/visuals.ts";
import { useUiStore } from "../store/ui.ts";
import { useWorldStore } from "../store/world.ts";

interface BundledWorld {
  id: string;
  name: string;
  blurb: string;
  kind: "world" | "source";
}

/** Root flow: pick a world, then pick who you are in it. */
export function StartFlow() {
  const phase = useUiStore((state) => state.gamePhase);
  const setPhase = useUiStore((state) => state.setGamePhase);
  const world = useWorldStore((state) => state.world);
  const send = useWorldStore((state) => state.send);
  const [worlds, setWorlds] = useState<BundledWorld[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "title") return;
    void (async () => {
      try {
        const res = await fetch(api("/api/worlds"));
        const data = (await res.json()) as { worlds: BundledWorld[] };
        setWorlds(data.worlds);
      } catch {
        setWorlds([]);
      }
    })();
  }, [phase]);

  if (phase === "playing") return null;

  const selectWorld = async (id: string | null) => {
    ensureAudio();
    uiBlip();
    setError(null);
    if (id === null) {
      // continue in the currently loaded world
      setPhase("character");
      return;
    }
    setBusy(id);
    try {
      const res = await fetch(api("/api/worlds/select"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`select failed: ${res.status}`);
      await useWorldStore.getState().init();
      setPhase("character");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const selectCharacter = async (npcId: string | null) => {
    ensureAudio();
    uiBlip();
    if (npcId) {
      setBusy(npcId);
      await send({ type: "choose_character", targetId: npcId });
      setBusy(null);
    }
    setPhase("playing");
  };

  return (
    <div className="start-flow">
      <div className="start-inner">
        <div className="start-brand">ALIVEVILLE</div>
        {phase === "title" ? (
          <>
            <div className="start-heading">Choose a world</div>
            <div className="start-grid">
              {world ? (
                <button type="button" className="start-card continue" onClick={() => void selectWorld(null)}>
                  <div className="start-card-name">Continue: {world.story?.title ?? world.name}</div>
                  <div className="start-card-blurb">Pick up where the world left off — day {world.clock.day}.</div>
                </button>
              ) : null}
              {worlds.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="start-card"
                  disabled={busy !== null}
                  onClick={() => void selectWorld(entry.id)}
                >
                  <div className="start-card-name">{busy === entry.id ? "Generating…" : entry.name}</div>
                  <div className="start-card-blurb">{entry.blurb}</div>
                </button>
              ))}
            </div>
            <div className="start-hint">Or import any world JSON in-game via “Import world”.</div>
          </>
        ) : (
          <>
            <div className="start-heading">Who are you in {world?.story?.title ?? world?.name}?</div>
            <div className="start-grid">
              <button type="button" className="start-card continue" onClick={() => void selectCharacter(null)}>
                <span className="start-swatch" style={{ background: "#58a6ff" }} />
                <div className="start-card-name">The Wanderer</div>
                <div className="start-card-blurb">An outsider with no past here — write your own.</div>
              </button>
              {(world?.npcs ?? [])
                .filter((npc) => !npc.combat?.defeated)
                .map((npc) => {
                  const visual = actorVisualFor(npc.appearance, clothingColorsFor(npc.id).color);
                  return (
                    <button
                      key={npc.id}
                      type="button"
                      className="start-card"
                      disabled={busy !== null}
                      onClick={() => void selectCharacter(npc.id)}
                    >
                      <span className="start-swatch" style={{ background: visual.color }} />
                      <div className="start-card-name">{busy === npc.id ? "Becoming…" : npc.name}</div>
                      <div className="start-card-blurb">{npc.role ?? npc.description?.slice(0, 90) ?? ""}</div>
                    </button>
                  );
                })}
            </div>
            <button type="button" className="start-back" onClick={() => setPhase("title")}>
              ← Back to worlds
            </button>
          </>
        )}
        {error ? <div className="start-error">{error}</div> : null}
      </div>
    </div>
  );
}
