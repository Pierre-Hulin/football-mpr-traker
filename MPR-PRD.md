# Minimum Play Tracker PWA

## Product Requirements Document

### 1. Product Summary

Minimum Play Tracker is a lightweight, offline-first Progressive Web App for tracking minimum-play requirements during youth football games.

The product is designed for the parent, volunteer, coach, or designated MPR counter who is handed responsibility for tracking participation shortly before or during a game.

The core product promise is:

**Give me the roster and I can accurately track every player's participation within seconds, even with no cellular connection.**

The application should prioritize sideline speed, accuracy, visibility, and recovery from mistakes over broader team-management functionality.

The MVP does not require user accounts, a hosted database, or a native iOS application.

---

# 2. Problem

Minimum-play tracking is commonly performed manually using paper forms, spreadsheets, or ad hoc notes.

During a game, the counter must simultaneously:

* Identify which players are on the field.
* Record every qualifying play.
* Ensure the correct number of players is being counted.
* Track each player's cumulative participation.
* Identify players who are falling behind their required minimum.
* Account for absences, injuries, late arrivals, and other exceptions.
* Track quarter boundaries.
* Correct mistakes.
* Produce a defensible participation record after the game.

The process becomes especially difficult because the counter is operating under time pressure while substitutions and plays happen quickly.

Existing workflows create substantial opportunities for missed plays, incorrect counts, and players unintentionally failing to satisfy minimum-play rules.

---

# 3. Goals

The product should:

1. Allow a game to be set up in under one minute when a roster is already available.
2. Allow the current lineup to be recorded with minimal interaction.
3. Make it obvious whether exactly the expected number of players is selected.
4. Track qualifying plays for every player automatically.
5. Show at all times who still needs additional plays.
6. Proactively identify players at risk of missing their minimum.
7. Support quarter-level reconciliation.
8. Allow mistakes to be corrected immediately.
9. Continue functioning completely offline.
10. Preserve an auditable game record.
11. Allow results and rosters to be exported or transferred without requiring a cloud account.

---

# 4. Non-Goals for MVP

The MVP is not intended to be:

* A full team-management platform.
* A coaching playbook application.
* A scheduling application.
* A scorekeeping system.
* A parent communication platform.
* A league registration system.
* A season statistics platform.
* A depth-chart management system.
* A live cloud collaboration platform.

These capabilities may be evaluated later if actual usage demonstrates demand.

---

# 5. Primary User

### MPR Counter

A volunteer responsible for recording player participation during a football game.

Typical characteristics:

* May have little or no training.
* May receive the responsibility minutes before kickoff.
* May be unfamiliar with every player.
* Is often standing on the sideline.
* May be using the application in bright sunlight.
* May have unreliable cellular service.
* Needs to operate primarily with one hand.
* Cannot spend significant time navigating menus during live play.

The application should therefore require very little explanation.

---

# 6. Core Product Principles

### Sideline speed over feature completeness

Routine actions should require as few taps as possible.

### Offline first

Recording a play must never depend on network connectivity.

### Preserve state between plays

The application should assume that most players remain on the field between consecutive plays.

### Exceptional actions should create friction; normal actions should not

Recording an 11-player lineup should happen immediately.

Recording an abnormal lineup should require confirmation.

### Make risk visible before it becomes a problem

The product should help the counter prevent an MPR violation rather than merely report one afterward.

### Never silently destroy history

Corrections should be auditable whenever practical.

---

# 7. Team and Roster Management

## 7.1 Create Team

The user can create a team containing:

* Team name
* Optional season
* Optional default MPR rules

---

## 7.2 Add Players Manually

Each player requires:

* Jersey number
* Player name

Optional future fields may include:

* Position
* Notes

---

## 7.3 Import Roster

The user should be able to create a roster from an existing list.

MVP import methods:

* Paste text
* CSV upload
* JSON import

The importer should attempt to identify:

* Jersey number
* Player name

The user must review and confirm the parsed roster before saving it.

Future enhancement:

* Photograph or upload a printed roster and extract names/numbers automatically.

---

# 8. Game Setup

When starting a game, the user selects a team and configures game-specific information.

Required:

* Opponent or game label
* Minimum required plays
* Number of players expected on the field, default 11
* Active roster

Optional:

* Date
* Minimum-play deadline
* Whether special-teams plays count
* Whether PAT plays count
* League/rule preset

The minimum requirement should be captured at game start and preserved for the game.

Rules should be configurable rather than assuming one universal MPR standard.

---

# 9. Player Game Status

Each rostered player must have a game-specific status.

Supported statuses:

