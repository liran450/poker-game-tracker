# 🃏 Poker Game Tracker — מעקב כספים למשחק פוקר ביתי

A Hebrew-first, RTL, mobile web app (PWA) for tracking money in a friendly home poker game:
buy-ins, chips, the cash pot, shared costs, end-of-game settlement with a minimum number of
transfers, and long-term statistics per player and per group.

**Status: planning only.** No code yet. This repo currently contains the full product,
architecture, data-model, UX and design specification, intended to be handed off to a design pass
and then to implementation.

---

## The one-paragraph version

A React PWA hosted for free on GitHub Pages, backed by Supabase's free tier (Postgres + Auth +
Realtime + Row Level Security). No servers to run, no hosting bill. Friends open a link on Android
or iPhone, optionally "Add to Home Screen", and the host tracks buy-ins with one tap per buy-in.
Everyone else at the table can watch live, read-only. At the end of the night the app verifies that
buy-ins equal chips, computes the smallest possible set of money transfers, and produces a
WhatsApp-ready text summary. Detailed game data expires over time to keep the database small;
results keep counting toward everyone's statistics forever.

---

## Documents

Read them in this order.

| # | Document | What's in it |
|---|---|---|
| 01 | [Product spec](docs/01-product-spec.md) | Scope, roles, every feature, retention policy, requirement traceability |
| 02 | [Architecture](docs/02-architecture.md) | Stack, hosting, DB comparison, offline, i18n, security |
| 03 | [Data model](docs/03-data-model.md) | Tables, event sourcing, permanent snapshots, retention, RLS |
| 04 | [UX spec](docs/04-ux-spec.md) | Every screen, button placement, interactions, RTL rules, states |
| 05 | [Settlement](docs/05-settlement.md) | Money math, the pot, shared costs, minimum-transfer algorithm, edit mode |
| 06 | [Statistics](docs/06-statistics.md) | Exact definitions and formulas, group scoping, the seven fun stats |
| 07 | [Hebrew glossary](docs/07-hebrew-glossary.md) | Canonical Hebrew wording, bidi rules, share-text templates |
| 08 | [Gaps, decisions & open questions](docs/08-gaps-and-open-questions.md) | What was missing, what you've decided, what's still open |
| 09 | [Roadmap](docs/09-roadmap.md) | Milestones, cut lines, testing strategy, risks |
| 10 | [Design brief](docs/10-design-brief.md) | Handoff package for the design pass |

---

## Key decisions

Each is justified in the linked document.

1. **PWA on GitHub Pages, not a native app.** One codebase, Android + iPhone, installable, zero
   cost, no app-store review. → [02](docs/02-architecture.md)
2. **Supabase free tier** over Firebase. Real SQL makes the statistics page trivial, and Row Level
   Security maps exactly onto the host/player/viewer model. Free projects pause after 7 days idle —
   handled by a scheduled ping. → [02](docs/02-architecture.md#database-choice)
3. **Detail expires, results are forever.** Immutable per-game result snapshots feed every
   statistic, so purging old data — or deleting a game outright — never changes a number. Full
   detail lives 90 days, the activity log 30.
   → [03](docs/03-data-model.md#retention-and-archiving)
4. **Buy-in `+` is one tap with undo, not tap-then-confirm.** The undo states the change in
   buy-ins, chips and money, and upgrades into a batch bar listing every row when several change at
   once. → [04](docs/04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app)
5. **Every change is an append-only event.** One mechanism gives the audit trail, conflict-free
   concurrent editing, offline sync, undo — and makes an instant host takeover safe.
   → [03](docs/03-data-model.md#event-sourcing)
6. **Offline-first.** Home games have bad Wi-Fi. → [02](docs/02-architecture.md#offline-first)
7. **One host, seizable immediately.** Any signed-in group member can take control the moment the
   host's phone dies, with a warning about that phone's sync state.
   → [04](docs/04-ux-spec.md#host-takeover-warning)
8. **The cash pot is modelled as a player** — a node with a negative balance, so "pay Dana out of
   the cash on the table" falls out of the settlement algorithm with no special case.
   → [05](docs/05-settlement.md#the-pot-as-a-settlement-node)
9. **Statistics never cross a group**, and a **private game** is excluded from every group-scoped
   figure and list while still counting in each player's personal statistics.
   → [06](docs/06-statistics.md#scoping)
10. **Writes are host-only, permanently**, and nobody joins a game without the host approving —
    group members ask from the app, everyone else through the share link. Adding someone to a game
    never adds them to the group. → [03](docs/03-data-model.md#two-paths-in-one-gate)
11. **Players are added in batches, not one at a time.** A multi-select sheet with a selection tray,
    group members marked by a `◈` glyph, and one confirm button.
    → [04](docs/04-ux-spec.md#adding-players--the-multi-select-sheet)
12. **Share links are 256-bit tokens, stored hashed, carried in the URL fragment**, valid 7 days
    for anyone outside the group and 30 days for members.
    → [03](docs/03-data-model.md#link-security)
13. **Hebrew first, built for more languages.** Real i18n plumbing from day one; direction derived
    from the locale, currency from the game — and currency is a label that is never converted.
    → [02](docs/02-architecture.md#internationalisation)

## Planned, not in v1

Two features are specified but deliberately unbuilt, with schema reserved so they don't need a
migration later ([01 §10](docs/01-product-spec.md#10-planned-not-in-v1)):

- **Locations** — where a game was played, addable at any point, with the group's five most-played
  places as quick picks.
- **Scheduled games** — a future game with date, time, location and invitees, RSVPs, per-person
  expected arrival times, and `התחל משחק` on the day.

## Open questions

One: the **group screen's "add member" flow** is unspecified — adding someone to a group is a
heavier act than adding them to a game, and shouldn't reuse the same sheet. Direction and reasoning
in [08 C1](docs/08-gaps-and-open-questions.md#c1). Everything else raised across five review rounds
has been answered, and the full record is in the same document.
