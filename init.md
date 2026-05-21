# AI World Simulator — Concise Init Doc

## 1. Vision

Build **a system that imports or defines fictional worlds and turns them into interactive AI-driven playable simulations**.

The player should eventually be able to enter a world, pick or create a character, interact with persistent NPC agents, change events, and see consequences through a lightweight game interface.

## 2. Strategic Position

This is not primarily an “AI NPC chat” project. It is a **persistent multi-agent world simulation** with an RPG presentation layer.

Core rule:

> Start with one tiny world that feels alive. Do not start with fandom import, 3D, or video.

First proof:

> **A text-only AI village with 5 NPCs that remember, talk, gossip, move, and react to consequences.**

## 3. Quality Bar

This project must not become a flashy shell with weak mechanics underneath.

Avoid the failure pattern:

- template README / unclear product spine
- impressive UI before the core loop works
- random/chance-based mechanics standing in for simulation
- hardcoded content pretending to be a system
- broad dependencies before there is a concrete need
- no tests around the state transitions that define the product
- no acceptance criteria for what "alive" means

For the first version, quality means:

- one state engine owns events, memories, relationships, locations, and quests
- every NPC action is structured, validated, logged, and reproducible enough to debug
- player actions create visible state changes that affect later NPC behavior
- at least one NPC-to-NPC gossip/confrontation happens because of prior world state
- tests cover action validation, memory insertion/retrieval, relationship deltas, and invalid LLM output rejection
- the text simulation is compelling before any Phaser, art, generated media, or import work begins

## 4. The Five Core Products

| Product | Goal | Start Now? |
|---|---|---:|
| 1. Lore Ingestion / World Compiler | Convert lore into structured playable world data | No |
| 2. Character / Agent Simulation | Make NPCs remember, act, talk, and relate | Yes |
| 3. Narrative Director / Story Orchestrator | Keep the world interesting without railroading | Later |
| 4. Game Runtime / Spatial UX | Make the simulation playable and visible | Yes, minimal |
| 5. Media / Cutscene Layer | Portraits, scene cards, comic panels, later clips | Later |

Correct build order:

```text
Agent simulation → text village → 2D runtime → consequences → director → media → world import
```

## 5. Source Credibility Policy

Use sources in tiers.

### Tier 1 — Primary Research / Official Docs

These are strong enough to shape architecture:

- Generative Agents / Smallville — memory, reflection, planning
- Concordia — Game Master / world-adjudicator pattern
- ReAct — reasoning + action loop
- MemGPT — memory tiers and context management
- RAG / GraphRAG / Lost in the Middle — lore retrieval and long-context warnings
- SOTOPIA — social intelligence evaluation
- FAtiMA — emotional/social agent architecture
- Façade / drama management — narrative director and dramatic beats
- AI Town — practical multi-agent town implementation
- DeepSeek API docs — cheap model backend and structured outputs
- Phaser docs/templates — first 2D runtime
- Cloudflare AI Gateway docs — model routing/observability
- MediaWiki API docs — later lore/wiki import

### Tier 2 — Useful Implementation References

Audit and steal ideas, but do not blindly adopt:

- AI RPG — RPG world-state, quests, regions, locations, saves/logs
- SoulEngine — layered memory, fast/slow mind, action tools
- LLMUnity — Unity/3D LLM integration later
- Agentshire — spatial NPC UX, Soul Mode, decision tiers, map/character tools

### Tier 3 — Experimental Inspiration Only

Use as idea mines, not foundations:

- Super NPC — NPC memory/emotion/personality API shape
- Agent Town — pixel spatial agent UX and visible execution state
- Narratium.ai — worldbook, character cards, branching/visual memory UI
- ARCADIA — emotion engine, GOAP, vector cache/performance ideas

## 6. Known Research Backbone

### Multi-Agent Social Simulation

- **Generative Agents**: use memory stream, retrieval, reflection, planning, and emergent social behavior.
- **Concordia**: use the Game Master pattern where agents propose actions and the world adjudicates outcomes.
- **SOTOPIA**: use for social-goal evaluation: negotiation, cooperation, competition, persuasion, refusal.

### Agent Action Loops

- **ReAct**: NPCs should reason, act, observe, and update state.
- **Reflexion**: later, NPCs can write reflections after failed or important interactions.
- **Voyager**: later, agents can build reusable skill/action libraries.

### Long-Term Memory

- **MemGPT**: memory should be tiered, paged, and managed outside the model.
- **RAG / GraphRAG**: lore should become retrievable memory and entity graphs, not one giant prompt.
- **Lost in the Middle**: long context is not reliable enough to replace retrieval and summarization.

### Narrative Director

- **Façade**: steal dramatic beats and the idea of local character behavior plus global story pressure.
- **Drama management**: director should nudge the story, not railroad it.

### Emotion / Personality / Social Behavior

- **FAtiMA**: use as the reputable reference for emotion appraisal, personality-aware behavior, and social relations.

### Games + LLMs

- **LLMs and Games survey**: use as a field map, not build instructions.
- Recent LLM-NPC studies warn that open-ended NPCs can increase player cognitive load and may not automatically improve player experience. This supports scoped interactions and explicit goals.

## 7. What To Steal by Core Product

### 1. Lore Ingestion / World Compiler

Steal:

- MediaWiki API: official page/wikitext extraction.
- MediaWiki/Fandom links and categories as graph hints.
- RAG/GraphRAG: entity graph + summaries + retrieval.
- AI RPG: target schema for regions, locations, exits, quests, saves, and logs.
- Narratium.ai: worldbook, character-card, branch/session visualization, and beginner-friendly world editor UX inspiration only.

