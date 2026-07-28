repo: liran450/poker-game-tracker
branch: claude/poker-money-tracker-app-kf7i0b
path: docs

## Last sync
date: 2026-07-27T14:15:30Z

### Updated in this project
- Repo is planning/spec only — no UI code exists. Design was created fresh from the docs.
- Fully interactive prototype: Home, New game, Live game, Settlement, Summary, Statistics, Profile, Viewer, Group management.
- Group creation/management (owner-only, admin promotion, delete) designed from the data model (`groups`, `group_members.role`).
- Live read-only viewer for guests; generic Share; cash-paid indicators on settlement; group-scale fun stats.

## Sync history
- 2026-07-27T12:48:00Z — initial build of core flow (Home, Live game, Settlement, Summary) from docs.

## Screen map
| Project screen | Built from |
|---|---|
| Home / games list | docs/04-ux-spec.md (Home), docs/10-design-brief.md |
| Live game page | docs/04-ux-spec.md (Game page, buy-in counter), docs/07-hebrew-glossary.md |
| Settlement / edit mode | docs/05-settlement.md, docs/04-ux-spec.md |
| Summary / share | docs/05-settlement.md, docs/07-hebrew-glossary.md (share templates) |
