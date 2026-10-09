# Implementation Decisions

Deviations from `MPR-PRD.md`, `01_DATA_MODEL.md`, `02_SCREEN_FLOW.md` and `03_IMPLEMENTATION_TASKS.md`.

## 1. Risk level during the deadline quarter
- **Original:** `01 §13.4` — a player is *critical* whenever the current quarter is at or past the deadline and they are still short.
- **Choice:** In the deadline quarter itself, a short player is at least **at risk**. They become **critical** only if the remaining-opportunity rules apply (needs ≥ 80% of the estimated remaining plays, or more than remain). Once the deadline has passed (e.g. overtime, or Q3 with a Q2 deadline), every short player is critical.
- **Reason:** Under the literal rule, every short player turned critical at the start of Q4. In testing, 13 players at 7/8 showed CRITICAL with a full quarter left, so the tier no longer pointed at the players who actually needed help.
- **Impact:** Every short player is still flagged in the deadline quarter, so nobody slips through. Critical is kept for players who are actually in trouble. The thresholds are in `DEFAULT_RISK_CONFIG` (`src/domain/services/riskEngine.ts`).

## 2. Boolean fields are not indexed
- **Original:** Dexie schema includes `[teamId+activeOnTeam]` on `players` and `[gameId+voided]` on `plays`.
- **Choice:** Both index declarations were removed from the v1 schema. The fields `Player.activeOnTeam` and `Play.voided` are unchanged, but they are intentionally not indexed. Queries load by `teamId` or `gameId` and filter on these fields in memory.
- **Reason:** IndexedDB cannot use boolean values as index keys, so records are silently left out of such indexes and the indexes could never be used. The v1 schema was changed directly, with no migration, because the app had not been deployed and no IndexedDB data exists in production.
- **Impact:** None at the expected data sizes. A roster holds tens of players and a game around a hundred plays.

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

## 12. Pregame status selection: detented scrubber + bottom-sheet fallback
- **Original:** `02 §18` called for a status selector on each row. It was built first as a native `<select>`, then as a pill that opens a bottom sheet (two taps per change).
- **Choice:** Each row has a horizontal, detented **status scrubber** (`src/components/StatusScrubber`). A single drag-and-release moves through ACTIVE → ABSENT → LATE → INJURED → EXEMPT → INELIGIBLE. It does not wrap: the ‹ or › arrow disappears at either end.
  - **Tap** (no drag), or tapping the name, still opens the bottom-sheet picker, so first-time and accessible use don't depend on the gesture.
  - **Arrow keys** step through the statuses for keyboard users.
  - "Reset all to Active", the exception summary and search are unchanged.
- **Gesture thresholds:**
  - The control uses `touch-action: pan-y`, so the browser keeps ownership of vertical scrolling. A vertical pan fires `pointercancel`, which reverts any preview.
  - **Horizontal mode engages** only after 10px of horizontal travel that is at least 1.5× the vertical travel, i.e. within about 34° of horizontal.
  - **The gesture is abandoned for good** once the finger moves 10px vertically while the movement is mostly vertical.
  - **Each detent** is 28px of finger travel (Active → Ineligible is about 150px), with 0.15-step hysteresis so a value doesn't flicker at a boundary.
  - **Release commits** the previewed status; the click after a drag is suppressed so the sheet doesn't also open.
- **Feedback:**
  - Because the thumb covers the control, a floating preview above it shows the current status and the whole six-status track while dragging.
  - The control scales up slightly and recolours live.
  - Each detent triggers an 8ms `navigator.vibrate` where supported (Android). iOS Safari has no vibration API, so iOS gets visual feedback only.
- **Scope:** The scrubber is used only before kickoff. During a game, status changes keep the confirming, audited player sheet on the Manage players page.
- **Rejected:** A free-scrolling carousel (imprecise, no clear detents) and a whole-row swipe (conflicts with scrolling and with tapping the row).

## 13. Restore lineup after Clear
- **Data:** `Game.clearedLineup?: { playerIds, clearedAt, beforePlayNumber }`. This field is optional and not indexed, so no Dexie version bump or migration is needed. Backup validation accepts it.
- **Created:** By Clear, but only when the lineup is non-empty. Clearing an already-empty lineup keeps the existing snapshot, so a double tap can't wipe it.
- **Offered:** As a `↺ RESTORE n` chip at the start of the lineup action bar, visible only while a snapshot exists. The Clear toast's UNDO uses the same command. Restoring replaces the current selection with exactly the snapshot, skipping any player who has since become unavailable, and is logged as a `lineup_restored` event.
- **Retired when:**
  - it is restored;
  - a play is recorded (so the snapshot can never be older than the current snap);
  - a preset is applied (that is a deliberate new lineup);
  - the game is completed or abandoned.
