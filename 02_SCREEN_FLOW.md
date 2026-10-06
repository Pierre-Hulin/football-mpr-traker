# Minimum Play Tracker PWA — Screen Flow & UX Specification

**Document:** `02_SCREEN_FLOW.md`  
**Status:** Implementation-ready  
**Audience:** Coding agent / frontend engineer / product designer  
**Primary device:** Smartphone used on football sideline  
**Secondary devices:** Tablet, desktop for roster setup/export  
**Interaction priority:** Fast, low-error, one-handed live-game use

---

# 1. Purpose

This document defines the full screen architecture, navigation, live-game interaction model, edge cases, and visual behavior for the Minimum Play Tracker PWA.

The core UX principle is:

> During a live game, the user should spend almost all their time on one screen.

The user should not need to repeatedly navigate between a dashboard, lineup screen, and play-entry screen.

---

# 2. Information Architecture

Primary application areas:

```text
Home
├── Resume Active Game
├── Teams
│   ├── Team Detail
│   ├── Roster
│   ├── Import Roster
│   └── Lineup Presets
├── New Game
│   ├── Select Team
│   ├── Configure Rules
│   ├── Confirm Availability
│   └── Start Game
├── Live Game
│   ├── Player Lineup + MPR Dashboard
│   ├── Quarter Actions
│   ├── Player Status
│   ├── Play History
│   └── Game Menu
├── Game Summary
│   ├── MPR Summary
│   ├── Quarter Breakdown
│   └── Export
└── Settings
```

---

# 3. Navigation Model

Use simple route-based navigation.

Suggested routes:

```text
/
 /teams
 /teams/:teamId
 /teams/:teamId/roster
 /teams/:teamId/import
 /teams/:teamId/presets
 /games/new
 /games/:gameId/setup
 /games/:gameId/live
 /games/:gameId/history
 /games/:gameId/summary
 /settings
```

Rules:

- if an active game exists, Home must prioritize `Resume Game`;
- Live Game should not display a conventional bottom navigation bar that competes with `Record Play`;
- destructive/navigation-away actions from an active game require confirmation only when they could cause user confusion, not because data would be lost;
- data is persisted continuously, so browser Back is safe.

---

# 4. Global Visual Requirements

## 4.1 Sideline readability

Use:

- high contrast;
- large jersey numbers;
- large touch targets;
- clear selected/unselected states;
- minimal decorative UI;
- minimal secondary text during live game.

Minimum interactive target:

```text
44 × 44 CSS px
```

Prefer larger for primary live-game actions.

---

## 4.2 Color is supplemental

Do not encode MPR state by color alone.

Use text/icon combinations:

- `✓ MET`
- `NEEDS 3`
- `⚠ AT RISK`
- `! CRITICAL`

---

## 4.3 No hover dependence

All functionality must work on touch devices.

Tooltips may enhance desktop use but must never contain required information.

---

## 4.4 Safe areas

Pinned controls must account for:

```css
env(safe-area-inset-bottom)
env(safe-area-inset-top)
```

Especially important on iPhones when installed as a Home Screen PWA.

---

# 5. Home Screen

## Purpose

Get the user into an active or new game immediately.

## Layout

If an active game exists:

### Primary card

```text
GAME IN PROGRESS

Trojans vs Wildcats
Q2 · Next Play 34

[ RESUME GAME ]
```

This must be the dominant control.

Below:

- `New Game`
- `Teams`
- `Past Games`
- `Settings`

If no active game:

```text
Minimum Play Tracker

[ START NEW GAME ]

Teams
Past Games
Import Backup
```

---

# 6. First Launch

Do not force a lengthy onboarding carousel.

Show a lightweight first-run state:

```text
Track minimum plays quickly and offline.

1. Add or import your roster
2. Start a game
3. Mark who's on the field
4. Record each play

[ CREATE TEAM ]
[ IMPORT BACKUP ]
```

Optional tiny note:

`Works offline after first load.`

---

# 7. Teams Screen

List all active teams.

Each team card shows:

- team name;
- season label if present;
- roster count;
- most recent game date if any.

Actions:

- tap team → Team Detail;
- `+ New Team`.

