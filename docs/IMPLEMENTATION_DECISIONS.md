# Implementation Decisions

Deviations from `MPR-PRD.md`, `01_DATA_MODEL.md`, `02_SCREEN_FLOW.md` and `03_IMPLEMENTATION_TASKS.md`.

## 1. Risk level during the deadline quarter
- **Original:** `01 §13.4` — a player is *critical* whenever the current quarter is at or past the deadline and they are still short.
- **Choice:** In the deadline quarter itself, a short player is at least **at risk**. They become **critical** only if the remaining-opportunity rules apply (needs ≥ 80% of the estimated remaining plays, or more than remain). Once the deadline has passed (e.g. overtime, or Q3 with a Q2 deadline), every short player is critical.
- **Reason:** Under the literal rule, every short player turned critical at the start of Q4. In testing, 13 players at 7/8 showed CRITICAL with a full quarter left, so the tier no longer pointed at the players who actually needed help.
- **Impact:** Every short player is still flagged in the deadline quarter, so nobody slips through. Critical is kept for players who are actually in trouble. The thresholds are in `DEFAULT_RISK_CONFIG` (`src/domain/services/riskEngine.ts`).

## 2. Boolean compound indexes
- **Original:** Dexie schema includes `[teamId+activeOnTeam]` and `[gameId+voided]`.
- **Choice:** Kept in the schema for parity, but never queried. Filtering on those fields happens in memory.
- **Reason:** IndexedDB cannot index boolean values, so records are silently left out of those indexes.
- **Impact:** None at the expected data sizes.

## 3. Command file grouping
- **Original:** One file per command (`createTeam.ts`, `createPlayer.ts`, …).
- **Choice:** Closely related commands share a file. For example, `createTeam.ts` also holds `updateTeam`, `archiveTeam` and `updateTeamSettings`, and `undoLastPlay.ts` also holds `voidPlay` and `restorePlay`. Presets are in `presets.ts`.
- **Impact:** Organization only.

## 4. Overtime
- **Original:** End-quarter increments "unless final quarter".
- **Choice:** Ending Q4 advances to `OT` (quarter 5), and the End Game confirmation opens automatically. Plays in OT are recorded normally.
- **Reason:** Ending Q4 should not leave the game in an ambiguous state, and some games do go to overtime.

## 5. `late` status mid-game
- Players cannot be moved *to* `late` once a game is live. `late` is a pregame designation, and a late player is activated with the Activate button. All other transitions are allowed and audited.

## 6. Record menu
- **Choice:** The `⋯ MORE` control next to RECORD PLAY offers:
  - **Non-counting play…**, with the reason picker from `02 §29`.
  - Quick **Special teams**, **PAT** and **Accepted penalty** entries, which count or don't count according to the game's counting-rule toggles.
- **Reason:** This makes the per-game counting rules from setup actually affect recording.

## 7. Undo restore
- After an undo, the toast offers **RESTORE**. A voided play can also be restored from Play Detail, unless its play number has been reused by a newer play (`PLAY_NUMBER_CONFLICT`).

## 8. Completed games are read-only
- Corrections are only allowed while a game is active (the "simplest safe approach" in `03 §21`). Reopening a completed game is not implemented.

## 9. Backup import conflict policy
- Only **Replace local data** is offered, as `03 §23` recommends. The user is prompted to export current data first. Team files (`mpr-tracker-team` v1) are a separate format for roster transfer. They always import as a new team or as reviewed rows, with fresh IDs, so they never conflict.

## 10. Cold-start resume
- On the first render after a reload or app launch, if a game is active, Home navigates straight to the live game. Later visits to Home show the Resume card instead.

## 11. AppSettings field
- Added `defaultExpectedPlayersOnField` to `AppSettings`. It backs the Settings screen item "Default expected players on field" (`02 §44`) and is used as the default for new teams.