- **Kept through:** Manual toggles, quarter changes, navigation, backgrounding and reload. The common accident is "cleared, then started tapping, then noticed", and the snapshot is still from the same snap.
- **Known limit:** A second Clear of a non-empty lineup replaces the snapshot. Restore always means "the lineup immediately before the most recent Clear".

## 14. Grid ("bingo card") live view
- **Choice:** The grid is a responsive `auto-fill` grid with 62px minimum tiles: 4 columns at 320px, 5 at 375–390px and 6 at 430px. Each tile shows:
  - the jersey number, as the dominant element;
  - the plays/required count;
  - IN as a solid fill plus a ✓;
  - risk as a coloured border plus a corner `!` or `⚠`;
  - unavailable players as a dashed, hatched tile with a short status (ABS, INJ, EXMPT, INEL), and late players as a dashed amber tile with LATE.

  Names appear only in the tile's accessible name. Tapping an available tile toggles IN/OUT. Tapping a late or unavailable tile opens the player sheet (activate or reactivate).
- **Switch:** A small GRID/LIST button sits next to CLEAR. It is saved as `AppSettings.liveRosterView`, can also be set in Settings, and defaults to `list` for existing users.
- **Impact:** Both views render the same persisted lineup and the same optimistic toggle queue, so switching views never changes lineup state.

## 15. In-game roster management
- **Choice:** A new **Manage players** page (`/games/:id/players`), first item in the game menu. Every game player is listed with their status pill, plays and an "IN now" marker. Tapping a player opens the existing audited player sheet, which explains each change's effect and takes an optional note.
- **Also reachable from:** Tapping a player's name in List view, tapping a late or unavailable tile in Grid view, and the link under the grid.
- **Impact:** Uses the existing `updateGamePlayerStatus` transitions (all audited, recorded plays never touched, unavailable players removed from the lineup automatically). Nothing is deleted from the game.

## 16. Live screen: All / Focus, red Record Play, status line, Undo chip
- **All / Focus:** A segmented control sits in a fixed row above the roster, so it stays reachable even when Focus is empty. It applies to both Grid and List.
  - **Focus shows** players in the next-play lineup, plus field-eligible players whose risk level is not `met` or `excluded`. This is `isFocusRelevant`, built only on the existing `fieldEligible` and `risk` values.
  - **Pure presentation:** jersey order is kept, and counts are derived live.
  - **Persistence:** the choice is kept in `sessionStorage` per game, so it survives navigating to Manage players and back. A newly opened game starts in All.
  - **Deviation — sticky tiles:** A player taken OUT while Focus is showing stays visible, shown as OUT, until the next recorded play or a mode switch. If they vanished immediately, every later tile would shift under the user's finger mid-substitution and the next tap could hit the wrong player. It also lets a mis-tap be undone in place. Unavailable players are never kept this way.
- **Record Play:** The button is now #D32F2F with a white label (4.98:1 contrast). Hover is #C62828 and pressed/processing is #B71C1C. Red is used only for this action; the critical-risk crimson (#A3001B) and the selection blue are unchanged.
  - **States:** `RECORDING…` (aria-busy), then `✓ PLAY n RECORDED` on a dark green background for about 1s, or `✕ NOT SAVED` on slate, alongside the existing blocking "Play was NOT saved / TRY AGAIN" dialog.
  - **No optimistic counters:** totals change only after the database transaction commits.
- **Duplicate protection:** In-flight taps are ignored, as before. Taps within 400ms of a successful record are also ignored as accidental double taps; the button is `aria-disabled` during that window. A legitimate next play is never closer than that, and nothing else is delayed.
- **Lineup warning:** Moved out of the button into an amber line above it, shown only when the count is off ("⚠ 10 of 11 players selected"). Wrong-count confirmation is unchanged.
- **Status line:** Line 1 is "n on field" (the next-play lineup). Line 2 is "need plays · met · unavailable", which partitions the roster and always sums to the All count. The two lines are kept visually separate because the lineup overlaps the roster categories.
- **Undo:** The play-recorded toast was removed. The button's success state and the aria-live announcement replace it, and Undo moved to a persistent `↶ UNDO n` chip on the status line. The chip uses the same `undoLastPlay` command, and the "Play n undone · RESTORE" toast is kept. Toasts are positioned above the measured height of the record controls, so they never cover Record Play.
- **Deviation — dark mode:** The app has no dark theme. PRD §32 makes it a light, high-contrast, sunlight-first UI, and building a whole dark theme was outside this change. The new colours were checked for contrast against both light and dark surfaces (`tests/unit/contrast.test.ts`).