Do not copy:

- fragile browser scraping as the first import path
- automatic canon fidelity before human review exists
- roleplay-only lore storage without game-state validation

Do first:

```text
manual world JSON → playable world
```

Do later:

```text
wiki/fandom/subtitles → extracted entities → world bible draft → human review → playable world
```

### 2. Character / Agent Simulation

Steal:

- Generative Agents: memory stream, retrieval, importance scoring, reflection, planning.
- Concordia: agent proposes, world adjudicates.
- ReAct: structured reasoning/action loop.
- FAtiMA: emotion + social relations.
- AI Town: small-town multi-agent framing.
- Super NPC: simple NPC API shape, memory/emotion/personality/relationship module boundaries, JSON state serialization, REST-style service boundary.
- SoulEngine: layered memory, NPC memory tiers, fast speaker vs slow thinker, relationship graph, bounded personality drift, action tools.
- Agentshire: algorithmic default behavior plus AI only when needed, L1 daily plan / L2 tactical choice / L3 dialogue, relationship graph, daily narrative summaries.
- ARCADIA: later GOAP/emotion/vector-cache inspiration only.

Do not copy:

- 25-agent social simulation before 5 NPCs work
- full daily schedules before event-driven behavior works
- voice, personality evolution, or self-improving agents in v0
- 3D-first town simulation or OpenClaw/QClaw as required architecture

Core rule:

> LLM proposes. Game engine validates.

### 3. Narrative Director

Steal:

- Façade: dramatic beats.
- Drama management: nudge narrative based on player/world state.
- Concordia: Game Master/world adjudicator.
- AI RPG: quest-state constraints.
- Generative Agents: reflection summaries and social propagation through gossip.
- Agentshire: event choreography, summon/rally/assign/celebrate-style beats, mini-event injections, visible world events, stress/pressure mechanics.
- ARCADIA: later GOAP-style director goal selection.

First director version:

```text
If nothing interesting happened recently:
  find unresolved tension
  choose involved NPCs
  trigger rumor / confrontation / request / danger event
  validate against world state
```

### 4. Game Runtime / Spatial UX

Steal:

- Phaser: first browser 2D prototype.
- AI Town: town simulation UX.
- Agent Town: visible agent state and task bubbles.
- Agentshire: town/chat mode, dialogue bubbles, typewriter streaming, NPC status cards, map/character editor ideas, day/night/weather as cheap ambience.
- Godot/Unity/LLMUnity: later migration paths only.

Do not copy first:

- 3D town
- full weather/audio/VFX system
- engine-specific LLM integrations before the backend simulation works

First UI:

```text
small map
player movement
NPC sprites
dialogue bubbles
event log
relationship/debug panel
simulation tick
```

### 5. Media / Cutscene Layer

Steal:

- AI RPG: optional generated art that does not block gameplay.
- Narratium.ai: character/lore visual UI inspiration.
- Agentshire: VFX, dialogue bubbles, ambience, scene presentation, preview-card/lightbox patterns.
- WhisperX: timestamped transcript and speaker-diarization ideas for later source analysis.
- PySceneDetect: scene/shot chunking for later video ingestion research.

Do not build first:

- generated video
- full anime clip import
- generated animation pipeline

Build order:

```text
portraits → location images → item cards → scene cards → comic panels → voice → short clips
```

First media feature:

```text
major event → one still scene card + caption → cached asset
```

## 8. First Build: Text-Only AI Village

### Scenario

A demon scout has been seen near the forest.

Characters:

- Arin — blacksmith; proud, suspicious, secretly kind.
- Mira — innkeeper; warm, social, observant, gossipy.
- Tovan — guard; rigid, insecure, fearful.
- Lysa — mage; secretive, intelligent, morally ambiguous.
- Player — talks, moves, triggers events, changes relationships.

Expected loop:

```text
Mira hears the demon scout rumor.
Mira tells Tovan.
Tovan confronts Lysa.
Player asks Arin for a sword.
Arin refuses because trust is low.
Player proves themselves.
Arin remembers and changes behavior later.
```

### Required Systems

- event log
- character cards
- memory stream
- relationship graph
- emotion state
- allowed actions
- structured JSON action output
- action validator
- model router
- NPC-to-NPC gossip
- save/log trail for debugging prompts, actions, and rejected actions
- cost/latency/JSON-validity/action-rejection metrics

### Current Implementation Status

Done:

- TypeScript world/action schemas with validation.
- Ashbend Village world JSON with 5 NPCs, locations, exits, items, one quest, clock, and event log.
- Simulation engine for ticks, player actions, NPC actions, movement, memory, relationships, items, quests, checksums, and time.
- Scripted NPC proposer that proves gossip/confront/remember loops without requiring an LLM.
- OpenAI-compatible LLM router with normal/quest model tiers, JSON action parsing, timeout handling, and per-call logging.
- LLM proposer that retrieves relevant NPC memories, builds scoped prompts, validates proposed actions, and rejects invalid output.
- Narrative director that pushes unresolved relationship tension using either a quest-tier LLM call or a scripted fallback.
- Replay support and server endpoints for state/tick interaction.
- React + Phaser shell with village map, player/NPC presentation, event log, inventory, quests, relationships, and replay inspector.
- Test coverage for simulation, world validation, quests, replay, LLM parsing/routing, proposer behavior, director behavior, and server API.

Still missing / next:

- Run a real LLM-backed playtest and tune prompts against rejection rate and repetitive behavior.
- Add local model support as a first-class model backend, starting with a local 30B model.
- Add richer emotion/personality state instead of goals + relationship scores only.
- Add clearer NPC dialogue bubbles / status affordances in the 2D shell.
- Add durable save/load sessions beyond in-memory server state.
- Add scene cards only after the village loop is consistently interesting.

### First Model Policy

- background NPCs: templates or no LLM
- normal NPCs: cheap non-thinking model calls
- quest NPCs / director: stronger or thinking model calls only when needed
- gateway logs must track latency, token usage, JSON failure rate, and action rejection rate
- do not send the whole world every turn; retrieve only relevant state and memory

### Local LM Studio Model Plan

Goal:

> Make LM Studio the first local model runner for normal NPC decisions while keeping the same validated action pipeline.

Assumption:

- Use an OpenAI-compatible local server so the existing `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_NORMAL`, and `LLM_MODEL_QUEST` router can stay mostly unchanged.
- First runtime: LM Studio's OpenAI-compatible endpoint at `http://localhost:1234/v1`.
- First model source: GGUF models managed by LM Studio, starting with a Qwen 30B/35B-class instruct model.
- First challenger target: Qwen3.6-35B-A3B GGUF if it is available locally and can produce clean JSON in non-thinking/instruct mode.
- Candidate fallback runtimes: Ollama, llama.cpp server, or vLLM if LM Studio latency, automation, or JSON reliability is not good enough.

First integration:

```text
LM Studio local model → normal NPC tier
scripted fallback → background / no-key mode
remote stronger model or local larger reasoning model → quest/director tier, optional
```

Checklist:

1. Confirm LM Studio has the target GGUF downloaded/imported and loaded.
2. Start LM Studio's local OpenAI-compatible server.
3. Set `.env` locally, without committing secrets:
   `LLM_BASE_URL=http://localhost:1234/v1`
   `LLM_API_KEY=lm-studio`
   `LLM_MODEL_NORMAL=<exact model id from /v1/models>`
4. Start with `LLM_MAX_NPCS=1` for local smoke tests, then raise it after latency and JSON validity are acceptable.
5. Run one LLM-backed tick from the server and inspect `logs/` for latency, JSON validity, and rejected actions.
6. Tune timeout, temperature, and prompts for short valid actions.
7. Decide whether quest/director stays scripted/remote, moves to the same LM Studio model, or gets a separate local reasoning model.

Baseline eval command:

```bash
pnpm eval:lmstudio
```

The LM Studio runner starts the local server if needed, resolves the downloaded Qwen 30B/35B-class model id, runs `pnpm eval:llm`, then unloads models and stops the server unless it was already running. Use `LMSTUDIO_KEEP_SERVER=1` or `LMSTUDIO_KEEP_MODEL=1` when actively iterating. The eval rotates NPC order by default so `LLM_MAX_NPCS=1` can cover more than the first NPC without parallel local calls. Set `EVAL_ROTATE_NPCS=0` to preserve world order. Compare future models by changing only `LLM_MODEL_NORMAL`, then checking JSON validity, action rejection rate, skip rate, action variety, and latency.

Non-NPC internet/research utility:

```bash
pnpm research:url https://example.com "What facts matter for a playable world?"
```

This fetches a URL, extracts readable text, and asks the configured quest/import model to summarize facts, entities, conflicts, and clearly labeled game-design inferences. It is deliberately outside NPC ticks so internet access does not affect live gameplay latency or give NPCs out-of-world knowledge.

## 9. Sequential Steps

Current priority lock:

> Do not move to story import, media, voice, packaging, or broader world-authoring until tracks 1 and 2 are right.

Track 1 is **agent interaction, working behavior, and memory**. This is collaborative design work: we will decide what kinds of agents we want, how they remember, how they plan, and what makes them feel alive.

Track 2 is **actual gameplay**. Codex owns this track proactively: make the thing playable, responsive, visible, and closer to a real top-down RPG instead of a dashboard.

Near-term sequence:

1. Make the game runtime full-screen and player-first.
2. Replace hardcoded scene drawing with a reusable tilemap/asset workflow.
3. Use existing top-down RPG patterns for movement, collision, doors, prompts, depth sorting, and dialogue UI.
4. Make player controls obvious: WASD/arrows, click-to-walk, interact key, doors, NPC interactions.
5. Make basic verbs visible and satisfying: move, talk, pick up, give, inspect, complete task.
6. Keep AI/local model work behind responsive gameplay so model latency never blocks movement.
7. Strengthen agent memory and relationship behavior.
8. Add repeatable playtests/evals for agents and gameplay.
9. Only after tracks 1 and 2 are fun enough, resume story import and media.

## 10. Program Roadmap

This is not one feature. It is a stack of linked products that need to mature together without letting later layers distract from the core loop.

### A. Agent Simulation / Living World

Goal:

> NPCs behave like persistent characters, not chat endpoints.

Includes:

- agent state: goals, needs, mood, personality, relationships, inventory, location, schedule
- memory: raw memories, summaries, importance, retrieval, decay, contradiction handling
- interaction: talk, gossip, confront, trade, ask, help, refuse, join, avoid
- planning: short-term intent, daily plan, reactive interruption
- world adjudication: LLM proposes, engine validates, state mutates only through rules
- social propagation: secrets, rumors, reputation, trust, fear, favors, grudges
- observability: action logs, prompt logs, rejection reasons, model latency, replay

Done enough when:

- the player can change an NPC's future behavior through prior actions
- NPCs can affect each other without the player
- repeated playthroughs create different but understandable social outcomes
- invalid or weird model output is contained by validation

#### Agent State v1

Goal:

> A world starts with characters thrown into it, then keeps moving through goals, memories, relationships, ambitions, secrets, and conflict.

