# director-console Specification

## Purpose
Define the optional in-game operator rail used to inspect and step a live Aliveville session while the 3D world remains visible.

## Requirements
### Requirement: Optional Director Console
The game HUD SHALL provide an optional Director Console that is closed by default and opened explicitly by the operator.

#### Scenario: Open console from gameplay HUD
- **WHEN** the player is in the live game and activates the Director control
- **THEN** the system displays a right-side console without navigating away from the 3D scene

#### Scenario: Close console
- **WHEN** the console is open and the operator activates close
- **THEN** the system hides the console and leaves normal gameplay HUD behavior unchanged

### Requirement: Agent loop controls
The Director Console SHALL expose current agent-loop state and controls for pause/resume and single-step execution using existing session APIs.

#### Scenario: Step paused world
- **WHEN** the operator activates step while the loop is running
- **THEN** the system pauses the loop, advances one agent-loop tick, refreshes world state, and shows the resulting summary

#### Scenario: Toggle loop state
- **WHEN** the operator activates pause or resume
- **THEN** the system sends the existing loop toggle request and updates the displayed loop state

### Requirement: Operator inspection rail
The Director Console SHALL show a compact inspection rail with session status, current objective, resident roster, latest action trace, and recent Chronicle entries.

#### Scenario: Inspect residents
- **WHEN** the console is open
- **THEN** the system lists NPCs with names, locations, roles or current goals, and status markers where available

#### Scenario: Inspect trace
- **WHEN** the world has recent tick summaries or Chronicle events
- **THEN** the console displays newest relevant actions and events first in a scrollable rail

### Requirement: Safe integration
The Director Console SHALL avoid new production dependencies and SHALL not expose free-form world intervention in this slice.

#### Scenario: No intervention composer
- **WHEN** the console is open
- **THEN** the system does not provide a free-form command composer that mutates the world outside existing pause/resume/step controls
