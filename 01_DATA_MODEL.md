# Minimum Play Tracker PWA — Data Model Specification

**Document:** `01_DATA_MODEL.md`  
**Status:** Implementation-ready  
**Audience:** Coding agent / software engineer  
**Primary persistence:** IndexedDB  
**Cloud dependency:** None for MVP  
**Application mode:** Offline-first PWA

---

# 1. Purpose

This document defines the complete application data model for the Minimum Play Tracker PWA.

The data model must support:

- reusable teams and rosters;
- one-time game setup;
- game-specific player eligibility/status;
- persistent live lineups;
- recording each play and participating players;
- qualifying vs non-qualifying MPR plays;
- quarter boundaries;
- late arrival, injury, absence, and exemption states;
- lineup presets;
- undo and corrections;
- derived MPR counts and risk indicators;
- full local persistence;
- crash/reload recovery;
- import/export;
- forward-compatible schema migrations;
- an auditable history of significant actions.

The model must not require a hosted API or database.

---

# 2. Recommended Technology

Use:

- **IndexedDB** as the local system of record.
- **Dexie.js** as the IndexedDB wrapper.
- **TypeScript** for all domain models and persistence code.
- A versioned application-level export schema independent of the IndexedDB schema version.

The app should treat IndexedDB as authoritative. UI state that can be derived from IndexedDB should not be stored independently unless required for immediate interaction.

---

# 3. Core Modeling Principles

## 3.1 Stable IDs

Every persistent entity must use a stable string ID.

Recommended ID format:

```ts
crypto.randomUUID()
```

Do not use array indexes, jersey numbers, names, timestamps, or auto-increment integers as domain identifiers.

---

## 3.2 Team roster vs game roster

A `Player` belongs to a reusable `Team`.

A `GamePlayer` represents that player's state in one specific game.

Do not place game-specific fields such as injury status, minimum required plays, late arrival, or participation totals on the reusable `Player` record.

---

## 3.3 Plays are immutable facts

A recorded play should be treated as a historical fact.

If a user corrects a play:

- update the play only through a dedicated correction operation;
- add an audit event explaining the change;
- preserve the original creation timestamp;
- update `updatedAt`;
- increment `revision`.

Undo should not silently remove history. For MVP, an undone play may be marked `voided = true` rather than physically deleted.

---

## 3.4 Participation totals are derived

Do not persist a player's cumulative MPR play count as the primary truth.

Compute it from:

- non-voided plays;
- `countsForMpr === true`;
- play-participant associations.

Optional cached totals may be added later for performance, but the play ledger remains authoritative.

---

## 3.5 Game state is recoverable

All information necessary to resume an active game after reload must be persisted, including:

- current quarter;
- next play number;
- current lineup;
- active game;
- active roster and statuses;
- MPR configuration;
- lineup presets.

---

# 4. Entity Overview

Core entities:

1. `Team`
2. `Player`
3. `TeamSettings`
4. `Game`
5. `GamePlayer`
6. `LineupPreset`
7. `LineupPresetMember`
8. `CurrentLineupMember`
9. `Play`
10. `PlayParticipant`
11. `GameEvent`
12. `AppSettings`
13. `ImportRecord` optional but recommended

Relationship summary:

```text
Team
 ├── Player[]
 ├── TeamSettings
 ├── LineupPreset[]
 │    └── LineupPresetMember[]
 └── Game[]
      ├── GamePlayer[]
      ├── CurrentLineupMember[]
      ├── Play[]
      │    └── PlayParticipant[]
      └── GameEvent[]
```

---

# 5. Enumerations

## 5.1 GameStatus

```ts
type GameStatus =
  | "draft"
  | "active"
  | "completed"
  | "abandoned";
```

Meaning:

- `draft`: setup started but live tracking has not begun.
- `active`: live game in progress.
- `completed`: explicitly ended by user.
- `abandoned`: intentionally terminated without normal completion.

---

## 5.2 GamePlayerStatus

```ts
type GamePlayerStatus =
  | "active"
  | "absent"
  | "late"
  | "injured"
  | "exempt"
  | "ineligible";
```

Rules:

- `active`: participates in MPR logic.
- `absent`: not expected to play.
- `late`: initially unavailable; can later become active.
- `injured`: no longer expected to continue; existing plays remain.
- `exempt`: visible but excluded from MPR requirement.
- `ineligible`: visible for roster completeness but excluded from game participation.

---

## 5.3 MprRiskLevel