Core idea:

- the world has rules: magic/tech/social constraints, factions, locations, danger, economy, tone
- characters have initial state: backstory, personality, memories, relationships, inventory, secrets, needs, goals
- some characters are simple NPCs, some are quest-givers, some are smarter long-term actors, and some are villains
- the player enters as a character, not a floating cursor
- the story advances even if the player waits, because agents and factions keep acting

Agent tiers:

- **background**: schedule, barks, local reactions, no LLM by default
- **local NPC**: memory-aware dialogue, small goals, can give/help/refuse simple tasks
- **major character**: plans, ambitions, relationship strategy, secrets, can change future behavior
- **villain / antagonist**: long-term agenda, hidden moves, manipulation, escalation, limited by what they know and can do
- **director**: outside-the-world pacing system; reveals pressure, rumors, events, and consequences without giving villains unfair omniscience

State shape v1:

- identity: id, name, role, tier, faction, public description
- traits: personality tags, values, flaws, fears, speech style
- needs: safety, trust, money/resources, status, rest, curiosity, revenge, duty
- mood: current emotion, stress, confidence, suspicion
- goals: short-term goal, long-term ambition, blockers, priority
- plans: current intent, next planned action, daily schedule, fallback action
- relationships: trust, affection, fear, respect, debt/favor, suspicion
- memories: raw memory, importance, recency, source, visibility, emotional weight, summary tags
- knowledge: facts known, rumors believed, secrets known, lies believed
- inventory/capabilities: items, skills, permissions, access, magic/tools if the world supports them
- constraints: morality, taboos, faction rules, physical limits, local laws, story/world rules

World state v1:

- world rules: what is possible/impossible, genre tone, special systems such as magic
- factions: goals, resources, reputation, conflicts
- clocks: day/time, event deadlines, villain plan stage
- public facts vs private facts
- active tensions: unresolved conflicts that can produce quests or drama
- director pressure: quietness, repetition, unresolved danger, player confusion, pending reveals

Behavior loop v1:

1. Gather local context: location, nearby characters/items, active quests, recent events, relevant memories.
2. Retrieve memories and facts for the agent's current goal/relationship/scene.
3. Choose a valid intent: help, ask, avoid, confront, gossip, trade, investigate, move, wait, hide, escalate.
4. Propose one structured action.
5. Engine validates against world rules and current state.
6. Apply consequences: memories, relationships, quest state, inventory, faction/world changes.
7. Summarize what changed so future agents and the UI can explain it.

Implementation sequence:

1. Extend schemas for agent traits, needs, mood, ambitions, secrets, current intent, and relationship axes.
2. Add memory metadata: importance, tags, source actor, visibility, emotional weight.
3. Add retrieval helpers for "what should this agent remember right now?"
4. Add an intent planner that works scripted first and LLM-backed second.
5. Add villain plan state: stage, objective, hidden actions, next trigger, known facts.
6. Add director pressure state separate from villain plans.
7. Add eval scenarios for gossip, refusal, quest help, villain escalation, and player-caused relationship change.

Done enough when:

- a character's prior memories and relationships change what they do later
- a villain can advance a plan while still obeying world knowledge and constraints
- the director can create pressure without railroading outcomes
- player action can help, harm, reveal, delay, or redirect an agent's goal
- evals can catch invalid actions, repetitive behavior, hallucinated knowledge, and ignored memories

### B. Actual Gameplay / 2D Runtime

Goal:

> It should feel like a small playable RPG, not a dashboard over a simulation.

Reuse-first rule:

> Do not hand-roll standard game systems when proven 2D game tooling, asset workflows, or open-source patterns can carry them.

Preferred reuse:

- Phaser for runtime, camera, input, scene lifecycle, animation, tweens, and collision.
- Tiled or LDtk-style map workflow for real maps instead of hardcoded rectangles.
- Existing open/paid top-down asset packs for tiles, props, characters, UI frames, and animation sheets.
- Established RPG patterns: tile layers, object layers, collision layers, spawn points, interaction zones, doors, depth sorting, and dialogue boxes.
- Open-source Phaser RPG examples as architecture references, with license review before copying code/assets.

Hand-roll only:

- the AI/world-state bridge
- action validation hooks
- memory/relationship consequences
- custom game verbs unique to this project

Includes:

- controllable player character with movement, camera, collision, interact key, and click-to-walk
- explorable locations with doors, interiors/exteriors, usable objects, pickups, and NPC placement
- dialogue UI with choices, short barks, memory-aware responses, and visible consequences
- quest and task loops: fetch, help, investigate, mediate, escort, repair, persuade
- time loop: day/night, schedules, openings/closings, events by time
- feedback: animations, speech bubbles, relationship deltas, quest updates, item changes
- save/load and replay of meaningful sessions

Done enough when:

- the player always knows what they can do next
- moving, talking, picking up, giving, and resolving a quest are visible and responsive
- the first village has at least one 10-minute playable loop
- the AI enhances play instead of blocking basic responsiveness

### B2. 2D Scale + Guidance

Goal:

> Bigger worlds should feel explorable without making the player lost or turning the UI into a quest spreadsheet.

Includes:

- much larger maps split into zones, regions, interiors, roads, and wilderness edges
- LDtk/Tiled levels for exterior zones and separate interior rooms
- transitions: doors, roads, world-map edges, room portals, hidden entrances
- map streaming or room-based loading when the world becomes too large for one Phaser scene
- upgraded minimap/world map with current region, known places, discovered doors, and quest-relevant areas
- task hints: quest compass, subtle objective pins, interact glow, "last seen at" clues, NPC rumor hints, and journal hints
- learned hints: UI should show clues only after the player heard, saw, or discovered them
- hint sources: dialogue, memories, item descriptions, event log, world facts, and director nudges
- path guidance: highlight reachable doors/regions without hard-locking exploration

