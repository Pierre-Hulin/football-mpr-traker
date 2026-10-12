# Changelog

All notable changes to Minimum Play Tracker. This project follows
[Semantic Versioning](https://semver.org/):

- **MAJOR**: incompatible changes to stored data or backup files that need migration or manual action.
- **MINOR**: new features, backward compatible.
- **PATCH**: fixes and small refinements.

The version lives only in `package.json`. The build injects it (with the
commit id) into the app, so the landing page, Settings and exported backups
always show the same value. Release with `npm version <major|minor|patch>`.

## [1.0.0] - 2026-10-11

First stable release.

### Added
- Progressive, uncertainty-aware MPR urgency. Players move through on track → falling behind → at risk → critical as the game nears the MPR deadline, and are only marked "missed" once the deadline has passed.
- Proportionate warning banner. It is hidden unless intervention is justified: critical players show at any time, at-risk players only from the second-to-last quarter before the deadline.
- Landing page with a football-field theme, a floating install prompt, and a build label for identifying the running version.

### Changed
- The player grid keeps blue/white for IN/OUT. Amber and red borders and flags are now reserved for at-risk, critical and missed players; "falling behind" is a small dot.

### Fixed
- PWA updates now reach installed devices promptly (no-cache service worker, plus update checks on resume, reconnect and hourly).