This is derived, not stored on the player.

```ts
type MprRiskLevel =
  | "met"
  | "needs_plays"
  | "at_risk"
  | "critical"
  | "excluded";
```

---

## 5.4 EventType

```ts
type EventType =
  | "game_started"
  | "game_completed"
  | "game_abandoned"
  | "quarter_ended"
  | "quarter_changed"
  | "player_status_changed"
  | "player_activated"
  | "player_deactivated"
  | "play_recorded"
  | "play_voided"
  | "play_restored"
  | "play_corrected"
  | "lineup_preset_applied"
  | "lineup_cleared"
  | "roster_imported"
  | "game_exported"
  | "manual_note";
```

---

## 5.5 PresetType

```ts
type PresetType =
  | "offense"
  | "defense"
  | "kickoff"
  | "kick_return"
  | "punt"
  | "punt_return"
  | "custom";
```

---

# 6. Entity Definitions

# 6.1 Team

```ts
interface Team {
  id: string;
  name: string;
  seasonLabel?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string;
  archivedAt?: string;
}
```

Constraints:

- `name` required.
- `name.trim().length >= 1`.
- archived teams remain readable by historical games.
- deleting a team with historical games should be blocked; archive instead.

Suggested indexes:

- `id`
- `name`
- `updatedAt`

---

# 6.2 Player

```ts
interface Player {
  id: string;
  teamId: string;
  jerseyNumber: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  activeOnTeam: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

Notes:

- Jersey numbers must be stored as strings, not integers.
- This allows values such as `"00"` or future nonstandard identifiers.
- `displayName` is the authoritative display value.
- `firstName` and `lastName` are optional convenience fields.

Constraints:

- `teamId` required.
- `displayName` required.
- `jerseyNumber` required for MVP.
- duplicate jersey numbers should trigger a roster validation warning.
- duplicates may be permitted only through an explicit override.

Suggested indexes:

- `id`
- `teamId`
- `[teamId+jerseyNumber]`
- `[teamId+activeOnTeam]`

---

# 6.3 TeamSettings

One settings record per team.

```ts
interface TeamSettings {
  teamId: string;
  defaultRequiredPlays: number;
  defaultExpectedPlayersOnField: number;
  defaultMprDeadlineQuarter?: number;
  defaultCountsSpecialTeams: boolean;
  defaultCountsPat: boolean;
  defaultCountsAcceptedPenaltyPlays: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Recommended defaults:

```ts
{
  defaultRequiredPlays: 8,
  defaultExpectedPlayersOnField: 11,
  defaultMprDeadlineQuarter: 4,
  defaultCountsSpecialTeams: true,
  defaultCountsPat: true,
  defaultCountsAcceptedPenaltyPlays: false
}
```

The setup screen should always allow overrides.

---

# 6.4 Game

```ts
interface Game {
  id: string;
  teamId: string;

  opponent?: string;
  gameLabel?: string;
  gameDate: string; // local date YYYY-MM-DD

  status: GameStatus;

  requiredPlaysDefault: number;
  expectedPlayersOnField: number;

  mprDeadlineQuarter?: number;

  countsSpecialTeams: boolean;
  countsPat: boolean;
  countsAcceptedPenaltyPlays: boolean;

  currentQuarter: number;
  nextPlayNumber: number;

  startedAt?: string;
  completedAt?: string;

  createdAt: string;
  updatedAt: string;

  revision: number;
}
```

Rules:

- `currentQuarter` initially `1`.
- `nextPlayNumber` initially `1`.
- `status` initially `draft`.
- once `status === "active"`, rules should not be casually editable.
- rule edits during an active game require a confirmation and audit event.
- `revision` increments for material game edits.

Indexes:

- `id`
- `teamId`
- `status`
- `gameDate`
- `[teamId+gameDate]`

---

# 6.5 GamePlayer

```ts
interface GamePlayer {
  id: string; // recommended `${gameId}:${playerId}`
  gameId: string;
  playerId: string;

  status: GamePlayerStatus;

  minimumRequiredPlays: number;

  activatedAtPlayNumber?: number;
  deactivatedAtPlayNumber?: number;

  statusReason?: string;

  createdAt: string;
  updatedAt: string;
}
```

Rules:

- create one `GamePlayer` per rostered player included in game setup;
- snapshot `minimumRequiredPlays` at game creation/start;
- changing the team default later must not mutate historical games;
- an injured player keeps their prior participation;
- a late player may move to `active` during the game;
- transitions should be validated and recorded in `GameEvent`.

Suggested ID:

```ts
`${gameId}:${playerId}`
```

Indexes:

- `id`
- `gameId`
- `playerId`
- `[gameId+status]`

---

# 6.6 LineupPreset

Presets belong to the team and may be reused between games.

```ts
interface LineupPreset {
  id: string;
  teamId: string;
  name: string;
  type: PresetType;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

Examples:

- Offense
- Defense
- Kickoff
- Kick Return

Indexes:

- `id`
- `teamId`
- `[teamId+sortOrder]`

---

# 6.7 LineupPresetMember

```ts
interface LineupPresetMember {
  id: string; // `${presetId}:${playerId}`
  presetId: string;
  playerId: string;
}
```

Rules:

- do not automatically remove a player from a preset merely because they are absent in one game;
- when applying a preset, include only currently eligible/active players;
- if expected player count is not met after filtering, show selected count normally.

Indexes:

- `id`
- `presetId`
- `playerId`

---

# 6.8 CurrentLineupMember

The current lineup must be persisted explicitly so a reload resumes exactly where the user left off.

```ts
interface CurrentLineupMember {
  id: string; // `${gameId}:${playerId}`
  gameId: string;
  playerId: string;
  selectedAt: string;
}
```

Rules:

- one record per currently selected player;
- lineup persists after `Record Play`;
- `Clear` removes all records for that game;
- applying a preset replaces the current lineup inside one transaction.

Indexes:

- `id`
- `gameId`
- `playerId`

---

# 6.9 Play

```ts
interface Play {
  id: string;
  gameId: string;