Done enough when:

- a player can navigate a larger map without opening debug panels
- tasks tell the player what they know, not omniscient spoilers
- the map supports multiple interiors and zones without rewriting the engine
- hints can be produced from agent/world knowledge instead of only hardcoded quest text

### C. Story / Lore Import

Goal:

> Turn source material into a playable world bible and structured game state.

Includes:

- manual world editor first: characters, locations, factions, items, events, canon timeline
- importer sources later: wiki/fandom pages, markdown notes, subtitles/transcripts, episode summaries
- extraction: entities, relationships, locations, recurring objects, timeline events, character traits
- canon graph: who knows what, when events happened, what is public/private, what is mutable
- human review: accept/reject extracted facts before they become game state
- playable compiler: convert lore into locations, NPC cards, memories, quests, constraints, starting state

Done enough when:

- a user can paste or write a small world bible and get a playable village draft
- imported facts are inspectable and editable
- the game can preserve canon constraints while allowing player divergence

### D. Narrative Director / Fun Engine

Goal:

> Keep the world interesting without railroading the player.

Includes:

- dramatic beats: rumor, conflict, request, mystery, danger, reconciliation, consequence
- pacing model: detect quiet stretches, repeated actions, unresolved tension, player goals
- event injection: director creates opportunities, not forced outcomes
- quest weaving: turn social/world state into optional tasks
- escalation/de-escalation: conflicts can grow, resolve, or transform

Done enough when:

- quiet play naturally produces something worth investigating
- the director can explain why it nudged the world
- generated events are valid, local, and grounded in current state

### E. Model Backend / Evals / AI Ops

Goal:

> Make model choice empirical and swappable.

Includes:

- local baseline: LM Studio OpenAI server + one loaded Qwen 30B/35B-class GGUF model
- model router: background/scripted, normal NPC, quest/director, import/extraction
- non-NPC research utility: URL fetch/extract/summarize through the configured model for later lore/import work
- eval harness: JSON validity, rejection rate, latency, skip rate, action diversity, memory usage
- prompt/version tracking
- fallback strategy: scripted action, smaller local model, stronger remote model, timeout handling
- cost/performance dashboard later

Done enough when:

- changing `LLM_MODEL_NORMAL` is enough to compare models
- evals catch regressions before playtesting
- local model latency does not make player input feel broken

### F. Authoring / Creator Tools

Goal:

> Let worlds be built, debugged, and repaired without editing raw JSON forever.

Includes:

- world editor: locations, exits, NPCs, items, quests, relationships
- memory/event inspector
- prompt/action/rejection log viewer
- replay timeline
- import review queue
- character card editor
- balance/debug tools: force event, teleport NPC, inspect memories, reset branch

Done enough when:

- creating a second small world does not require touching engine code
- broken imports/actions can be diagnosed from UI

### G. Persistence / Branching / Multiplayer-Later

Goal:

> Sessions should survive, branch, and be debuggable.

Includes:

- durable saves
- deterministic-ish replay from event log plus snapshots
- branch points for player choices
- world snapshots and migrations
- later: shared worlds, async multiplayer, spectators, creator publishing

Done enough when:

- a session can be saved, resumed, replayed, and branched

### H. Character Design / Media / Voice

Goal:

> Make characters memorable after the simulation works.

Includes:

- character portraits and sprites
- location art and item cards
- scene cards for major events
- dialogue styling and personality-specific speech patterns
- voice barks / TTS later
- music, ambience, weather, VFX
- generated video or comic panels much later

Done enough when:

- major NPCs are visually and vocally distinct
- media is cached, consistent, and never blocks the core loop

### I. Quality / Safety / Product Packaging

Goal:

> Make the thing shippable, not just impressive in a demo.

Includes:

- test coverage for state transitions, imports, model failures, saves, and UI smoke flows
- content safety boundaries for imported worlds and generated dialogue
- performance budgets for local models and browser runtime
- licensing checks for borrowed code/assets
- onboarding: sample worlds, templates, quickstart
- packaging: local desktop app or hosted web app later

Done enough when:

- a new user can run it, load a sample world, play, and understand what happened

## 11. Grand Plan: AI World Simulator

This project is a persistent AI-agent world simulator presented as a playable RPG. The grand plan has five product categories: compile worlds, simulate characters, orchestrate story pressure, present the simulation as a game, and raise media quality. Ashbend is the first proof world for all five.

### Five Product Categories

| Category | Role | Current Direction |
|---|---|---|
| 1. Lore Ingestion / World Compiler | Convert stories and world bibles into structured playable world data. | Keep Ashbend hand-authored for now: `world.json`, quests, items, NPCs, and cutscene manifest entries. Defer wiki/fandom import until the loop works. |
| 2. Character / Agent Simulation | Make NPCs remember, act, talk, relate, and pursue goals. | Deepen memory, goals, relationships, schedules, ambitions, secrets, and model-eval coverage. The LLM proposes; the engine validates and owns state. |
| 3. Narrative Director / Story Orchestrator | Keep the world interesting without railroading. | Separate villain plans, director pressure, quiet-world nudges, reveals, and escalation beats from ordinary NPC behavior. |
| 4. Game Runtime / Spatial UX | Make the simulation playable, readable, and fun. | Keep the 2D Phaser RPG loop focused on movement, quests, interactions, objectives, minimap, hints, and visible consequences. |
| 5. Media / Cutscene Layer | Make events and characters feel authored and desirable. | Use shipped cutscenes, per-character appearance metadata, sprites, portraits, sound, and later voice/3D. Runtime generation stays out of gameplay. |

