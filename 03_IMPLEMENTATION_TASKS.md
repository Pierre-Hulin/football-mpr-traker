# Minimum Play Tracker PWA — Implementation Plan & Task Breakdown

**Document:** `03_IMPLEMENTATION_TASKS.md`  
**Status:** Coding-agent execution plan  
**Goal:** Enable an autonomous coding agent to build the entire MVP  
**Deployment target:** Static PWA hosting, preferably Cloudflare Pages  
**Backend:** None  
**Primary persistence:** IndexedDB

---

# 1. Implementation Assumptions

Unless an existing repository dictates otherwise, use the following stack.

## Core

- React
- TypeScript
- Vite

## Local database

- Dexie.js

## PWA

- `vite-plugin-pwa`
- Workbox through the plugin

## Routing

- React Router

## Forms / validation

Either:

- React Hook Form + Zod

or, if the agent prefers fewer dependencies:

- controlled React forms + Zod

Use Zod for:

- import validation;
- backup schema validation;
- domain command validation.

## Testing

- Vitest
- React Testing Library
- fake-indexeddb
- Playwright for end-to-end tests

## Styling

Prefer plain CSS/CSS modules or a lightweight tokenized CSS system.

Do not introduce a heavy design framework unless the repository already uses one.

---

# 2. Architectural Principles

The implementation must be organized around four layers:

```text
UI
↓
Domain services / commands
↓
Repository / IndexedDB access
↓
IndexedDB
```

Do not allow React components to directly mutate Dexie tables.

All business actions should use explicit domain commands such as:

```ts
createTeam()
importRoster()
createGame()
startGame()
setPlayerGameStatus()
setCurrentLineup()
applyPreset()
recordPlay()
undoLastPlay()
endQuarter()
correctPlay()
completeGame()
exportGame()
```

Derived UI values should come from selectors.

---

# 3. Recommended Project Structure

```text
src/
  app/
    App.tsx
    router.tsx
    providers.tsx

  components/
    Button/
    Modal/
    BottomSheet/
    Toast/
    PlayerRow/
    RiskBadge/
    SelectedCount/
    PresetBar/
    EmptyState/
    ErrorBoundary/

  db/
    db.ts
    schema.ts
    migrations.ts
    repositories/
      teamRepository.ts
      playerRepository.ts
      gameRepository.ts
      playRepository.ts
      eventRepository.ts
      presetRepository.ts

  domain/
    models.ts
    enums.ts
    errors.ts
    validation.ts

    commands/
      createTeam.ts
      createPlayer.ts
      importRoster.ts
      createGame.ts
      startGame.ts
      updateGamePlayerStatus.ts
      setCurrentLineup.ts
      applyLineupPreset.ts
      clearLineup.ts
      recordPlay.ts
      undoLastPlay.ts
      correctPlay.ts
      endQuarter.ts
      completeGame.ts

    selectors/
      getGameState.ts
      getMprCounts.ts
      getRisk.ts
      getGameSummary.ts

    services/
      riskEngine.ts
      importParser.ts
      exportService.ts
      backupService.ts
      wakeLockService.ts
      activeGameLockService.ts

  hooks/
    useActiveGame.ts
    useCurrentLineup.ts
    useGamePlayers.ts
    useMprCounts.ts
    useRisk.ts
    useWakeLock.ts
    useInstallPrompt.ts

  pages/
    HomePage.tsx
    TeamsPage.tsx
    TeamDetailPage.tsx
    RosterPage.tsx
    RosterImportPage.tsx
    PresetsPage.tsx
    PresetEditPage.tsx
    NewGamePage.tsx
    GameSetupPage.tsx
    LiveGamePage.tsx
    PlayHistoryPage.tsx
    PlayDetailPage.tsx
    GameSummaryPage.tsx
    SettingsPage.tsx

  pwa/
    registerSW.ts

  utils/
    ids.ts
    dates.ts
    sort.ts
    csv.ts
    fileDownload.ts

  styles/
    tokens.css
    globals.css
    live-game.css

tests/
  unit/
  integration/
  e2e/

public/
  icons/
  manifest-assets/
```

---

# 4. Milestone 0 — Repository Bootstrap