  playNumber: number;
  quarter: number;

  occurredAt: string;

  countsForMpr: boolean;
  playCategory?: "scrimmage" | "special_teams" | "pat" | "other";
  nonCountingReason?: string;

  recordedPlayerCount: number;
  expectedPlayerCount: number;
  playerCountOverrideConfirmed: boolean;

  voided: boolean;
  voidedAt?: string;
  voidReason?: string;

  createdAt: string;
  updatedAt: string;

  revision: number;
}
```

Rules:

- `(gameId, playNumber)` must be unique for active/non-voided sequencing.
- `recordedPlayerCount` is captured at creation.
- `expectedPlayerCount` is snapshotted from the game.
- `playerCountOverrideConfirmed` is true when user records a play with the wrong number of selected players.
- `voided` preserves undo history.
- quarter is snapshotted onto each play.

Indexes:

- `id`
- `gameId`
- `[gameId+playNumber]`
- `[gameId+quarter]`
- `[gameId+voided]`

---

# 6.10 PlayParticipant

```ts
interface PlayParticipant {
  id: string; // `${playId}:${playerId}`
  playId: string;
  gameId: string;
  playerId: string;
}
```

`gameId` is duplicated intentionally to simplify game-scoped queries.

Rules:

- one record per selected player at the moment the play is recorded;
- historical participation is not affected if a player's later game status changes.

Indexes:

- `id`
- `playId`
- `gameId`
- `playerId`
- `[gameId+playerId]`

---

# 6.11 GameEvent

```ts
interface GameEvent {
  id: string;
  gameId: string;
  type: EventType;

  quarter?: number;
  playNumber?: number;

  actor?: "local_user" | "system";

  entityType?: "game" | "player" | "play" | "lineup" | "roster";
  entityId?: string;

  message?: string;

  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;

