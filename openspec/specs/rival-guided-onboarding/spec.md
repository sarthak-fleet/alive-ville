# Rival Guided Onboarding

## Purpose

Define the first-session guidance and simulation hold that teach the Rival scenario's move → talk → fight → consequence loop without blocking play or changing other worlds.

## Requirements

### Requirement: Rival guide teaches the core loop by observed action
When a first-time player enters the `rival_duel` world, the client SHALL present a guided sequence for moving, talking to Kael, fighting Kael, and observing the resulting consequence. The guide SHALL advance monotonically only after the current action has been observed.

#### Scenario: First Rival session begins with movement
- **WHEN** a player enters active play in `rival_duel` without saved guide progress
- **THEN** the guide shows movement as step 1 of 4 and identifies the control needed to perform it

#### Scenario: Movement advances to conversation
- **WHEN** the active player demonstrates movement from the movement step
- **THEN** the guide advances to step 2 of 4 and directs the player to find and talk to Kael

#### Scenario: Kael conversation advances to combat
- **WHEN** the player opens dialogue with Kael from the conversation step
- **THEN** the guide advances to step 3 of 4 and explains how to close the conversation and fight

#### Scenario: Kael combat advances to consequence
- **WHEN** Kael becomes hostile or takes combat damage from the combat step
- **THEN** the guide advances to step 4 of 4 and directs the player to finish the showdown and watch the world react

#### Scenario: Visible result completes the sequence
- **WHEN** Kael is defeated or the Rival session reaches a terminal outcome from the consequence step
- **THEN** the guide presents a completion acknowledgement explaining that the action changed the world

### Requirement: Rival guide remains playable and legible
The client SHALL render the active Rival instruction as a compact non-modal overlay that keeps the current action, control, and progress legible while leaving normal movement, interaction, dialogue, and combat input available.

#### Scenario: Guide does not block action input
- **WHEN** an action step is visible
- **THEN** the player can use the instructed keyboard, pointer, dialogue, and combat controls without dismissing a modal first

#### Scenario: Guide reports progress accessibly
- **WHEN** the guide advances to a new step
- **THEN** the visible step count and instruction update in a live status region

### Requirement: Guide progress is scoped and durable
The client SHALL persist validated, versioned Rival guide progress in browser-local storage and SHALL keep the existing generic one-time controls card behavior for non-Rival worlds.

#### Scenario: Rival progress survives reload
- **WHEN** a player reloads after completing an intermediate Rival guide step
- **THEN** the guide resumes at that saved step rather than restarting or skipping ahead

#### Scenario: Completion is dismissed only after acknowledgement
- **WHEN** the consequence has been observed and the player acknowledges completion
- **THEN** the client persists the dismissed state and does not show the Rival guide on later visits with the same guide version

#### Scenario: Invalid saved progress is safe
- **WHEN** the stored guide record is missing, malformed, or from an unsupported version
- **THEN** the client starts at the movement step without failing game startup

#### Scenario: Other worlds retain generic controls
- **WHEN** the active world is not `rival_duel`
- **THEN** the existing one-time controls card is shown or suppressed according to its existing storage flag

### Requirement: Rival pressure waits for first-minute guidance
The client SHALL keep the autonomous Rival world loop stopped while the guided sequence is active and SHALL resume it when the player acknowledges guide completion. This hold SHALL NOT change automatic world-loop startup for non-Rival worlds.

#### Scenario: Title and guide do not consume the Rival deadline
- **WHEN** a player loads `rival_duel` without dismissed guide progress
- **THEN** the autonomous agent loop remains stopped through world and character selection and all active guide steps

#### Scenario: Acknowledgement starts the Rival clock
- **WHEN** the player acknowledges the completed Rival guide
- **THEN** the autonomous agent loop starts and normal story pressure can advance

#### Scenario: Returning trained player keeps normal startup
- **WHEN** a player loads `rival_duel` with valid dismissed guide progress
- **THEN** the autonomous agent loop starts using the existing normal behavior

#### Scenario: Generic worlds keep normal startup
- **WHEN** the loaded world is not `rival_duel`
- **THEN** the autonomous agent loop starts using the existing normal behavior