### Where We Are Now

- Ashbend has playable Phaser 2D movement, NPCs, quests, items, minimap, ambient systems, objective routing, and automated tests/playtests.
- Ashbend and Z-City now include world-data `interactables` that render as clickable inspection hotspots, feed clues into the event log, and stay package/import-ready.
- Story packages can now be exported from the app and imported back through a validated server route; package shape includes factions, tensions, villain plans, interactables, quests, and cutscene references.
- The three starter quests are playable end-to-end.
- The cutscene catalog exists, scoped by world/story/arc/order, with Q4 Phosphene shipped `.mp4` assets.
- Nightfall progression now exists: starter quest completion unlocks the Lantern Inn objective, the player confronts the Lantern Shadow, and Dawn Over Ashbend unlocks after resolution.
- A v1 story-package export shape exists for Ashbend with validation for world/NPC/item/quest/cutscene references.
- Story-package validation now covers duplicate IDs, exit endpoints, item holders, interactable quest links, tension references, villain-plan actors, and cutscene metadata; the app has a package review popover with counts and structural issues.
- A local One Punch Man/Z-City test world exists as the first anime-style import rehearsal. It reuses the shared quest/objective/story systems, adds character appearance metadata and local portrait assets, and has its own smoke playtest.
- The Interact panel now includes explicit adjacent-location travel controls, so room/path movement is available through UI controls as well as click-to-move.
- NPCs have deterministic schedules, current intents, next-action hints, and relevant-memory surfacing in dialogue.
- NPC schedules now create visible routine movement during normal ticks, while quest-critical NPCs stay stable enough for the player to follow objectives.
- NPCs now carry `appearance` metadata: source look, body type, hair, outfit, palette, silhouette, visual tags, and optional portrait/sprite paths. Phaser actors and dialogue portraits use the palette now; exact local anime assets can be attached through those optional paths.
- Combat actions now produce visible 2D feedback: target flash, hit burst, slash, knockback, camera shake, and combat-specific toast styling.
- Combat is now stateful: hostile NPCs have HP/posture/defeated state, non-finishers weaken them, and finishers resolve encounters.
- Optional local SFX cues now mark combat, pickups/gifts, inspections, quest outcomes, and director beats without adding generated media or runtime model dependency.
- Optional procedural music now runs locally through WebAudio, with different harmonic palettes for Ashbend, Z-City, and nightfall/shadow phases. This is a prototype score layer, not a replacement for composed music assets.
- The music control now exposes the active theme name (`Ashbend Dawn`, `Nightfall Warning`, `Lantern Shadow`, `Z-City Pulse`, `Overpass Duel`) so phase-specific score changes are visible and testable.
- Music themes now have distinct tempo, chord, motif, bass, pulse, and voice-level definitions instead of one shared generic loop.
- Character movement animation now has stronger squash/stretch, shadow response, and footstep dust for player and NPC movement.
- Fight presentation now has stronger scene staging: cinematic bars, move-name cut-ins, speed lines, impact arcs, lunge/knockback, shake, combat stingers, HP/damage overlay, and combat-specific toast styling.
- Waiting can now raise director pressure into readable story beats instead of doing nothing.
- Ignored world tensions now escalate into explicit visible statuses and Story panel pressure meters, instead of remaining hidden data.
- Escalated tensions now expose concrete counterplay hints in the Story panel and director reveal text, so the player can recover from ignored pressure instead of only seeing danger rise.
- Quest completion now has deterministic aftermath: relationship trust/suspicion branches into trusted, wary, or neutral memories, relevant world tensions lose pressure, and completed quest drawers show the consequence instead of generic completion copy.
- The local model direction is Qwen3 through LM Studio for NPC/model eval work, but no local model should run unless a task specifically needs inference.

### Strict Product-Readiness Read

| Category | Current read | Why |
|---|---:|---|
| Lore Ingestion / World Compiler | 46% | World/package shape, export, stronger validation, server import, in-app package review, factions, tensions, villain plans, interactables, quests, cutscene references, and a second world exist. It is not close to 80 until a manual package authoring/editing UI can create or revise this without hand-editing JSON. |
| Character / Agent Simulation | 42% | NPC state, schedules, memories, relationships, intents, movement, dialogue context, and trust/suspicion-based quest aftermath exist. It is not close to 80 until those states affect more actions, schedules, and replayable NPC choices. |
| Narrative Director / Story Orchestrator | 42% | Pressure, villain plans, reveals, nightfall beats, wait escalation, visible tension status, quest-based tension relief, and counterplay hints exist. It is not close to 80 until ignored plans reliably produce multi-step consequences and recoverable player responses. |
| Game Runtime / Spatial UX | 61% | The 2D game is playable with movement, explicit travel controls, rooms, quests, items, inspectable props, objectives, minimap, cutscenes, character choice, stateful combat, stronger fight presentation, and tests. It is not close to 80 until fights have better encounter flow, affordances are clearer, and the loop is more replayable. |
| Media / Cutscene Layer | 49% | Shipped cutscenes, portraits, procedural sprites, appearance metadata, ambient polish, stronger movement animation, combat FX, combat UI, optional SFX, named prototype music themes with distinct arrangements, combat stingers, fight cut-ins, and HP/damage overlays exist. It is not close to 80 until characters, composed music/sound, UI feedback, and scene presentation feel cohesive. |