* Active
* Absent
* Late
* Injured
* Exempt / Ineligible

### Active

Included in participation tracking and MPR calculations.

### Absent

Removed from the active game roster.

### Late

Can be activated after the game has started while preserving the time/play at which the player entered.

### Injured

Preserves plays already completed but removes the player from future MPR warnings.

### Exempt / Ineligible

Excluded from MPR calculations while remaining in the game's record.

Status changes should be timestamped or associated with the current play number.

---

# 10. Game Tracking Screen

The primary game screen should combine the dashboard and play-recording workflow.

There should not be a separate screen required to record each play.

---

# 11. Game Header

The top of the screen should remain visible and prominently show:

* Current quarter
* Next play number
* Number of players currently selected
* Expected players on field

Example:

**Q2 · NEXT PLAY 34 · 11 / 11 ON FIELD**

Player-count state should be visually obvious.

Recommended states:

* Correct count: normal/positive state
* Too few players: warning state
* Too many players: error state

---

# 12. Player List

Players are displayed vertically.

Each player row should show:

* Jersey number
* Player name
* Plays completed
* Minimum required
* Remaining plays
* MPR/risk status
* IN / OUT toggle

Example:

**#12 Jack Smith · 8/8 · MPR MET · IN**

**#18 Max Jones · 4/8 · NEEDS 4 · OUT**

Large touch targets are required.

---

# 13. Lineup Selection

Players should be toggled between:

* IN
* OUT

For the first play, all players may initially be OUT unless a lineup preset is selected.

After a play is recorded, the lineup should **remain selected**.

The application should not reset everyone to OUT after every play.

Rationale:

Football lineups often remain substantially unchanged across consecutive plays. Persisting the previous lineup means the counter only needs to record substitutions.

Example:

Play 15:
11 players selected.

Record Play.

Play 16:
No substitutions.

User simply presses Record Play again.

If one substitution occurs:

* Toggle departing player OUT.
* Toggle replacement player IN.
* Record Play.

---

# 14. Record Play

A large, fixed button at the bottom of the screen should read:

**RECORD PLAY**

The button should remain reachable without scrolling.

When pressed:

1. Capture the current play number.
2. Capture the current quarter.
3. Capture timestamp.
4. Capture every player marked IN.
5. Record whether the play counts toward MPR.
6. Increment qualifying play totals.
7. Advance the play number.
8. Preserve the selected lineup.
9. Persist the play locally immediately.

---

# 15. Player Count Validation

Before recording, the application compares:

**selected players vs. expected players on field**

Example expected value:

11

If exactly 11 players are selected:

* Record immediately.
* No confirmation dialog.

If the number differs:

Example:

**Only 10 players are marked IN. Record this play anyway?**

Actions:

* Cancel
* Record Anyway

The abnormal player count must be preserved in the audit trail.

The expected player count must be configurable because some leagues use formats such as 6v6, 7v7, or 8v8.

---

# 16. Plays That Do Not Count Toward MPR

The system must distinguish between:

* Play occurred and counts toward MPR.
* Play occurred but does not count toward MPR.

Examples may vary by league and could include:

* Accepted penalties
* Kneel-downs
* Spikes
* PAT attempts
* Certain special-teams plays

League rules must not be hard-coded globally.

Possible interaction:

**RECORD PLAY**

plus secondary option:

**Record as non-counting**

Alternatively, a just-recorded play can immediately be changed to non-counting.

The event should still remain in the game history.

---

# 17. Undo and Correction

Mistakes are expected during live game tracking.

Immediately after recording:

**✓ Play 34 recorded · Undo**

Undo should be available prominently for the most recent play.

Users should also be able to inspect the play log and correct:

* Players included
* Whether the play counts
* Quarter
* Incorrect play record

Corrections should ideally preserve an audit trail rather than silently modifying historical data.

---

# 18. Quarter Tracking

The game screen should provide quick actions:

* End Q1
* End Q2
* End Q3
* End Q4

At each quarter boundary, the application should save a snapshot containing:

* Current play number
* Each player's qualifying play count
* Player status
* Quarter end timestamp

This supports quarter-level reconciliation.

After marking a quarter complete, the application advances to the next quarter.

---

# 19. MPR Status

Every active player should clearly show progress toward the game's minimum.

Example:

**4 / 8 · NEEDS 4**

Once satisfied:

**8 / 8 · ✓ MPR MET**

Counts above the minimum should continue increasing.

Example:

**13 / 8 · ✓ MPR MET**

---

# 20. Risk Detection

Simply ranking players by number of plays is insufficient.

The application should identify whether a player is at risk of failing the requirement before the configured deadline.

