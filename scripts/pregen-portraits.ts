/**
 * Pre-generate portraits for every NPC + the player hero in a world JSON.
 * Usage: tsx scripts/pregen-portraits.ts worlds/village.json
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  flushPortraitQueue,
  heroSubject,
  portraitFileName,
  portraitPath,
  type PortraitSubject,
  queuePortrait,
} from "../src/portraits.ts";
import type { World } from "../src/types.ts";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: tsx scripts/pregen-portraits.ts <world.json>");
    process.exit(1);
  }

  const worldPath = resolve(process.cwd(), arg);
  let world: World;
  try {
    world = JSON.parse(readFileSync(worldPath, "utf8")) as World;
  } catch (err) {
    console.error(`Failed to read ${worldPath}:`, (err as Error).message);
    process.exit(1);
  }

  console.info(`World: ${world.name} (${world.id})`);
  console.info(`NPCs: ${world.npcs.length}`);

  type Row = { id: string; name: string; file: string; status: "ok" | "skipped" | "error"; reason?: string };
  const rows: Row[] = [];

  const subjects: Array<{ npcId: string; subject: PortraitSubject }> = [
    { npcId: "player", subject: heroSubject(world.player.name) },
    ...world.npcs.map((npc) => ({
      npcId: npc.id,
      subject: {
        name: npc.name,
        role: npc.role,
        appearance: npc.appearance,
        traits: npc.traits,
      } satisfies PortraitSubject,
    })),
  ];

  const promises: Promise<void>[] = [];

  for (const { npcId, subject } of subjects) {
    const file = portraitPath(npcId, world.id);
    const fileName = portraitFileName(npcId, world.id);

    if (existsSync(file)) {
      rows.push({ id: npcId, name: subject.name, file: fileName, status: "skipped", reason: "exists" });
      continue;
    }

    const p = queuePortrait(npcId, world.id, subject).then((result) => {
      if (result.ok) {
        rows.push({ id: npcId, name: subject.name, file: fileName, status: "ok" });
      } else {
        rows.push({ id: npcId, name: subject.name, file: fileName, status: "error", reason: result.reason });
      }
      return undefined;
    });
    promises.push(p);
  }

  await flushPortraitQueue();
  await Promise.all(promises);

  const colW = [20, 30, 40, 10, 20];
  const header = ["npcId", "name", "file", "status", "reason"].map((s, i) => s.padEnd(colW[i]!)).join("  ");
  console.info(`\n${header}`);
  console.info("-".repeat(header.length));
  for (const row of rows) {
    console.info(
      [row.id, row.name, row.file, row.status, row.reason ?? ""].map((s, i) => s.slice(0, colW[i]!).padEnd(colW[i]!)).join("  ")
    );
  }

  const ok = rows.filter((r) => r.status === "ok").length;
  const skipped = rows.filter((r) => r.status === "skipped").length;
  const errors = rows.filter((r) => r.status === "error").length;
  console.info(`\nDone: ${ok} generated, ${skipped} skipped (exists), ${errors} errors`);

  if (errors > 0) process.exit(1);
}

void main();
