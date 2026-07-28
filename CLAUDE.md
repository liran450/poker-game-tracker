# CLAUDE.md

Guidance for any session working in this repo.

## What this is

A Hebrew-first, RTL, offline-capable mobile PWA for tracking money at a home poker game: buy-ins,
chips, the cash pot, shared costs, end-of-night settlement with the minimum number of transfers,
and long-term statistics. React + TypeScript + Vite on GitHub Pages, Supabase free tier for
Postgres + Auth + Realtime + RLS. No servers, no hosting bill.

The full specification is `docs/01`–`docs/10`, read in that order. It is finished and reviewed —
**treat it as the source of truth, not as a starting point for your own ideas.** If you think it is
wrong, say so and ask; don't quietly build something else.

## Start every session here

1. `docs/build/PROGRESS.md` — what is built, what's next, where the last session stopped.
2. `docs/build/NOTES.md` — traps, decisions and environment facts learned while building.
3. `docs/build/PLAN.md` — the current step's scope and its exit criteria.

Then work the current step, and only that step. The plan's steps are sized to be finishable and
verifiable in one go; a step that grows sideways stops being either.

## End every session here

1. Update the status table and the step entry in `PROGRESS.md` — even if the step is unfinished.
2. Add anything durable to `NOTES.md`: a trap hit, a decision made, a version quirk found.
3. If reality diverged from `PLAN.md` and the divergence is the new intent, edit `PLAN.md` so it
   doesn't lie about what the app does.
4. Append to this file anything that has *become true* — a new command, a new convention.
5. Commit and push.

## Non-negotiable rules

These are cheap to hold and expensive to retrofit. Each is argued in the linked document.

**Money** — integers in the currency's minor unit, never floats, ever. Columns and variables carry
a neutral `_minor` suffix. Nothing user-facing ever says "agorot", "cents" or "minor units" — the
UI speaks in shekels. Currency is a **label that is never converted**: changing it changes the
symbol and nothing else. → [03](docs/03-data-model.md#money-representation)

**Rendering amounts** — always through the single `<Money>` component, or its plain-text twin for
share text. Signed, LTR-isolated with LRI/PDI, tabular figures. A number rendered any other way
will eventually render backwards in Hebrew. → [04](docs/04-ux-spec.md#rtl-and-hebrew)

**RTL** — logical properties only (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`). Never `left` or
`right`. Direction comes from the locale at runtime; no component may assume RTL is true. Lint
enforces this. → [02](docs/02-architecture.md#internationalisation)

**Strings** — every user-visible string goes through `i18next` with named parameters. No literals
in components, no string concatenation to build a sentence. Lint enforces this. Share-text
templates are translatable resources too, not literals in the share module.

**Colour is never the only carrier of meaning** — every positive/negative value also carries an
explicit `+`/`−`; every correct/incorrect row also carries `✓` or a signed difference.
→ [04](docs/04-ux-spec.md#accessibility)

**Purity** — `core/settlement.ts` and `core/events.ts` import nothing from React, Supabase, Dexie
or the DOM. They are the parts that must be provably correct. Everything touching Supabase lives
behind the repository layer in `src/data/`, which is the seam that makes a database swap
survivable. → [02](docs/02-architecture.md#repository-layout)

**Every mutation is an append-only event.** Never overwrite state. Undo appends an inverse event
and sets `undone_by`; nothing is ever deleted from the log. This one mechanism is what gives the
audit trail, offline merge, idempotent retries and a safe host takeover — break it in one place and
all four break. → [03](docs/03-data-model.md#event-sourcing)

**RLS on every table, no exceptions**, with a CI check that fails the build if one is missed.
Writes are host-only, permanently — not a v1 simplification. The anon key is public by design and
carries no privileges; everything rests on RLS. No service-role key in the client or the repo,
ever. → [02](docs/02-architecture.md#security-model)

**The purge is irreversible.** `purge_expired_game_data()` deletes rows nobody can get back. It
refuses to run against a game with no snapshot, and statistics must be byte-identical across a
purge. Treat any change to it with the same care as the settlement module.
→ [03](docs/03-data-model.md#retention-and-archiving)

**Offline-first.** The UI reads from the local store and never waits on the network. Home poker
games have bad Wi-Fi; this is a product requirement, not an optimisation.
→ [02](docs/02-architecture.md#offline-first)

## Already decided — do not reopen

Dropped for good, not deferred: **"mark as paid"** on transfers, **moving a buy-in from one player
to another**, and **non-host editing**. Deferred to after v1: half buy-ins, multi-currency UI, push
notifications, a native wrapper, tournament mode, blind timer, chip denomination entry.
→ [09](docs/09-roadmap.md#explicitly-deferred)

Two access rules everything else keys off:

- **Into a group:** an owner or admin invites you by exact username and *you* accept. No invite
  link, no other path.
- **Into a game:** the host's share link, or — if you're in the group — you ask and the host
  approves. Both end in host approval, and joining a game never joins you to the group.

## Working style in this repo

- Hash router (`/#/game/123`), never history routing — GitHub Pages has no SPA fallback.
- Tap targets ≥ 48px, ≥ 8px apart. Everything interactive in the bottom third of the screen.
  Bottom sheets, not dropdowns. A bottom action bar, not a floating action button.
- Dark theme is the primary design target; light must be correct but is secondary.
- Check every new screen against the pseudo-locale (LTR, ~40% longer) **as you build it**, not in
  an audit at the end.
- The settlement module and the purge function are the two places where a bug is unrecoverable —
  money in one case, data in the other. Over-test both.

## Commands

_(Filled in by step 1; nothing to run yet.)_

| Command | What it does |
|---|---|
| `npm run verify` | typecheck + lint + unit tests + build — must be green before any step is `done` |