  createdAt: string;
}
```

Purpose:

- audit trail;
- quarter boundaries;
- player status changes;
- corrections;
- undo/restore;
- optional user notes.

Do not use `GameEvent` as the primary source for counts. It is an audit/event stream, while `Play` and `PlayParticipant` are the source of participation truth.

Indexes:

- `id`
- `gameId`
- `[gameId+createdAt]`
- `[gameId+type]`

---

# 6.12 AppSettings

Singleton record.

```ts
interface AppSettings {
  id: "app";
  schemaVersion: number;
  lastActiveGameId?: string;
  onboardingCompleted: boolean;
  keepScreenAwakeEnabled: boolean;
  preferredPlayerSort: "jersey" | "name" | "risk";
  createdAt: string;
  updatedAt: string;
}
```

`lastActiveGameId` is used for fast crash/reload recovery.

---

# 6.13 ImportRecord

Recommended for troubleshooting.

```ts
interface ImportRecord {
  id: string;
  kind: "roster_csv" | "roster_text" | "backup_json";
  fileName?: string;
  teamId?: string;
  rowsDetected?: number;
  rowsImported?: number;
  warnings?: string[];
  createdAt: string;
}
```

---

# 7. IndexedDB / Dexie Schema

Recommended Dexie definition:

```ts
db.version(1).stores({
  teams: "id, name, updatedAt",
  players: "id, teamId, [teamId+jerseyNumber], [teamId+activeOnTeam]",
  teamSettings: "teamId",

  games: "id, teamId, status, gameDate, [teamId+gameDate]",
  gamePlayers: "id, gameId, playerId, [gameId+status]",

  lineupPresets: "id, teamId, [teamId+sortOrder]",
  lineupPresetMembers: "id, presetId, playerId",

  currentLineupMembers: "id, gameId, playerId",

  plays: "id, gameId, [gameId+playNumber], [gameId+quarter], [gameId+voided]",
  playParticipants: "id, playId, gameId, playerId, [gameId+playerId]",

  gameEvents: "id, gameId, [gameId+createdAt], [gameId+type]",

  appSettings: "id",
  importRecords: "id, kind, teamId, createdAt"
});
```

---

# 8. Required Transaction Boundaries

Critical domain operations must use IndexedDB transactions.

# 8.1 Record Play Transaction

A `recordPlay()` operation must atomically:

1. read current game;
2. read current lineup;
3. validate game is active;
4. validate selected players;
5. create `Play`;
6. create all `PlayParticipant` rows;
7. create `GameEvent(type="play_recorded")`;
8. increment `Game.nextPlayNumber`;
9. update `Game.updatedAt` and `revision`;
10. preserve `CurrentLineupMember` records unchanged.

All steps must succeed or all must roll back.

---

# 8.2 Undo Last Play Transaction

`undoLastPlay()` must atomically:

1. resolve last non-voided play;
2. mark `Play.voided = true`;
3. set `voidedAt`;
4. create `play_voided` event;
5. recompute `Game.nextPlayNumber`.

Recommended next play rule:

```ts
nextPlayNumber = max(nonVoidedPlayNumbers, 0) + 1
```

If play 20 is undone after play 21 exists, do not automatically renumber history. For MVP, restrict one-tap Undo to the most recent play. Historical corrections use edit/correction flow.

---

# 8.3 Apply Preset Transaction

1. remove all `CurrentLineupMember` rows for game;
2. resolve preset members;
3. filter out unavailable game players;
4. add valid selected players;
5. create `lineup_preset_applied` event.

---

# 8.4 End Quarter Transaction

1. validate game active;
2. create `quarter_ended` event containing snapshot metadata;
3. increment `currentQuarter` unless final quarter;
4. update game;
5. preserve current lineup.

Suggested snapshot metadata:

```ts
{
  endedQuarter: 1,
  nextQuarter: 2,
  playCountThroughQuarter: 18,
  playerCounts: {
    "<playerId>": 6
  }
}
```

The snapshot is for reconciliation only. Current totals remain derived from plays.

---

# 8.5 Player Status Change Transaction

1. update `GamePlayer.status`;
2. set activation/deactivation play number if applicable;
3. remove player from `CurrentLineupMember` if now unavailable;
4. create `player_status_changed` event;
5. persist reason if supplied.

---

# 9. Domain Queries / Selectors

The UI should use domain selector functions rather than duplicating business logic.

Required selectors:

```ts
getTeamRoster(teamId)
getGame(gameId)
getGamePlayers(gameId)
getCurrentLineup(gameId)
getRecordedPlays(gameId)
getGameEvents(gameId)
getPlayerMprCount(gameId, playerId)
getAllPlayerMprCounts(gameId)
getPlayerRemainingPlays(gameId, playerId)
getPlayerRiskLevel(gameId, playerId)
getPlayersAtRisk(gameId)
getLastRecordedPlay(gameId)
getQuarterSnapshots(gameId)
getGameSummary(gameId)
```

---

# 10. MPR Count Definition

For a given player:

```text
MPR count =
number of PlayParticipant rows
where:
  Play.gameId == current game
  PlayParticipant.playerId == player
  Play.voided == false
  Play.countsForMpr == true
```

A play with a wrong field count still counts if the user explicitly confirmed and `countsForMpr === true`.

---

# 11. Remaining Plays

```ts
remaining = Math.max(
  gamePlayer.minimumRequiredPlays - mprCount,
  0
);
```

If player status is `injured`, `absent`, `exempt`, or `ineligible`, risk should return `excluded`.

For `late`, risk remains `excluded` until activated.

---

# 12. Risk Engine Inputs

The risk engine should be implemented as a pure function.

Suggested interface:

```ts
interface RiskInput {
  requiredPlays: number;
  completedPlays: number;