Archived teams appear under a separate collapsed section.

---

# 8. Create Team Screen

Fields:

- Team name — required
- Season — optional

Primary CTA:

`CREATE TEAM`

After creation:

navigate directly to roster setup.

---

# 9. Team Detail Screen

Header:

```text
Trojans
18 players
```

Primary actions:

- `Start Game`
- `Roster`
- `Lineup Presets`
- `Team Defaults`
- `Export Team`

Recent games list below.

---

# 10. Roster Screen

Each row:

```text
#12   Jack Smith
#18   Max Jones
#42   Ben Clark
```

Actions:

- tap row to edit;
- swipe gestures are optional, never required;
- explicit overflow/edit control allowed;
- `+ Add Player`;
- `Import Roster`.

Roster sorting default: jersey number ascending.

---

# 11. Add/Edit Player

Fields:

- Jersey number
- Player name
- optional notes

Save validation:

- required fields;
- warn on duplicate jersey.

Duplicate warning:

```text
#12 is already assigned to Jack Smith.

[ CANCEL ]
[ SAVE ANYWAY ]
```

---

# 12. Import Roster Flow

## Step 1: Choose import method

Options:

- Paste list
- CSV file
- JSON backup

MVP may put JSON backup under Settings instead if simpler.

---

## Step 2A: Paste List

Large textarea with example:

```text
12 Jack Smith
18 Max Jones
42 Ben Clark
```

CTA:

`PARSE ROSTER`

---

## Step 2B: CSV

File picker.

After selecting:

parse locally.

No upload to server.

---

## Step 3: Review Import

Show rows in an editable list:

```text
✓  #12   Jack Smith
✓  #18   Max Jones
!  ?     Ben Clark
```

Warnings:

- missing jersey;
- missing name;
- duplicate jersey;
- duplicate player candidate.

User can edit before import.

CTA:

`IMPORT 18 PLAYERS`

Secondary:

`Cancel`

---

# 13. Lineup Presets Screen

Show existing presets:

- Offense
- Defense
- Kickoff
- Kick Return

Each displays selected count:

```text
Offense
11 players
```

Actions:

- tap to edit;
- `+ New Preset`.

---

# 14. Edit Preset Screen

Header:

`Edit Offense`

Roster list with checkboxes/toggles.

Persistent selected counter:

`11 selected`

Save:

`SAVE PRESET`

If count differs from team default expected field count, allow it. Presets may intentionally represent partial groups.

---

# 15. New Game Flow

The New Game setup should be short enough to complete shortly before kickoff.

Suggested four screens or one compact wizard.

---

# 16. New Game — Select Team

Show existing teams.

Primary:

- tap team.

Secondary:

`+ Create Team`

If only one team exists, preselect it but still allow change.

---

# 17. New Game — Game Details & Rules

Fields:

- Opponent / game label — optional but recommended
- Date — default today
- Minimum required plays — required
- Players on field — default team setting / 11
- MPR deadline — default team setting
- Special teams count — toggle
- PAT counts — toggle
- Accepted-penalty plays count — toggle

Use plain-language helper text.

Example:

```text
Minimum required plays
[ 8 ]

Players on field
[ 11 ]
```

Advanced rule toggles may be collapsed under:

`MPR counting rules`

CTA:

`NEXT: PLAYER AVAILABILITY`

---

# 18. New Game — Player Availability

Show entire roster with game status selector.

Default:

all active team players = `Active`.

Each row:

```text
#12 Jack Smith    ACTIVE
#18 Max Jones     ACTIVE
#42 Ben Clark     ABSENT
```

Fast actions:

- `Mark all active`
- search if roster is large.

Status menu:

- Active
- Absent
- Late
- Injured
- Exempt
- Ineligible

For pregame setup, `Injured` and `Late` are permitted.

CTA:

`REVIEW GAME`

---

# 19. New Game — Review

Show:

```text
Trojans vs Wildcats
18 rostered
16 active
2 absent
Minimum: 8 plays
11 on field
Deadline: End Q4
```

Warnings:

- fewer active players than expected players on field;
- duplicate jersey numbers;
- no active players;
- no presets.

CTA:

`START GAME`

Starting the game:

- sets status active;
- creates game event;
- sets `lastActiveGameId`;
- enters Live Game screen.

---

# 20. Live Game Screen — Core Layout

This is the most important screen in the application.

Structure:

```text
┌─────────────────────────────┐
│ Q2   NEXT PLAY 34   11/11   │  sticky header
├─────────────────────────────┤
│ ⚠ 2 players at risk         │  conditional banner
├─────────────────────────────┤
│ OFFENSE DEFENSE ST CLEAR    │  sticky/near-top quick actions
├─────────────────────────────┤
│ #12 Jack Smith   8/8 ✓  IN  │
│ #18 Max Jones    4/8 ⚠  IN  │
│ #24 Ben Clark    7/8    OUT │
│ ...                         │  scrollable player list
│                             │
├─────────────────────────────┤
│ [ RECORD PLAY ]             │  pinned bottom
└─────────────────────────────┘
```

---

# 21. Live Header

Always visible.

Required information:

### Quarter

`Q1`, `Q2`, etc.

Tapping quarter opens quarter actions.

### Next Play

Show:

`NEXT 34`

Do not label the last recorded play as current. The user needs to know what pressing Record will create.

### Selected player count

Display:

`11 / 11`

States:

- exact count → neutral/positive;
- below count → warning;
- above count → error.

Examples:

```text
10 / 11
12 / 11
```

The user should recognize incorrect count before pressing Record.

---

# 22. Risk Banner

Only show when at-risk or critical players exist.

Examples:

```text
⚠ 2 PLAYERS AT RISK
#18 needs 4 · #42 needs 3
```

If critical:

```text
! CRITICAL: #18 NEEDS 3
```

Tap banner:

- scroll to first at-risk player;
- or open compact risk panel.

Do not make this banner so tall that it reduces roster visibility substantially.

---

# 23. Preset Toolbar

Suggested buttons:

- `OFF`
- `DEF`
- `ST`
- `CLEAR`

If more presets exist:

- horizontal scroll;
- or `MORE`.

On preset tap:

- current lineup becomes preset membership filtered by available game players;
- selected counter updates immediately;
- toast:

`Offense loaded · 11 selected`

No confirmation required.

---

# 24. Player Row Design

Recommended structure:

```text
┌────────────────────────────────────┐
│ #18  Max Jones         [ IN ]      │
│      4 / 8 · NEEDS 4 · ⚠ AT RISK  │
└────────────────────────────────────┘
```

Jersey number should be visually prominent.

Entire row may toggle IN/OUT if that proves faster, but avoid accidental toggles when user is trying to open player detail.

Recommended implementation:

- large explicit `IN / OUT` toggle on right;
- tap name opens player quick actions;
- do not use tiny switches.

Selected state must be visually unmistakable.

---

# 25. Player Status Display

For excluded/unavailable players:

### Absent

```text
#42 Ben Clark
ABSENT
```

Disable field toggle.

### Injured

```text
#54 Sam Lee
4 / 8 · INJURED
```

Preserve count.

### Late

```text
#71 Chris Doe
LATE
[ ACTIVATE ]
```

Once activated, normal IN/OUT control becomes available.

### Exempt

```text
#77 Alex Doe
EXEMPT
```

---

# 26. Player Quick Actions

Tap player name opens bottom sheet:

```text
#18 Max Jones

4 / 8 qualifying plays
Needs 4

[ Mark Injured ]
[ Mark Absent ]
[ Mark Exempt ]
[ Add Note ]
[ Cancel ]
```

For `Late`:

`Activate Player`

Every status change should clearly explain effect:

```text
Mark Max as injured?

His 4 recorded plays will remain.
He will be removed from MPR warnings and the current lineup.

[ CANCEL ]
[ MARK INJURED ]
```

---

# 27. Record Play Button

Pinned at bottom.

Large enough for quick use.

Default label:

`RECORD PLAY`

Optional secondary text above/below:

`11 players selected`

When pressed with correct field count:

- record immediately;
- haptic feedback if available;
- increment next play;
- keep current lineup;
- show undo toast.

No success modal.

---

# 28. Record Play — Wrong Player Count

If selected count does not equal expected:

