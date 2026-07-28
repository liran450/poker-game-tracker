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

**RTL** — logical properties only: `margin-inline-start`, `padding-inline-end`,
`inset-inline-start`, `border-start-start-radius`, `text-align: start`. Never `left`, `right`,
`margin-left`, `padding-right` or their friends. Direction comes from the locale at runtime; no
component may assume RTL is true. Stylelint enforces this.
→ [02](docs/02-architecture.md#internationalisation)

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

**The design decides how it looks; the spec decides how it works.** [`docs/11`](docs/11-visual-design.md)
and `docs/design/` hold the chosen visual direction — authoritative for colour, type, spacing,
density, iconography and motion.
`docs/01`–`docs/09` are authoritative for what a control does, where it lives, what it's called and
which states exist. Where they disagree the spec wins and the design is adapted to it; the four
known collisions are listed in
[`docs/11`](docs/11-visual-design.md#collisions-with-the-spec). The prototype is silent on most
non-happy-path states — silence is a gap to fill in the design's own language, never permission to
skip the state.

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

## Code conventions

**Styling — SCSS modules, always.** One `.module.scss` per component, class names in `camelCase`
(`styles.playerRow`), consumed as `styles.x`. **Never inline styles** — the only exception is a
value that genuinely cannot be known at build time (a computed transform, a live progress width),
and even then the static half stays in the module. Note that the design prototype in
`docs/design/` is entirely inline styles; that is one more reason it is a reference and not code
to lift.

**The design system is SCSS.** A reset file, and tokens as variables — the colours, type scale,
radii and spacing in [`11`](docs/11-visual-design.md). Every module consumes those variables; a
raw hex or a magic pixel value in a component module is a bug. Change a token in one place and the
app follows.

**Component layout.** A folder per component: the component, its module, its test, its index.
Reusable primitives live together in a shared folder — buttons, cards, icons, inputs, tags — and
anything used twice belongs there rather than being copied. DRY applies to styles as much as to
code.

**Components stay small.** When one grows past comfortable reading, split it, and lift the
business logic out into a hook or a `core/` function. Logic that can live in `core/` as a pure
function should — that is where it can be tested properly.

**React 19, functional components only.** No classes. **Do not reach for `useMemo`, `useCallback`
or `memo` by default** — React 19 handles this differently, and reflexive memoisation is noise that
hides the cases where it is genuinely needed. Add it when a measurement says to, and say why.

**Context is for truly global state only** — the session, the locale, the theme. Never for state
that updates frequently (anything per-tap, per-tick, per-keystroke) and never as a way to avoid
passing props through two levels. Game state is Zustand; server state is TanStack Query.
→ [02](docs/02-architecture.md#frontend-stack)

**Single quotes** for strings, in TypeScript and SCSS alike.

## Security

**No secrets in the source, ever** — no API keys, no service-role key, nothing. The Supabase anon
key is the sole exception, and only because it is public by design and carries no privileges
without RLS. → [02](docs/02-architecture.md#security-model)

**No tokens in `localStorage` or `sessionStorage`.** Both are readable by any script on the origin,
so an XSS becomes a stolen session. This constrains how Supabase Auth is configured — see the open
question in [`NOTES.md`](docs/build/NOTES.md) before building step 12.

**Sanitise anything a user typed before it is rendered**, and validate it on the way in — player
names, nicknames, game names, notes. React escapes by default, which handles most of it; the risk
lives wherever we leave that path.

**Never `dangerouslySetInnerHTML`.** For rich or interpolated translations use i18next's `<Trans>`
with real components, not an HTML string.

**Keep dependencies current** — patch promptly, and don't let a major version drift so far that
upgrading becomes its own project.

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