## Tasks

- Initialize Vite React TypeScript project.
- Configure strict TypeScript.
- Add ESLint.
- Add Prettier if desired.
- Install dependencies.
- Configure absolute aliases if used.
- Add Vitest.
- Add React Testing Library.
- Add Playwright.
- Add `fake-indexeddb`.
- Add PWA plugin.
- Add baseline manifest.
- Add global CSS tokens.
- Add CI script.

## Required npm scripts

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "lint": "eslint ."
}
```

## Acceptance criteria

- `npm run build` passes.
- `npm test` passes.
- dev server launches.
- PWA manifest is emitted.

---

# 5. Milestone 1 — Domain Types and IndexedDB

Implement `01_DATA_MODEL.md` exactly unless a documented reason requires deviation.

## Tasks

### Models

Create:

- enums;
- interfaces;
- domain error types;
- validation schemas.

### Dexie database

Implement:

- database class;
- version 1 schema;
- table typings;
- singleton DB instance.

### Repositories

Create repository methods for:

- teams;
- players;
- team settings;
- games;
- game players;
- presets;
- current lineup;
- plays;
- participants;
- events;
- app settings.

Repositories expose CRUD/query primitives only.

Business logic belongs in commands/services.

### App settings bootstrap

On first load:

- ensure singleton app settings record exists;
- set `schemaVersion`;
- initialize defaults.

## Tests

- database opens;
- table definitions exist;
- basic create/read/update operations work;
- IndexedDB can be closed/reopened while retaining data.

## Acceptance criteria

- all entities persist;
- no UI component directly accesses Dexie tables;
- fake-indexeddb test suite passes.

---

# 6. Milestone 2 — Core Domain Commands

Implement commands independent of UI.

## 6.1 Team commands

- `createTeam`
- `updateTeam`
- `archiveTeam`

Validation:

- nonempty name.

---

## 6.2 Player commands

- `createPlayer`
- `updatePlayer`
- `deactivatePlayer`
- `activatePlayer`

Duplicate jersey handling:

- detection method;
- warning returned to UI;
- explicit override parameter.

---

## 6.3 Game creation

`createGame(input)`

Responsibilities:

- create draft Game;
- snapshot team defaults;
- create one GamePlayer record per included roster member;
- snapshot minimum required plays;
- initialize quarter 1;
- initialize play 1.

---

## 6.4 Start game

`startGame(gameId)`

Responsibilities:

- validate draft state;
- ensure valid active roster;
- set status active;
- set startedAt;
- create `game_started`;
- write `lastActiveGameId`.

---

## 6.5 Game-player status

`updateGamePlayerStatus()`

Responsibilities:

- validate transition;
- update GamePlayer;
- remove from lineup if unavailable;
- create event.

---

## 6.6 Lineup commands

- `togglePlayerInLineup`
- `replaceCurrentLineup`
- `clearCurrentLineup`
- `applyLineupPreset`

All must persist immediately.

---

## 6.7 Record play

Implement as one transaction.

Input:

```ts
interface RecordPlayInput {
  gameId: string;
  countsForMpr: boolean;
  playCategory?: string;
  nonCountingReason?: string;
  confirmWrongPlayerCount?: boolean;
}
```

Behavior:

- resolve current lineup;
- compare count;
- if count mismatch and no confirmation:
  throw/return `PLAYER_COUNT_CONFIRMATION_REQUIRED`;
- create Play;
- create participants;
- create event;
- increment next play;
- preserve lineup.

---

## 6.8 Undo

`undoLastPlay(gameId)`

Only latest non-voided play is eligible for one-tap undo.

---

## 6.9 End quarter

`endQuarter(gameId)`

- calculate current snapshot metadata;
- create event;
- increment quarter;
- preserve lineup.

---

## 6.10 Correct play

`correctPlay(playId, changes)`

Support:

- participant changes;
- counting flag;
- reason;
- category.

Create audit event with before/after.

---

## 6.11 Complete game

`completeGame(gameId)`

- summarize unmet players;
- update status;
- completedAt;
- event;
- clear active-game pointer.

## Tests

Every command must have unit/integration tests before UI wiring.

---

# 7. Milestone 3 — Derived Selectors and Risk Engine

## MPR selectors

Implement and test:

- counts per player;
- remaining plays;
- met/not met;
- quarter totals;
- active/excluded status;
- game summary.

## Risk engine

Create pure service:

```ts
evaluatePlayerRisk(input): RiskResult
```

Requirements:

- deterministic;
- no database access;
- no UI dependencies.

Implement MVP heuristic from data-model spec.

## Test scenarios

At minimum:

- already met;
- excluded;
- Q1 low participation but not critical;
- Q3 behind pace;
- deadline quarter and still short;
- late activation;
- injured player excluded;
- no plays recorded;
- unusual short game.

## Acceptance criteria

- selector outputs update correctly after play record/undo/correction;
- risk tests explicitly cover boundary cases.

---

# 8. Milestone 4 — Base Application Shell

## Tasks

- React Router routes.
- shared app shell.
- error boundary.
- global toast system.
- modal/bottom-sheet primitive.
- button variants.
- loading states.
- empty-state component.
- safe-area CSS.
- responsive container.

## Accessibility

- keyboard navigation;
- focus trapping;
- ARIA labels;
- reduced-motion considerations.

## Acceptance criteria

- all route placeholders render;
- app is usable at phone widths;
- no horizontal scrolling at 320px width.

---

# 9. Milestone 5 — Team and Roster UI

Implement:

- Teams page.
- Create team flow.
- Team detail.
- Roster page.
- Add player.
- Edit player.
- deactivate/reactivate player.

## Roster import

Implement:

### Paste parser

Handle:

```text
12 Jack Smith
12,Jack Smith
12 - Jack Smith
```

Parser should return:

```ts
{
  validRows,
  warningRows,
  invalidRows
}
```

### CSV

Use local file reading.

No server upload.

### Review screen

Allow inline correction before import.

### Import transaction

Create all accepted players.

## Tests

- parser formats;
- blank rows;
- duplicate jersey;
- missing fields;
- CSV header aliases;
- import rollback on DB failure.

---

# 10. Milestone 6 — Lineup Presets

Implement:

- preset list;
- add/edit/delete preset;
- roster selection;
- sort order;
- standard preset types;
- custom names.

During preset application:

- unavailable game players filtered;
- toast reports selected count.

Tests:

- preset with absent player;
- preset with injured player;
- preset count under/over expected.

---

# 11. Milestone 7 — Game Setup

Implement game wizard.

## Step A

Team selection.

## Step B

Rules:

- opponent;
- date defaults to today;
- required plays;
- expected players;
- deadline quarter;
- counting toggles.

## Step C

Availability:

- Active
- Absent
- Late
- Injured
- Exempt
- Ineligible

## Step D

Review and Start.

Validation:

- expected field count >= 1;
- minimum >= 0;
- warn if active player count < expected;
- prevent zero eligible roster start.

Tests:

- creates correct GamePlayer snapshots;
- changing team defaults later does not affect existing draft game.

---

# 12. Milestone 8 — Live Game Screen Foundation

Implement the full structural layout:

- sticky header;
- selected count;
- quarter;
- next play;
- risk banner;
- preset toolbar;
- player list;
- pinned record section.

Player rows must show:

- jersey;
- name;
- completed/required;
- remaining;
- risk status;
- IN/OUT.

Unavailable players:

- disabled field toggle;
- explicit status.

## Performance

Roster sizes are small, but render updates should still avoid unnecessary full-app rerenders.

Use memoized selectors/hooks where sensible.

---

# 13. Milestone 9 — Live Lineup Interaction

Implement:

- IN/OUT toggles;
- entire lineup persisted on each change;
- Clear;
- Apply preset;
- selected count state;
- reload recovery.

Acceptance tests:

- select 11;
- reload page;
- selected 11 still present;
- record play;
- lineup still present;
- change one OUT/one IN;
- selected count stays 11.

---

# 14. Milestone 10 — Record Play UX

Implement main action.

## Correct count

One-tap record.

After success:

- next play increments;
- MPR totals update;
- lineup remains;
- toast shows Undo.

## Wrong count

Open confirmation modal.

Cancel:

- nothing written.

Record Anyway:

- writes play with override flag.

## Persistence failure

If transaction fails:

- do not update play number;
- show blocking error;
- allow retry.

## Optional feedback

Use `navigator.vibrate()` where supported, but do not depend on it.

---

# 15. Milestone 11 — Non-Counting Plays

Implement explicit secondary flow.

Required reasons:

- Accepted penalty
- Kneel / spike
- PAT
- League rule
- Other

Record play with:

```ts
countsForMpr = false
```

Behavior:

- play number advances;
- participants recorded;
- MPR totals unchanged;
- history shows reason.

Tests required.

---

# 16. Milestone 12 — Undo and Historical Corrections

## Undo toast

After recording:

- Undo action available 6–8 seconds.

## Undo logic

- mark latest play voided;
- update next play;
- recalc counts.

## History correction

Implement:

- participant editor;
- counting/non-counting;
- reason;
- save confirmation.

Audit event required.

Tests:

- undo;
- restore if supported;
- correction adds participant;
- correction removes participant;
- MPR count updates;
- quarter total updates.

---

# 17. Milestone 13 — Player Status During Game

Implement player bottom sheet.

Actions based on current status:

- Mark injured
- Mark absent
- Mark exempt
- Activate late player
- Reactivate if allowed
- Add note optional

Effects:

- preserve past plays;
- remove unavailable player from lineup;
- risk recalculates immediately.

Tests:

- injured selected player removed;
- injured player count preserved;
- late activation works;
- exempt player excluded from risk.

---

# 18. Milestone 14 — Quarter Management

Implement quarter action sheet.

End quarter:

- show current play;
- show number below minimum;
- confirm;
- create snapshot event;
- advance quarter;
- preserve lineup.

Quarter breakdown screen:

- Q1/Q2/Q3/Q4 totals;
- overall total.

Tests:

- quarter event;
- quarter play grouping;
- no data loss on transition.

---

# 19. Milestone 15 — MPR Risk UX

Implement:

- risk badges;
- top banner;
- critical prominence;
- MPR summary page.

Do not reorder live roster automatically.

Acceptance criteria:

- met player clear;
- needs-play player clear;
- at-risk player obvious;
- critical player impossible to overlook;
- excluded players never show false risk.

---

# 20. Milestone 16 — Play History

Implement:

- chronological/reverse chronological list;
- counting status;
- participant count warning;
- voided appearance;
- quarter;
- timestamp.

Play detail:

- participants;
- counting status;
- correction controls;
- audit history relevant to play.

---

# 21. Milestone 17 — Complete Game and Summary

Implement End Game flow.

Pre-end summary:

- number of active players;
- number met;
- number short;
- list short players.

After completion:

- summary page;
- quarter totals;
- final player statuses;
- history links.

Completed games become read-only by default, but historical correction can remain available behind an explicit Edit Game action if desired.

For MVP, simplest safe approach:

- completed games are read-only;
- allow reopening only through `Edit completed game` confirmation if implemented.

---

# 22. Milestone 18 — Export

## Summary CSV

Create downloadable local file.

Columns:

- jersey;
- name;
- total qualifying plays;
- minimum;
- remaining;
- status.

## Full play CSV

Each participant row references play.

## JSON backup

Implement versioned format from data-model spec.

## Printable report

Add dedicated print stylesheet.

Use Web Share API if available.

Fallback:

- Blob;
- object URL;
- download link.

Tests:

- content generated;
- version present;
- special characters escaped;
- CSV quotes handled correctly.

---

# 23. Milestone 19 — Import Backup

Implement backup import:

1. select JSON;
2. validate Zod schema;
3. validate `format`;
4. validate supported version;
5. detect ID conflicts;
6. preview counts;
7. confirm;
8. import in transaction.

Conflict policy for MVP:

Offer:

- Cancel
- Replace local data completely

Avoid complex merges initially.

Require export suggestion before replacement.

---

# 24. Milestone 20 — PWA and Offline Mode

## Manifest

Include:

- name;
- short_name;
- start_url;
- standalone display;
- icons;
- theme/background colors.

## Service worker

Cache:

- HTML/app shell;
- JS;
- CSS;
- icons;
- fonts if local.

No API cache needed.

## Offline test

After first online load:

1. install/open app;
2. enable airplane mode;
3. fully close app;
4. reopen;
5. resume game;
6. record plays;
7. end quarter;
8. complete game;
9. export.

All must work.

---

# 25. Milestone 21 — PWA Update Safety

Do not auto-refresh on new service worker while game active.

Implement:

- detect waiting worker;
- if active game:
  defer prompt;
- otherwise:
  show Update Available.

After game completion:

prompt to update.

Test service worker update manually.

---

# 26. Milestone 22 — Wake Lock

Implement Wake Lock API integration.

On active game screen:

if preference enabled:

```ts
navigator.wakeLock.request("screen")
```

Reacquire after visibility changes as required.

Failure:

- log;
- optionally show one-time nonblocking notice.

Do not make wake lock a requirement for game operation.

---

# 27. Milestone 23 — Active Game Recovery

On app startup:

- inspect `lastActiveGameId`;
- verify active status;
- if active:
  Home shows Resume;
- if route is `/` and product decision favors immediate recovery, optionally auto-navigate.

Test:

- reload live route;
- browser close/reopen;
- app background/foreground;
- service worker restart.

---

# 28. Milestone 24 — Multi-Tab Guard

Implement best-effort single-writer protection.

Recommended:

`BroadcastChannel("mpr-active-game")`

Messages:

```ts
{
  type: "ACTIVE_GAME_HEARTBEAT",
  gameId,
  tabId,
  timestamp
}
```

If second tab detects same active game:

```text
This game is already open in another tab.