Modal/bottom sheet:

```text
Record play with 10 players?

Expected: 11
Selected: 10

This play can still be recorded.

[ CANCEL ]
[ RECORD ANYWAY ]
```

For 12:

same behavior.

If user records anyway:

- set override flag;
- preserve actual player count.

---

# 29. Record Non-Counting Play

Avoid forcing a pre-play modal on every snap.

Recommended methods:

### Method A — secondary action

Long-press is not sufficient because it is undiscoverable.

Add a small adjacent menu/control:

`⋯`

Options:

- Record non-counting play
- Record special teams play
- Add game note

### Method B — immediate post-record correction

Undo toast can include:

`Mark non-counting`

Best MVP approach:

Provide an explicit `NON-COUNTING` secondary button inside the Record menu.

When chosen:

```text
Why doesn't this play count?

○ Accepted penalty
○ Kneel / spike
○ PAT
○ League rule
○ Other

[ CANCEL ]
[ RECORD NON-COUNTING ]
```

The lineup remains preserved.

---

# 30. After Recording a Play

Toast/snackbar:

```text
✓ Play 34 recorded        UNDO
```

Duration:

long enough to use comfortably, approximately 6–8 seconds.

If another play is recorded before toast expires, Undo should apply to the most recent play.

Do not stack many toasts.

---

# 31. Undo Last Play

On Undo:

- mark most recent play voided;
- decrement next-play sequence appropriately;
- recompute counts;
- retain lineup as it was before/after the recorded play, which is normally identical because lineup persists;
- show:

`Play 34 undone`

Optional:

`Restore`

---

# 32. Quarter Actions

Tap quarter in header or dedicated quarter control.

Bottom sheet:

```text
Quarter 1

[ END Q1 ]
[ View Q1 summary ]
[ Cancel ]
```

When ending:

confirmation should be lightweight:

```text
End Q1 after Play 18?

16 players active
3 still below minimum

[ CANCEL ]
[ END Q1 ]
```

After confirmation:

- persist snapshot event;
- advance to Q2;
- keep lineup.

Show:

`Q1 ended · Q2 started`

---

# 33. Quarter Reconciliation Screen

Accessible from History or quarter action.

Show table:

```text
Player         Q1   Q2   Q3   Q4   Total
#12 Jack        4    4              8
#18 Max         2    2              4
```

Quarter values are counts of qualifying participation in plays belonging to each quarter.

Also show quarter end play number:

`Q1 ended after Play 18`

---

# 34. Live Game Menu

Top-right menu should provide infrequent actions:

- Game details
- Player statuses
- Play history
- MPR summary
- Export backup
- End game
- Abandon game

Do not put common live actions inside this menu.

---

# 35. Play History Screen

Reverse chronological by default, or chronological with latest visible.

Each row:

```text
Play 34 · Q2
11 players · Counts
```

Warnings:

```text
Play 33 · Q2
10 players · Counts ⚠
```

Non-counting:

```text
Play 32 · Q2
11 players · Does not count
Accepted penalty
```

Voided:

```text
Play 31 · Q2
VOIDED
```

Tap a play for detail.

---

# 36. Play Detail

Show:

- play number;
- quarter;
- timestamp;
- counts / non-counting;
- player count;
- list of participants;
- override warning if count differed;
- correction history.

Actions:

- Edit participants
- Mark counting/non-counting
- Void play
- Restore play if voided

Historical edits require confirmation because they affect MPR totals.

---

# 37. Edit Historical Play

Display roster checklist with original participants selected.

Sticky counter:

`11 / 11 selected`

Save:

`SAVE CORRECTION`

Confirmation:

```text
Update Play 17?

This changes participation totals for 2 players.

[ CANCEL ]
[ SAVE ]
```

Create audit event with before/after values.

Do not renumber plays when editing.

---

# 38. MPR Summary During Game

Accessible from live menu and possibly via risk banner.

Sort:

1. critical;
2. at risk;
3. needs plays;
4. met;
5. excluded.

Example:

```text
CRITICAL
#18 Max Jones       5/8 · Needs 3

AT RISK
#42 Ben Clark       6/8 · Needs 2

NEEDS PLAYS
#24 Sam Doe         7/8 · Needs 1

MET
#12 Jack Smith     11/8 ✓
```

