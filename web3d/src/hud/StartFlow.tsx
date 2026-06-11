import { useEffect, useState } from "react";

import { combatMovesFor } from "../../../src/combat.ts";
import type { Npc, World } from "../../../src/types.ts";
import { api } from "../api/client.ts";
import { ensureAudio, uiBlip } from "../audio/sfx.ts";
import { actorVisualFor, clothingColorsFor } from "../mapping/visuals.ts";
import { useUiStore } from "../store/ui.ts";
import { useWorldStore } from "../store/world.ts";
import { CharacterPortrait } from "./CharacterPortrait.tsx";

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
            <FandomImport
              busy={busy}
              onStart={() => setBusy("fandom")}
              onDone={(err) => {
                setBusy(null);
                if (err) setError(err);
                else setPhase("character");
              }}
            />
          </>
        ) : (
          <CharacterSelect world={world} busy={busy} onPick={(id) => void selectCharacter(id)} onBack={() => setPhase("title")} />
        )}
        {error ? <div className="start-error">{error}</div> : null}
      </div>
    </div>
  );
}

/** type any franchise name — the server researches the fandom wiki and builds the world */
function FandomImport({ busy, onStart, onDone }: { busy: string | null; onStart: () => void; onDone: (error: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const run = async () => {
    if (!query.trim() || busy) return;
    ensureAudio();
    uiBlip();
    onStart();
    setStatus("Researching the wiki and building the world… (~1 min)");
    try {
      const res = await fetch(api("/api/import-fandom"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; wiki?: string | null };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `import failed: ${res.status}`);
      setStatus(null);
      await useWorldStore.getState().init();
      onDone(null);
    } catch (error) {
      setStatus(null);
      onDone((error as Error).message);
    }
  };

  return (
    <div className="fandom-import">
      <div className="fandom-import-row">
        <input
          type="text"
          value={query}
          placeholder="Summon any world… e.g. Naruto, One Piece, Attack on Titan"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void run();
          }}
          disabled={busy !== null}
        />
        <button type="button" disabled={busy !== null || !query.trim()} onClick={() => void run()}>
          {busy === "fandom" ? "Summoning…" : "Summon"}
        </button>
      </div>
      <div className="start-hint">{status ?? "Built live from the fandom wiki — or paste world JSON in-game via “Import world”."}</div>
    </div>
  );
}

const WANDERER = {
  id: null,
  name: "The Wanderer",
  blurb: "An outsider with no past here — write your own story.",
  color: "#58a6ff",
};

function CharacterSelect({
  world,
  busy,
  onPick,
  onBack,
}: {
  world: World | null;
  busy: string | null;
  onPick: (npcId: string | null) => void;
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const npcs = (world?.npcs ?? []).filter((npc) => !npc.combat?.defeated);
  const selected = selectedId ? npcs.find((npc) => npc.id === selectedId) ?? null : null;

  return (
    <>
      <div className="start-heading">Who are you in {world?.story?.title ?? world?.name}?</div>
      <div className="start-columns">
        <div className="start-list">
          <button
            type="button"
            className={`start-card continue ${selectedId === null ? "selected" : ""}`}
            onClick={() => setSelectedId(null)}
          >
            <span className="start-swatch" style={{ background: WANDERER.color }} />
            <div className="start-card-name">{WANDERER.name}</div>
            <div className="start-card-blurb">{WANDERER.blurb}</div>
          </button>
          {npcs.map((npc) => {
            const visual = actorVisualFor(npc.appearance, clothingColorsFor(npc.id).color);
            return (
              <button
                key={npc.id}
                type="button"
                className={`start-card ${selectedId === npc.id ? "selected" : ""}`}
                onClick={() => setSelectedId(npc.id)}
              >
                <span className="start-swatch" style={{ background: visual.color }} />
                <div className="start-card-name">{npc.name}</div>
                <div className="start-card-blurb">{npc.role ?? npc.description?.slice(0, 70) ?? ""}</div>
              </button>
            );
          })}
        </div>
        {world ? <CharacterDetail world={world} npc={selected} busy={busy} onPick={onPick} /> : null}
      </div>
      <button type="button" className="start-back" onClick={onBack}>
        ← Back to worlds
      </button>
    </>
  );
}

function CharacterDetail({
  world,
  npc,
  busy,
  onPick,
}: {
  world: World;
  npc: Npc | null;
  busy: string | null;
  onPick: (npcId: string | null) => void;
}) {
  const visual = npc ? actorVisualFor(npc.appearance, clothingColorsFor(npc.id).color) : null;
  const hp = npc?.combat?.maxHp ?? 120;
  const moves = combatMovesFor({ ...world, player: { ...world.player, characterId: npc?.id ?? undefined } } as World).slice(0, 4);
  const locationName = npc ? world.locations.find((entry) => entry.id === npc.locationId)?.name : "the city gates";
  const personality = [...(npc?.traits?.personality ?? []), ...(npc?.traits?.values ?? [])].slice(0, 5);
  const goal = npc?.goals?.[0] ?? npc?.ambitions?.[0]?.title;

  const portraitVisual = visual ?? { color: WANDERER.color, accentColor: "#e8c95a", skinColor: "#e8c39e", bodyShape: "average" as const };

  return (
    <div className="char-detail">
      <div className="char-detail-main">
        <CharacterPortrait visual={portraitVisual} npc={npc} />
        <div className="char-detail-body">
          <div className="char-detail-head">
            <div>
              <div className="char-detail-name">{npc?.name ?? WANDERER.name}</div>
              <div className="char-detail-role">
                {npc?.role ?? "outsider"}
                {npc?.tier === "quest" ? <span className="char-badge">key figure</span> : null}
              </div>
            </div>
          </div>
          <div className="char-detail-desc">{npc?.description ?? WANDERER.blurb}</div>
        </div>
      </div>
      {personality.length > 0 ? (
        <div className="char-chips">
          {personality.map((trait) => (
            <span key={trait} className="char-chip">
              {trait}
            </span>
          ))}
        </div>
      ) : null}
      {goal ? <div className="char-goal">Wants: {goal}</div> : null}
      <div className="char-stats">
        <div className="char-stat">
          <span className="char-stat-label">HP</span> {hp}
        </div>
        <div className="char-stat">
          <span className="char-stat-label">Level</span> 1
        </div>
        <div className="char-stat">
          <span className="char-stat-label">Starts at</span> {locationName}
        </div>
      </div>
      <div className="char-moves">
        {moves.map((move) => (
          <div key={move.id} className="char-move">
            <span className="char-move-name">{move.label}</span>
            <span className="char-move-meta">
              {move.style} · {move.damage} dmg
            </span>
          </div>
        ))}
      </div>
      <button type="button" className="char-pick" disabled={busy !== null} onClick={() => onPick(npc?.id ?? null)}>
        {busy ? "Becoming…" : npc ? `Become ${npc.name}` : "Begin as the Wanderer"}
      </button>
    </div>
  );
}