  currentQuarter: number;
  deadlineQuarter: number;

  totalGamePlaysSoFar: number;
  playsByQuarter: Record<number, number>;

  playerEligible: boolean;
}
```

Output:

```ts
interface RiskResult {
  level: MprRiskLevel;
  remaining: number;
  reason: string;
  projectedOpportunitiesRemaining?: number;
}
```

---

# 13. MVP Risk Algorithm

The goal is not exact game prediction. It is an early-warning heuristic.

## 13.1 Met

If:

```ts
completedPlays >= requiredPlays
```

then:

```ts
level = "met"
```

---

## 13.2 Excluded

If the player is not currently MPR-eligible:

```ts
level = "excluded"
```

---

## 13.3 Estimate remaining opportunities

Calculate average qualifying play volume per completed quarter where possible.

Fallback if Q1 is still in progress:

```text
estimated total qualifying game plays =
max(totalGamePlaysSoFar * 4 / fractionOfGameElapsed, conservativeFloor)
```

Implementation may use a simpler quarter-based approximation for MVP:

- During Q1: estimate 12 remaining qualifying plays before end Q2, 24 before end Q4.
- During later quarters: use actual average plays per completed quarter.

Prefer false-positive warnings over warnings that arrive too late.

---

## 13.4 Critical

Critical if either:

- current quarter is at or beyond configured deadline and player remains short;
- remaining requirement is >= estimated realistic opportunities remaining;
- the player would need to participate in approximately 80%+ of estimated remaining qualifying plays.

---

## 13.5 At Risk

At Risk if:

- player is below the expected progress toward the requirement for the elapsed portion of the deadline;
- or player would need to participate in approximately 50%+ of remaining qualifying plays.

---

## 13.6 Needs Plays

Any eligible player below the requirement who is not `at_risk` or `critical`.

---

# 14. Sorting Rules

Default player list sort should remain stable to support rapid visual scanning.

Recommended default:

1. numeric jersey number ascending where parseable;
2. nonnumeric jersey number lexical;
3. display name.

Do not automatically reorder the live roster by risk, because moving rows during a game can cause mis-taps.

Instead:

- highlight risk inline;
- show an at-risk banner at top;
- optionally provide a user-selected risk sort mode.

---

# 15. Import Model

# 15.1 Roster Text Import

Input examples:

```text
12 Jack Smith
18 Max Jones
42 Ben Clark
```

Also support:

```text
12,Jack Smith
18,Max Jones
42,Ben Clark
```

Parsing pipeline:

1. split lines;
2. trim whitespace;
3. ignore blank lines;
4. detect delimiter;
5. identify jersey token;
6. identify remaining text as name;
7. flag ambiguous rows;
8. show review screen;
9. create only after explicit confirmation.

Never directly write unreviewed parser output to the roster.

---

# 15.2 CSV Import

Supported headers should include common aliases:

Jersey:

- `number`
- `#`
- `jersey`
- `jersey_number`
- `jersey number`

Name:

- `name`
- `player`
- `player_name`
- `player name`

Also optionally:

- `first_name`
- `last_name`

---

# 15.3 Backup JSON Export Schema

Do not directly dump Dexie internal data without versioning.

Top-level:

```ts
interface BackupFileV1 {
  format: "mpr-tracker-backup";
  version: 1;
  exportedAt: string;
  appVersion: string;

  teams: Team[];
  players: Player[];
  teamSettings: TeamSettings[];
  games: Game[];
  gamePlayers: GamePlayer[];
  lineupPresets: LineupPreset[];
  lineupPresetMembers: LineupPresetMember[];
  currentLineupMembers: CurrentLineupMember[];
  plays: Play[];
  playParticipants: PlayParticipant[];
  gameEvents: GameEvent[];
}
```

Validate:

- `format`;
- supported version;
- referential integrity;
- IDs;
- duplicate conflicts.

Import should present a summary before committing.

---

# 16. CSV Game Export

Recommended columns:

```text
Game Date
Opponent
Quarter
Play Number
Counts For MPR
Voided
Player Jersey
Player Name
Player Status
```

A separate summary CSV may contain:

```text
Jersey
Player
MPR Plays
Minimum Required
Remaining
Final Status
```

---

# 17. Referential Integrity Rules

The domain layer must enforce:

- `Player.teamId` exists.
- `Game.teamId` exists.
- `GamePlayer.gameId` and `playerId` exist.
- a `GamePlayer.playerId` should normally belong to the same team as the game.
- `LineupPreset.teamId` exists.
- `LineupPresetMember.playerId` belongs to the preset team.
- `CurrentLineupMember.playerId` has a `GamePlayer` record.
- `Play.gameId` exists.
- `PlayParticipant.playId` exists.
- `PlayParticipant.playerId` has a `GamePlayer` for that game.

---

# 18. Validation Rules

## Team

- team name required.

## Player

- jersey required;
- display name required;
- duplicate jersey warning.

## Game

- required plays >= 0;
- expected players on field >= 1;
- current quarter >= 1;
- next play number >= 1.

## GamePlayer

- minimum required >= 0.

## Play

- must belong to an active game;
- play number must equal game's current `nextPlayNumber` for normal recording;
- quarter must equal game's current quarter;
- participant count may differ from expected only with explicit confirmation.

---

# 19. Delete / Archive Rules

Prefer soft deletion or archive for reusable data.

- Team with games: archive only.
- Player with historical games: set `activeOnTeam = false`.
- Draft game with no plays: may hard-delete.
- Active/completed game: do not hard-delete from normal UI.
- Recorded play: void rather than delete.

---

# 20. Crash Recovery

On application startup:

1. load `AppSettings.lastActiveGameId`;
2. verify game exists and `status === "active"`;
3. if yes, offer or automatically resume active game;
4. load persisted current lineup;
5. load current quarter and next play number;
6. derive MPR counts from persisted plays.

Do not rely on transient React state for recovery.

---

# 21. Multi-Tab Safety

MVP should guard against two browser tabs editing the same game.

Recommended:

- use `BroadcastChannel` where available;
- publish active game lock heartbeat;
- warn if another tab appears to have the same active game open;
- do not attempt full multi-writer synchronization in MVP.

Optional fallback:

- localStorage lock with expiration.

---

# 22. Wake Lock Data Behavior

Screen Wake Lock is runtime behavior, not persistent game data.

Persist only user preference:

```ts
keepScreenAwakeEnabled: boolean
```

If browser denies wake lock, game tracking must continue normally.

---

# 23. Time Handling

Store timestamps as UTC ISO strings:

```text
2026-10-04T23:42:10.123Z
```

Store game date separately as local calendar date:

```text
2026-10-04
```

Do not infer game date later from UTC timestamps.

---

# 24. Schema Migration Strategy

Every IndexedDB schema change requires:

1. new Dexie version;
2. explicit migration;
3. test fixture from previous schema;
4. migration test;
5. no destructive migration without export safeguard.

Example:

```ts
db.version(2)
  .stores({
    // revised indexes
  })
  .upgrade(async tx => {
    // transform data
  });
```

---

# 25. Seed / Development Fixtures

Create fixtures for:

## Team A

- 18 players
- jersey numbers 1–18
- presets: offense, defense, kickoff

## Game A

- 8 minimum plays
- 11 on field
- Q2
- 23 plays recorded
- two players at risk
- one injured player
- one absent player

## Game B

- completed game
- one non-counting play
- one voided play
- one player late arrival

These fixtures should power unit tests and Storybook/component scenarios if used.

---

# 26. Required Persistence Tests

At minimum:

1. create team and roster;
2. create game from team roster;
3. active game resumes after database re-open;
4. record play with 11 participants;
5. record confirmed play with 10 participants;
6. lineup persists after record;
7. clear lineup persists;
8. undo marks play voided;
9. MPR count ignores voided plays;
10. MPR count ignores non-counting plays;
11. player injury preserves previous counts;
12. injured player removed from current lineup;
13. late player activation works;
14. quarter event persists;
15. export/import round trip preserves all domain data;
16. migration from prior schema succeeds;
17. duplicate roster warning detected;
18. preset filters unavailable players;
19. current lineup restored after reload;
20. transaction rollback leaves no partial play if participant write fails.

---

# 27. Definition of Done

The data layer is complete when:

- all entities above are implemented;
- Dexie schema exists with indexes;
- all critical operations use transactions;
- all derived selectors have unit tests;
- game recovery after reload works;
- no live-game operation requires network access;
- export/import is versioned;
- audit events are generated for required actions;
- migration tests exist;
- all required persistence tests pass.