Recording from two tabs can cause mistakes.

[ VIEW READ-ONLY ]
[ TAKE OVER ]
```

MVP may simply block second writer rather than support read-only.

---

# 29. Milestone 25 — Accessibility Pass

Audit:

- labels;
- focus;
- modal behavior;
- contrast;
- touch size;
- dynamic text;
- screen-reader announcements.

Required ARIA live announcements:

- Play recorded
- Play undone
- Quarter ended
- Lineup preset loaded
- Storage failure

---

# 30. Milestone 26 — Responsive / Device Testing

Required viewport testing:

- 320 × 568
- 375 × 667
- 390 × 844
- 430 × 932
- tablet portrait
- desktop

Required browsers where practical:

- iOS Safari / installed PWA
- Android Chrome
- desktop Chrome
- desktop Edge

Verify:

- safe area;
- fixed Record button;
- no keyboard overlap in forms;
- scrolling roster;
- date controls;
- PWA install behavior.

---

# 31. Milestone 27 — Error Handling

Create domain error classes/codes:

```text
DB_UNAVAILABLE
DB_WRITE_FAILED
GAME_NOT_ACTIVE
GAME_ALREADY_ACTIVE
PLAYER_COUNT_CONFIRMATION_REQUIRED
INVALID_PLAYER_STATUS_TRANSITION
PLAY_NOT_FOUND
NO_PLAY_TO_UNDO
IMPORT_INVALID
BACKUP_VERSION_UNSUPPORTED
```

UI must map these to clear user-facing messages.

Never silently swallow DB failures.

---

# 32. Milestone 28 — Test Suite Requirements

## Unit tests

- parser;
- validators;
- risk engine;
- selectors;
- sorting;
- CSV;
- backup schema.

## Integration tests

Using fake IndexedDB:

- create team/game;
- start game;
- lineup;
- record;
- undo;
- non-counting play;
- status changes;
- end quarter;
- complete game;
- export/import.

## E2E tests

Required Playwright flows:

### E2E 1 — First game

- create team;
- paste roster;
- start game;
- select 11;
- record 3 plays;
- verify counts.

### E2E 2 — Persistence

- set lineup;
- reload;
- verify lineup;
- record play.

### E2E 3 — Wrong count

- select 10;
- record;
- warning appears;
- cancel;
- add 11th;
- record.

### E2E 4 — Override

- select 10;
- record anyway;
- history shows warning.

### E2E 5 — Non-counting

- record non-counting;
- play advances;
- totals do not.

### E2E 6 — Injury

- player has 3 plays;
- mark injured;
- remains at 3;
- removed from warnings/lineup.

### E2E 7 — Quarter

- end Q1;
- Q2 shown;
- lineup preserved.

### E2E 8 — Undo

- record play;
- undo;
- counts revert.

### E2E 9 — Complete

- end game;
- summary shown;
- export available.

### E2E 10 — Offline

Use browser context offline after initial load and complete core actions.

---

# 33. Milestone 29 — Performance and Reliability

Targets:

- live toggle perceived response under 100 ms;
- play record commit normally under 150 ms;
- no network wait;
- route transition under 200 ms on normal phone;
- reload restores active state correctly.

No optimization should compromise transaction safety.

---

# 34. Milestone 30 — Deployment

Preferred: Cloudflare Pages.

Build command:

```text
npm run build
```

Output:

```text
dist
```

Configure SPA fallback.

Ensure service worker scope includes whole app.

HTTPS is required for PWA functionality outside localhost.

---

# 35. Milestone 31 — Release Checklist

Before MVP release:

## Data

- schema tested;
- migration path tested;
- backup export tested;
- replacement import tested.

## Live game

- correct count;
- wrong count;
- non-counting;
- undo;
- correction;
- injury;
- late activation;
- quarter transitions;
- end game.

## Offline

- airplane mode full-game test.

## PWA

- installable;
- icon;
- standalone;
- reload safe;
- service-worker update safe.

## Device

- iPhone test;
- Android test if available;
- bright-light visual check;
- one-handed interaction check.

## Accessibility

- labels;
- focus;
- contrast;
- no color-only status.

---

# 36. Suggested Commit Sequence

A coding agent should keep commits scoped and reversible.

Recommended sequence:

1. `chore: bootstrap react typescript pwa`
2. `feat: add indexeddb schema and repositories`
3. `feat: add domain commands and selectors`
4. `feat: add roster management`
5. `feat: add roster import`
6. `feat: add lineup presets`
7. `feat: add game setup`
8. `feat: add live game layout`
9. `feat: persist current lineup`
10. `feat: record plays and validate field count`
11. `feat: add non-counting plays`
12. `feat: add undo and corrections`
13. `feat: add player game statuses`
14. `feat: add quarter tracking`
15. `feat: add mpr risk engine`
16. `feat: add play history`
17. `feat: add game summary`
18. `feat: add export and backup import`
19. `feat: complete offline pwa behavior`
20. `feat: add wake lock and active-game recovery`
21. `test: add full game e2e coverage`
22. `fix: harden mobile and accessibility behavior`

---

# 37. Autonomous Agent Rules

The coding agent should follow these rules during implementation.

## Do not ask for clarification when:

- a behavior is already specified in the PRD, data model, or screen flow;
- a reasonable implementation detail can be chosen without changing product behavior;
- a browser API has a graceful fallback.

## Prefer conservative behavior when uncertain.

Examples:

- never delete historical records silently;
- never record a play if DB persistence fails;
- never auto-refresh during an active game;
- never assume network access;
- never remove MPR history because player status changes.

## Document deviations

If implementation must deviate from the specification, add:

```text
docs/IMPLEMENTATION_DECISIONS.md
```

For each deviation record:

- original requirement;
- implementation choice;
- reason;
- impact.

---

# 38. Definition of MVP Complete

The project is complete when a user can, entirely offline after initial installation:

1. create a team;
2. add or import a roster;
3. create lineup presets;
4. start a game;
5. mark absences;
6. select or load 11 players;
7. record a play;
8. preserve that lineup;
9. make substitutions;
10. detect wrong selected counts;
11. override wrong counts deliberately;
12. record non-counting plays;
13. undo the last play;
14. correct historical plays;
15. mark injuries/late arrivals/exemptions;
16. end quarters;
17. see MPR progress and risk;
18. finish the game;
19. review final participation;
20. export the result;
21. close and reopen the app without losing game state.

Additionally:

- automated unit/integration/E2E tests pass;
- the app installs as a PWA;
- no hosted backend is required;
- the app remains functional in airplane mode;
- active-game service-worker updates do not interrupt the user.