This screen is informational. Avoid making the user leave Live Game for routine tracking.

---

# 39. End Game Flow

From live menu:

`End Game`

Confirmation:

```text
End this game?

52 plays recorded
15 of 16 active players met MPR

#18 Max Jones is short by 1 play.

[ CANCEL ]
[ END GAME ]
```

If all met:

```text
All active players met MPR.
```

Ending:

- set status completed;
- save timestamp;
- clear `lastActiveGameId`;
- navigate to Game Summary.

---

# 40. Game Summary Screen

Header:

```text
Trojans vs Wildcats
Final MPR Summary
52 recorded plays
```

Summary cards:

- Active players: 16
- Met MPR: 15
- Short: 1
- Injured/exempt: 2

Player table/list:

```text
#12 Jack Smith    14 / 8   ✓ MET
#18 Max Jones      7 / 8   SHORT 1
#54 Sam Lee        4 / 8   INJURED
```

Actions:

- `Export Summary`
- `Export Full Game`
- `View Quarter Breakdown`
- `View Play History`
- `Back to Home`

---

# 41. Export UX

## Export Summary

Offer:

- CSV summary
- Printable report

## Export Full Game

Offer:

- JSON backup
- CSV play ledger

Use Web Share API when available:

`Share`

Fallback:

download file.

---

# 42. Printable Report Layout

Report should include:

- team;
- opponent;
- game date;
- minimum requirement;
- expected field count;
- player list;
- qualifying totals;
- quarter totals;
- exceptions/status;
- signature lines optionally.

Print CSS should hide interactive app chrome.

---

# 43. Past Games Screen

Group by team/date.

Each row:

```text
Oct 4, 2026
Trojans vs Wildcats
Completed · 52 plays
```

Tap:

Game Summary.

Draft games should show:

`Draft`

Abandoned:

`Abandoned`

---

# 44. Settings Screen

Settings:

- Keep screen awake during games
- Preferred player sort
- Default expected players on field
- Export all data
- Import backup
- Clear all local data
- App version

Destructive clear:

```text
Delete all local data?

This removes all teams, rosters, and games from this device.
Export a backup first.

[ CANCEL ]
[ DELETE EVERYTHING ]
```

Require explicit typed confirmation only if desired; MVP can use strong destructive confirmation.

---

# 45. Offline UX

Once app shell is cached, no live-game function should visually care whether network exists.

Do not show alarming offline banners during game tracking if everything is functioning.

A subtle settings/status indicator is enough:

`Offline ready`

If the service worker has not yet cached the app:

show on Home:

`Open once while online before relying on offline use.`

---

# 46. PWA Update UX

Do not force-refresh during an active game.

If a new app version is available:

During active game:

```text
Update available.
It will be installed after the game.
```

Outside active game:

```text
Update available.

[ UPDATE NOW ]
```

Never reload the app unexpectedly mid-game.

---

# 47. Screen Wake Lock UX

When game starts and preference enabled:

attempt wake lock.

If permission/browser support fails:

do not interrupt the game.

Optional one-time notice:

`Screen wake lock isn't available on this device.`

---

# 48. Accessibility

Required:

- semantic buttons;
- visible focus state;
- screen-reader labels for IN/OUT;
- sufficient contrast;
- no color-only status;
- support browser text scaling without breaking primary controls;
- all dialogs focus-trapped;
- escape/back closes modal where appropriate;
- `aria-live` region for play-recorded confirmation.

Example accessible toggle label:

`Mark #18 Max Jones in the current lineup`

---

# 49. Responsive Behavior

## Phone

Primary target.

- single-column roster;
- pinned Record button;
- compact header.

## Tablet

- wider player rows;
- optional two-column summary panes;
- live game should still keep one continuous roster list unless usability tests justify columns.

## Desktop

- centered app shell;
- roster/setup can use denser tables;
- live game should retain mobile-like interaction model for consistency.

---

# 50. Empty States

## No teams

`Create a team to begin tracking minimum plays.`

## Team has no players

`Add or import the roster before starting a game.`

## No presets

Do not block game.

