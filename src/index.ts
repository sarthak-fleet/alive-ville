import { readFileSync } from "node:fs";
import { createDirector } from "./director.ts";
import { createLlmProposer } from "./llm/proposer.ts";
import { isLlmEnabled, proposeAction } from "./llm/router.ts";
import { createEngine } from "./simulation.ts";
import type { World } from "./types.ts";

const WORLD_PATH = new URL(process.env.WORLD_FILE ?? "./worlds/village.json", `file://${process.cwd()}/`);
const world = JSON.parse(readFileSync(WORLD_PATH, "utf8")) as World;
const propose = isLlmEnabled() ? createLlmProposer({ tier: "normal" }) : undefined;
const director = createDirector({ propose: isLlmEnabled() ? proposeAction : undefined });
const engine = createEngine(world, { propose, director });

console.log(`Entering ${engine.state.name} (${isLlmEnabled() ? "LLM" : "scripted"} mode)`);
console.log(await engine.tick({ type: "talk", targetId: "lena", text: "I heard trouble near the bridge." }));
console.log(await engine.tick({ type: "move", locationId: "garden" }));