Suggested states:

### Needs Plays

Player is below the minimum but currently within a reasonable pace.

### At Risk

Player is behind the participation pace required to satisfy the minimum by the deadline.

### Critical

The player has very little remaining opportunity to complete the requirement and may need to remain on the field continuously.

### MPR Met

Minimum requirement has been satisfied.

Example:

**#18 Max Jones · 4/8 · NEEDS 4 · ⚠ AT RISK**

The screen should surface at-risk players prominently.

Example warning banner:

**⚠ 2 PLAYERS AT RISK**

**#18 needs 4 · #42 needs 3**

---

# 21. Risk Algorithm

The initial algorithm can use:

* Current quarter
* Current play number
* Average plays per quarter
* Minimum required
* Player plays completed
* Configured MPR deadline

The algorithm does not need to predict the exact number of remaining plays.

Its objective is to warn the user early enough to intervene.

Risk logic should be configurable and improved based on real-world usage.

---

# 22. Lineup Presets

To reduce interaction during games, users should be able to create preset groups such as:

* Offense
* Defense
* Kickoff
* Kick return
* Punt
* Punt return

Selecting a preset loads the associated players as IN.

The user can then make substitutions before recording the play.

Example controls:

**OFFENSE | DEFENSE | ST | CLEAR**

Presets are an important MVP usability feature because they dramatically reduce lineup-entry effort.

---

# 23. Clear Field

A **Clear** control should mark all players OUT.

It should not happen automatically after a recorded play.

---

# 24. Game History

Users should be able to review a chronological play/event log.

Example:

**Play 31 · Q2 · 11 players · Counts**

**Play 32 · Q2 · 11 players · Counts**

**Play 33 · Q2 · 10 players · Counts ⚠**

**Play 34 · Q2 · Penalty · Does not count**

**End Q2**

Selecting a play reveals the participating players.

---

# 25. Game Completion

At the end of the game, the application should present a summary.

For every player:

* Jersey number
* Name
* Total qualifying plays
* Minimum required
* MPR satisfied: Yes/No
* Status / exception

Example:

| #  | Player     | Plays | Required | Status  |
| -- | ---------- | ----: | -------: | ------- |
| 12 | Jack Smith |    17 |        8 | ✓ Met   |
| 18 | Max Jones  |     9 |        8 | ✓ Met   |
| 42 | Ben Clark  |     6 |        8 | ⚠ Short |
| 54 | Sam Lee    |     4 |        8 | Injured |

Quarter-level counts should also be available.

---

# 26. Export

Because the MVP does not use a hosted database, export should be prominent.

## Roster Export

Supported format:

* CSV
* JSON

Allows the roster to be transferred to another device or reused.

## Game Export

Supported formats:

* CSV
* JSON
* Printable report

A future version may generate PDF directly.

The exported game should include:

* Game information
* Player roster
* Player status
* Minimum requirements
* Every recorded play
* Quarter markers
* Corrections
* Final MPR totals

---

# 27. Import / Device Transfer

Users should be able to import previously exported:

* Teams
* Rosters
* Games

Future enhancement:

Use the device's native Share functionality to transfer a roster/game file to another parent or counter.

---

# 28. Offline-First Architecture

The MVP should be implemented as a Progressive Web App.

No native iOS application is required.

No hosted database is required.

Architecture:

```text
PWA
 |
 ├── Static HTML / CSS / JavaScript
 |
 ├── Service Worker
 |     └── Offline application cache
 |
 └── IndexedDB
       ├── Teams
       ├── Players
       ├── Games
       ├── Game Players
       ├── Plays
       ├── Play Players
       └── Events
```

The application may be hosted as static files using a service such as Cloudflare Pages.

---

# 29. Local Data Model

Suggested entities:

## Team

* id
* name
* season
* createdAt

## Player

* id
* teamId
* jerseyNumber
* name
* active

## Game

* id
* teamId
* opponent
* date
* requiredPlays
* expectedPlayersOnField
* mprDeadline
* currentQuarter
* nextPlayNumber
* status

## GamePlayer

* gameId
* playerId
* gameStatus
* minimumRequired
* activatedAtPlay
* deactivatedAtPlay

## Play

* id
* gameId
* playNumber
* quarter
* timestamp
* countsForMPR
* recordedPlayerCount
* corrected

## PlayPlayer

* playId
* playerId

## Event

* id
* gameId
* type
* playNumber
* quarter
* timestamp
* metadata

Event types may include:

* QUARTER_END
* PLAYER_INJURED
* PLAYER_ACTIVATED
* PLAY_UNDONE
* PLAY_CORRECTED
* GAME_COMPLETED