### 80% Target Gates

The next target is not "final product"; it is an 80%-ready 2D vertical slice where every category is strong enough to keep building without rethinking the foundation.

| Category | 80% Gate |
|---|---|
| Lore Ingestion / World Compiler | A second world can be produced from a structured package with validated locations, factions, characters, items, quests, appearances, and cutscene manifest references. Manual package input is acceptable; fandom/wiki import is not required yet. |
| Character / Agent Simulation | NPC schedules, memories, relationships, moods, ambitions, and secrets visibly change dialogue, movement, available actions, and at least a few quest/story outcomes. |
| Narrative Director / Story Orchestrator | Villain plans and director pressure advance if ignored, produce readable clues/consequences, and resolve through player action without relying on model hallucination. |
| Game Runtime / Spatial UX | The 2D game is a polished playable prototype: reliable rooms, movement, click-to-move, hints, objectives, fights, character choice, minimap, save/load, playtests, and a clear 10-minute loop. |
| Media / Cutscene Layer | Characters and places have cohesive 2D presentation: usable sprites/portraits, shipped cutscenes, clear feedback, ambient polish, and no runtime media generation dependency. |

### Next Priority Stack

1. Game Runtime / Spatial UX: improve replayability with larger map/interiors, stronger hints, more interactable props, clearer quest affordances, and better feedback after state changes.
2. Character / Agent Simulation: make schedules affect behavior more visibly and let relationship/memory state change more dialogue and quest outcomes.
3. Narrative Director / Story Orchestrator: make villain plan progression produce more player-facing consequences if ignored.
4. Media / Cutscene Layer: improve the authored feel with better sprites, portraits, sound cues, and shipped cutscenes only.
5. Lore Ingestion / World Compiler: keep external import frozen, but use the story-package shape for any new Ashbend content.

## 12. Phase Plan

### Phase 0 — Current Baseline

Status:

- Ashbend world JSON exists.
- State engine, validation, memory, relationships, quests, replay, server, React shell, and local model path exist.
- Phaser scene exists but is still prototype-quality.

Exit criteria:

- local model eval baseline recorded
- one visible playable loop works end-to-end
- user can move, talk, pick up, give, and see consequences

### Phase 1 — Alive Village Vertical Slice

Build:

- proper full-screen top-down village runtime with readable movement/interactions
- richer NPC memory and relationship model
- Agent State v1: traits, needs, mood, ambitions, secrets, current intent, richer relationship axes
- villain plan state and director pressure state as separate systems
- dialogue choices and short NPC responses
- one quest with multiple resolutions
- learned task hints from dialogue/world knowledge
- director event when the world goes quiet
- save/load for one session
- automated first-loop browser playtest for: start quest, travel, pickup, return, complete, screenshot evidence

Exit criteria:

- 10-minute Ashbend playtest is understandable and at least somewhat fun
- NPC behavior references prior events without hallucinating world state
- player can intentionally improve or damage a relationship
- at least one antagonist or pressure source advances a valid plan if ignored
- the player gets non-spoilery hints for the current task
- no player movement or camera action waits on an LLM call
- debug panels are optional overlays, not the primary experience

Current browser playtest command:

```bash
pnpm playtest:first-loop
pnpm playtest:basic-v0
pnpm playtest:alive
```

These start isolated local API/Vite ports, restore the village fixture, drive Chromium through playable flows, assert objective progression, check completion feedback, and write screenshots to `tmp/playtest-artifacts/`. `playtest:first-loop` covers the Mira shears quest; `playtest:basic-v0` covers all three starter quests, verifies the nightfall objective, plays through the Lantern Shadow confrontation, and checks the dawn cutscene unlock; `playtest:alive` verifies the playable surface, sound toggle, canvas boot, and an ambient wait state without console/page errors.

### Phase 2 — Model + Agent Evals

Build:

- repeatable NPC eval scenarios
- model comparison matrix for local models
- prompt/version logs
- social behavior tests: gossip, refusal, apology, trade, quest help

Exit criteria:

- we can say why one model is better than another for this game
- regressions show up in evals before manual playtest

### Phase 3 — Authoring + Manual Import

Build:

- world editor for manual input
- character/world bible schema
- importer from markdown/JSON notes
- review UI for extracted facts

Exit criteria:

- create a second playable world from a human-authored world bible

### Phase 4 — Lore Import

Build:

- wiki/fandom import
- subtitle/transcript import
- entity graph and canon timeline
- canon divergence model

Exit criteria:

- import a small public-domain or user-provided story into a playable draft with review

### Phase 5 — Presentation Layer

Build:

- sprite/portrait pipeline
- consistent character design
- location art
- event scene cards
- voice experiments

Exit criteria:

- the first village has a cohesive visual/audio identity

## 13. Parallel Work Tracks

| Track | Can Start Now? | Output |
|---|---:|---|
| Agent core | Active | Agent State v1: traits, needs, mood, ambitions, secrets, current intent, relationship axes, memory metadata, planning, social propagation |
| Gameplay runtime | Active, Codex-owned | reuse-first top-down runtime: tilemap workflow, asset packs, collision, interactions, quest loop, responsive UI |
| 2D scale + guidance | Support now, active after Agent State v1 | larger zones/interiors, LDtk/Tiled level expansion, clue-based quest hints, minimap/world-map upgrades |
| Model backend / evals | Support only | local baseline and regression checks for agent/gameplay work |
| Narrative director | Support now | director pressure separate from villain plans; quiet-world nudges, reveals, consequences, grounded hints |
| Persistence / replay | Hold except debug support | save/load after the first playable loop is clearer |
| Authoring tools | Hold | no editor until Ashbend proves the model |
| Story import | Frozen | no wiki/fandom/subtitle work until tracks 1 and 2 are right |
| Media / character design | Support now | local Q4 Phosphene/LTX cutscene pack as shipped `.mp4` assets only; no runtime generation |
| Packaging / onboarding | Frozen | no packaging until there is a playable vertical slice |

