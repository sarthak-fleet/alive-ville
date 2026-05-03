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

## 3. The Five Core Products

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

## 4. Source Credibility Policy

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

## 5. Known Research Backbone

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

## 6. What To Steal by Core Product

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

## 7. First Build: Text-Only AI Village

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

### First Model Policy

- background NPCs: templates or no LLM
- normal NPCs: cheap non-thinking model calls
- quest NPCs / director: stronger or thinking model calls only when needed
- gateway logs must track latency, token usage, JSON failure rate, and action rejection rate
- do not send the whole world every turn; retrieve only relevant state and memory

## 8. Sequential Steps

1. Define character/world/event/action schemas.
2. Build text-only event log and world state.
3. Add NPC decision loop.
4. Add memory stream and relationship updates.
5. Add action validation.
6. Add model routing and logging.
7. Add NPC-to-NPC gossip.
8. Add simple quests/consequences.
9. Move into Phaser 2D shell.
10. Add director triggers.
11. Add still scene cards.
12. Add manual world JSON import.
13. Add wiki/fandom import.
14. Add subtitle/anime ingestion.
15. Consider Godot/Unity/3D/video only after the 2D simulation is fun.

## 9. Parallel Work Tracks

| Track | Can Start Now? | Output |
|---|---:|---|
| Agent core | Yes | schemas, loop, memory, validation |
| Model gateway / AI ops | Yes | routing, cost/latency logs, fallbacks |
| Research audit | Yes | steal patterns, not dependencies |
| Phaser client | After schema exists | map, sprites, dialogue UI |
| Media experiments | Lightly | portrait/scene-card tests only |
| Lore import research | Lightly | API notes, not implementation |

## 10. Double-Advocate View

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
- no video before still scene cards
- no 3D before text/2D is fun
- no 100 NPCs before 5 NPCs are good
- no freeform model control of world state

## 11. Non-Negotiable Build Rules

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

## 12. Research Links

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

## 13. Bottom Line

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