---

# 30. Persistence Requirements

Every meaningful action must be written to IndexedDB immediately.

In particular, pressing **Record Play** should never depend on:

* Internet connectivity
* Server response
* Authentication
* Background synchronization

The critical transaction is:

```text
Record Play
     ↓
Save locally
     ↓
Update totals
     ↓
Advance play
     ↓
Ready for next snap
```

This should feel instantaneous.

---

# 31. PWA Requirements

The application should include:

* Web App Manifest
* Home Screen icon
* Standalone display mode
* Service worker
* Offline application shell
* Offline data access
* Cached static assets
* Automatic recovery after reload
* Responsive layout
* iPhone/iPad compatibility
* Android compatibility

The game screen should return to the current active game after an accidental reload or browser restart.

---

# 32. Sideline UX Requirements

The UI should assume:

* Bright sunlight
* Potential rain
* One-handed operation
* Frequent glances rather than prolonged attention
* High stress
* Rapid interaction

Requirements:

* Large touch targets
* High contrast
* Large jersey numbers
* Minimal text
* No hover-dependent interactions
* No essential gesture-only controls
* Important information visible without scrolling
* Record Play button permanently accessible
* Selected-player count permanently visible

A screen-wake strategy should be investigated so the device does not continually lock during the game.

---

# 33. Error Recovery

The application must survive:

* App reload
* PWA being backgrounded
* Loss of cellular service
* Temporary device sleep
* Accidental browser closure

After reopening, the user should return to:

* Current game
* Current quarter
* Next play number
* Current selected lineup
* Existing MPR totals

No recorded play should disappear because connectivity was lost.

---

# 34. Cloud Services

Cloud infrastructure is explicitly not required for the MVP.

The initial application should require:

* No account
* No login
* No server API
* No hosted database

A future cloud layer could provide optional:

* Backup
* Cross-device synchronization
* Team sharing
* Coach-created rosters
* QR-code roster sharing
* Real-time second-counter mode
* Season history

Even with cloud synchronization, IndexedDB should remain the primary live-game database so recording a play never relies on network connectivity.

---

# 35. Future Opportunities

Potential post-MVP enhancements include:

### Roster Capture From Photo

Photograph a printed roster and automatically extract:

* Jersey numbers
* Names

### QR Roster Sharing

Coach creates roster once.

MPR counter scans QR code.

Roster appears immediately.

### Dual-Counter Mode

Two counters can independently or collaboratively track participation.

### Live Coach Dashboard

Coach can see players approaching an MPR deficit.

### League Rule Templates

Preset rules by league/organization.

### Season History

Store games and participation history across the season.

### Cloud Backup

Optional account-based synchronization.

These should not delay the MVP.

---

# 36. MVP Scope

The first production version should include:

### Setup

* Create team
* Manual roster entry
* Paste/import roster
* Configure minimum required plays
* Configure expected players on field
* Mark absent/inactive players

### Live Game

* Current quarter
* Current/next play number
* Vertical player list
* IN/OUT toggles
* Persistent lineup between plays
* Selected player counter
* Record Play
* Wrong-player-count confirmation
* Non-counting play support
* Undo last play
* Player MPR totals
* Remaining plays
* MPR Met indicator
* At Risk / Critical indicators
* End-quarter shortcuts
* Offense/Defense/Special Teams presets
* Clear lineup

### Data

* IndexedDB
* Immediate local persistence
* Full offline operation
* Crash/reload recovery

### Postgame

* Game summary
* Quarter totals
* Export CSV
* Export/import JSON
* Printable MPR record

### PWA

* Installable
* Service worker
* Offline cache
* Responsive mobile UI
* iOS Home Screen support

---

# 37. MVP Success Criteria

The MVP is successful if a first-time user can:

1. Import or enter a roster in less than two minutes.
2. Start a game without creating an account.
3. Record a normal play with one tap once the lineup is established.
4. Record substitutions with only the required lineup changes plus one Record Play tap.
5. Immediately see who has and has not met MPR.
6. Receive useful warning before a player is likely to miss the requirement.
7. Correct an incorrectly recorded play within seconds.
8. Complete an entire game in airplane mode.
9. Reload the PWA without losing game state.
10. Produce a clear participation record after the game.

---

# 38. Product Positioning

The product should remain deliberately narrow.

It is not:

**“A youth football management platform.”**

It is:

**“The fastest and safest way to handle minimum-play duty on the sideline.”**

The desired first-time experience is:

**Someone hands me MPR duty unexpectedly. I open the app, load the roster, and I am ready before the next play.**