Show:

`No lineup presets yet`

Preset buttons may simply be absent.

## No games

`No games recorded yet.`

---

# 51. Error States

## IndexedDB unavailable

Blocking error:

```text
Local storage is unavailable.

This app requires browser storage to safely record a game.
Try leaving Private Browsing or enabling site storage.
```

Do not allow live game to begin.

## Write failure while recording

Blocking alert:

```text
Play was NOT saved.

Do not continue until storage is available.

[ TRY AGAIN ]
```

Never increment visible play number unless transaction succeeds.

---

# 52. Back Navigation During Live Game

Because data is continuously saved, leaving the screen does not lose the game.

If user navigates Home:

show active-game card.

If user attempts `Start New Game` while one is active:

```text
A game is already in progress.

[ RESUME CURRENT GAME ]
[ END / ABANDON CURRENT GAME ]
```

Do not allow two active games accidentally.

---

# 53. Game Status Edge Cases

## Player leaves temporarily

If a player is simply out of the lineup, use OUT, not a status change.

## Player injured

Mark injured. Remove from current lineup automatically.

## Player returns after injury

Allow `Reactivate` with warning and audit event.

## Late player arrives

Activate. Do not retroactively alter earlier plays.

## Wrong jersey number discovered mid-game

Editing reusable player jersey/name should affect display, not historical identity, because player ID is stable.

---

# 54. Interaction Count Goals

After initial lineup is established:

## No substitutions

One tap per play:

`Record Play`

## One substitution

Three taps:

1. outgoing player OUT;
2. incoming player IN;
3. Record Play.

## Apply standard offense/defense switch

Two taps:

1. preset;
2. Record Play.

These interaction budgets should be treated as UX acceptance criteria.

---

# 55. Key User Flows

# Flow A — First-time user with pasted roster

```text
Home
→ Create Team
→ Enter team name
→ Import Roster
→ Paste list
→ Review parsed players
→ Import
→ Start Game
→ Configure minimum/rules
→ Confirm availability
→ Start Game
→ Live Game
```

---

# Flow B — Returning user

```text
Home
→ Start New Game
→ Select Team
→ Confirm rules
→ Mark absent players
→ Start
→ Apply Offense preset
→ Record Play
```

---

# Flow C — Normal live sequence

```text
Live Game
→ Record Play 1
→ lineup preserved
→ Record Play 2
→ toggle one OUT
→ toggle one IN
→ Record Play 3
```

---

# Flow D — Wrong count

```text
Live Game says 10/11
→ Record Play
→ warning
→ Cancel
→ select missing player
→ Record Play
```

or:

```text
→ Record Anyway
```

---

# Flow E — Penalty / non-counting snap

```text
Live Game
→ Record menu
→ Non-counting play
→ choose Accepted penalty
→ Record
→ play number advances
→ player MPR totals unchanged
```

---

# Flow F — Injury

```text
Tap player
→ Mark Injured
→ confirm
→ player removed from lineup
→ MPR warnings exclude player
→ previous participation remains
```

---

# Flow G — Quarter end

```text
Tap Q1
→ End Q1
→ review summary
→ confirm
→ Q2 starts
→ lineup preserved
```

---

# Flow H — Mistake correction

```text
Record Play
→ toast
→ Undo
→ play voided
→ counts revert
→ next play restored
```

Historical:

```text
History
→ Play 17
→ Edit participants
→ Save correction
→ counts recompute
```

---

# Flow I — End game

```text
Game menu
→ End Game
→ review short players
→ confirm
→ Summary
→ Export
```

---

# 56. UX Acceptance Criteria

The live screen is complete when:

- current quarter is always visible;
- next play number is always visible;
- selected/expected count is always visible;
- Record Play is always reachable without scrolling;
- current lineup survives recorded plays and reloads;
- a normal play with correct count records with one tap;
- wrong count requires explicit confirmation;
- at-risk players are obvious without opening another screen;
- absent/injured/exempt players cannot accidentally be selected;
- quarter end takes no more than two deliberate actions;
- Undo last play is accessible immediately;
- all important live interactions work offline;
- no required live-game functionality depends on hover, swipe, or network connectivity.

