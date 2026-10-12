# Minimum Play Tracker

An offline-first PWA for tracking youth-football minimum-play requirements (MPR) from the sideline. It needs no account and no server: all data lives in IndexedDB on the device.

Specs: [MPR-PRD.md](MPR-PRD.md) · [01_DATA_MODEL.md](01_DATA_MODEL.md) · [02_SCREEN_FLOW.md](02_SCREEN_FLOW.md) · [03_IMPLEMENTATION_TASKS.md](03_IMPLEMENTATION_TASKS.md) · [Implementation decisions](docs/IMPLEMENTATION_DECISIONS.md)

## Stack
React 19 · TypeScript · Vite · Dexie (IndexedDB) · vite-plugin-pwa (Workbox) · React Router · Zod · Vitest + fake-indexeddb · Playwright

## Scripts
```bash
npm install
npm run dev        # dev server (service worker disabled in dev)
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build (service worker active)
npm test           # unit + integration tests
npm run test:e2e   # Playwright flows against the production build
npm run lint
node scripts/generate-icons.mjs   # re-render PNG icons from public/favicon.svg
```

## Architecture
```
UI (src/pages, src/components)
 ↓ calls
Domain commands (src/domain/commands)    – every write; Dexie transactions
Selectors / services (src/domain/...)    – pure derivation: MPR counts, risk, summary, CSV, backup
 ↓
Repositories (src/db/repositories) → Dexie (src/db/db.ts) → IndexedDB
```
- Plays and their participants are the source of truth. MPR totals are always derived from them and never stored.
- Undo voids a play instead of deleting it. Corrections write `play_corrected` audit events that record before/after values.
- The current lineup is persisted on every toggle, so a reload resumes exactly where the user left off.
- Service worker updates are never applied during an active game.

## Versioning
Semantic versioning, with `package.json` as the single source of truth. The landing page and Settings show
`v<version> · <commit> · <date>`, so you can tell which build a device is running. Release with
`npm version <major|minor|patch>` and record changes in [CHANGELOG.md](CHANGELOG.md).

## Deploy (Cloudflare Pages)
- Build command: `npm run build`
- Output directory: `dist`
- `public/_redirects` provides the SPA fallback. HTTPS is required for the PWA outside localhost.