## 14. Double-Advocate View

### Case For

This is a strong learning project because it forces you to build real AI-agent infrastructure:

- memory systems
- action/tool calling
- state validation
- multi-agent interaction
- model routing
- long-running behavior
- social simulation
- game-state management

These skills transfer beyond games.

### Case Against

The end state is dangerously broad:

- import any anime/fandom
- preserve chronology
- generate images/clips
- support branching canon
- build intelligent NPCs
- build a game runtime
- build memory/director/import systems

That will fail if started directly.

Risk controls:

- no fandom import before manual world JSON
- video is allowed only as offline-generated, shipped cutscene assets; no runtime generation
- no 3D before text/2D is fun
- no 100 NPCs before 5 NPCs are good
- no freeform model control of world state

## 15. Local Cutscene Pipeline Notes

- Current path: Phosphene / LTX Q4 on Apple Silicon, generated offline and imported as `.mp4`.
- Confirmed trial: Q4 quick 640x480, 121 frames, 8 steps, 5 seconds, completed in about 125 seconds on the local 48 GB Mac.
- Use cases: game intro, quest completion beats, villain hints, location reveals, dream/vision moments.
- Runtime rule: Phaser/React only plays cached assets; generation never happens during gameplay.
- Scale rule: cutscenes are catalog entries scoped by `worldId`, `storyId`, `arcId`, `order`, and declarative triggers. Imported external stories/worlds should add catalog rows and assets, not React conditionals.
- Progression rule: Ashbend uses engine-owned `world.storyProgress.phase`, `unlockedCutsceneIds`, and `playedCutsceneIds`. The LLM never mutates these fields directly.
- Trigger types for now: `session_start`, `quest_completed`, `story_phase`, and `manual`. Add new trigger kinds only when gameplay exposes a stable state event.
- Current vertical slice target: starter quests unlock quest scenes, starter completion unlocks the Lantern Shadow beat, and resolving the shadow confrontation unlocks Dawn Over Ashbend.
- Next asset-quality path: image-to-video from actual Ashbend screenshots or concept stills, not text-to-video alone.
- Later note: run a Q8 trial only after Q4 standard/I2V is stable. Benchmark memory pressure, peak RSS, elapsed time, and visual gain before adopting Q8 for hero cutscenes.

## 16. Non-Negotiable Build Rules

1. The database/world state is source of truth.
2. The LLM never directly mutates the world.
3. Every AI action must pass validation.
4. Memory is external, tiered, and retrievable.
5. Relationships move slowly and are multi-axis.
6. NPCs should prefer short speech + action over monologues.
7. Research cannot block the first 5-NPC village.
8. Experimental repos are idea mines, not foundations.
9. The first version must be fun in text before visuals matter.
10. The project is “AI Town + RPG consequences,” not “import anime first.”

## 17. Research Links

Primary research / docs:

- Generative Agents: https://arxiv.org/abs/2304.03442
- Concordia: https://github.com/google-deepmind/concordia
- ReAct: https://arxiv.org/abs/2210.03629
- MemGPT: https://arxiv.org/abs/2310.08560
- RAG: https://arxiv.org/abs/2005.11401
- GraphRAG: https://arxiv.org/abs/2404.16130
- Lost in the Middle: https://arxiv.org/abs/2307.03172
- SOTOPIA: https://arxiv.org/abs/2310.11667
- FAtiMA: https://arxiv.org/abs/2103.03020
- Façade: https://users.soe.ucsc.edu/~michaelm/publications/mateas-gdc2003.pdf
- Drama Management: https://sites.cc.gatech.edu/fac/ashwin/papers/er-09-10.pdf
- LLMs and Games Survey: https://arxiv.org/abs/2402.18659
- Voyager: https://arxiv.org/abs/2305.16291

Implementation / tooling:

- AI Town: https://github.com/a16z-infra/ai-town
- DeepSeek API: https://api-docs.deepseek.com/quick_start/pricing
- Phaser Vite TS Template: https://github.com/phaserjs/template-vite-ts
- Cloudflare AI Gateway: https://developers.cloudflare.com/ai-gateway/
- MediaWiki Action API: https://www.mediawiki.org/wiki/API:Action_API
- Godot docs: https://docs.godotengine.org/
- LLMUnity: https://github.com/undreamai/LLMUnity

Audit-only references:

- AI RPG: https://github.com/envy-ai/ai_rpg
- SoulEngine: https://github.com/PranavMishra17/SoulEngine
- Agentshire: https://github.com/Agentshire/Agentshire
- Super NPC: https://pypi.org/project/supernpc/
- Agent Town: https://github.com/geezerrrr/agent-town
- Narratium.ai: https://github.com/Kryo123456/Narratium.ai
- ARCADIA: https://github.com/ruvnet/ARCADIA
- WhisperX: https://github.com/m-bain/whisperX
- PySceneDetect: https://github.com/Breakthrough/PySceneDetect

## 18. Bottom Line

Build this first:

```text
Text-only AI Village
5 NPCs
memory stream
relationship graph
emotion state
NPC-to-NPC gossip
structured actions
action validator
model router
```

If that feels alive, move to Phaser. If it does not, adding fandom import, images, clips, or 3D will not fix the product.
