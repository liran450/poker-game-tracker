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

**RTL** — logical properties only. In Tailwind that's `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`;
in SCSS it's `margin-inline-start`, `inset-inline-start`, `text-align: start`. Never `ml-`, `mr-`,
`left-`, `right-`, `margin-left`, `padding-right` or their friends. Direction comes from the locale
at runtime; no component may assume RTL is true. Lint enforces this on both sides.
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

**Styling — Tailwind first, SCSS module as the fallback.** Reach for a `.module.scss` when Tailwind
can't express it (keyframes, complex selectors, `::-webkit-` bits) or when the component needs real
CSS work anyway. One module per component, class names in `camelCase` (`styles.playerRow`).
**Never inline styles** — the only exception is a value that genuinely cannot be known at build
time (a computed transform, a live progress width), and even then the static half stays in the
class. Note that the design prototype in `docs/design/` is entirely inline styles; that is one more
reason it is a reference and not code to lift.

**The design tokens live in one place** — the Tailwind theme, with the same values mirrored as CSS
custom properties for the SCSS side to consume. The colours, type scale, radii and spacing come
from [`11`](docs/11-visual-design.md). A raw hex or a magic pixel value in a component is a bug:
change a token once and the app follows.

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

**Event timestamps go through `nextTimestamp()`** (`core/offline/clock.ts`), never a bare
`new Date().toISOString()`, for any `clientCreatedAt` on an appended `GameEvent`. `fold()`'s sort
falls back to a random `clientEventId` compare on a tie, and two appends in the same millisecond
(entirely ordinary — e.g. settling a player and then correcting their chip count right after) can
land in the wrong order silently otherwise. See `docs/build/NOTES.md`.

## Security

**No secrets in the source, ever** — no API keys, no service-role key, nothing. The Supabase anon
key is the sole exception, and only because it is public by design and carries no privileges
without RLS. → [02](docs/02-architecture.md#security-model)

**The session persists across reloads** — decided, not a compromise to revisit. Signing the host
out mid-game because they backgrounded the app is unacceptable, and the airtight alternative
(httpOnly cookies) needs a server we deliberately don't have. Prefer IndexedDB over `localStorage`
as the store; it is a marginal gain, not a defence.

**Which means XSS is *the* security problem in this app.** If a script runs on our origin it takes
the session, so the whole budget goes here. Every rule below is load-bearing:

- **A strict Content-Security-Policy**, shipped as a `<meta http-equiv>` tag since GitHub Pages
  can't set headers: `default-src 'self'`, `script-src 'self'` with no `unsafe-inline` and no
  `unsafe-eval`, `connect-src` limited to self and the Supabase project, `object-src 'none'`,
  `base-uri 'self'`. Self-hosted fonts and no CDN are what make this achievable — and it is a
  second reason inline styles are banned.
- **Never `dangerouslySetInnerHTML`.** It is the single largest XSS vector in React. For rich or
  interpolated translations use i18next's `<Trans>` with real components, not an HTML string.
- **No `eval`, no `new Function`**, and nothing dynamically imported from a user-controlled string.
- **Validate on the way in, escape on the way out.** Player names, nicknames, game names and notes
  get length caps and control characters stripped at the boundary; React's escaping handles the
  render. The risk lives wherever we leave that path.
- **Sanitise any user-supplied URL scheme** before it reaches an `href` — `javascript:` is still a
  live vector.
- **The share token lives in the URL fragment.** Never write it into the DOM, a log, or an
  analytics call.
- **Keep dependencies current** — a compromised transitive dependency is XSS by another route.
  Patch promptly, audit in CI, and don't let a major version drift until upgrading is its own
  project.

## Working style in this repo

- Hash router (`/#/game/123`), never history routing — GitHub Pages has no SPA fallback.
- Tap targets ≥ 48px, ≥ 8px apart. Everything interactive in the bottom third of the screen.
  Bottom sheets, not dropdowns. A bottom action bar, not a floating action button.
- Dark theme is the primary design target; light must be correct but is secondary.
- Check every new screen against the pseudo-locale (LTR, ~40% longer) **as you build it**, not in
  an audit at the end.
- The settlement module and the purge function are the two places where a bug is unrecoverable —
  money in one case, data in the other. Over-test both.
- **When a screen or state isn't in the prototype** (and `docs/11`'s "what the design does not
  cover" list names about 20 of them, plus the whole light theme), don't stop and ask before
  building it. Extend the prototype's established visual language yourself — same tokens, same
  card/shadow/glow treatments, same density — and let the result be reviewed afterward rather than
  approved in advance. Silence in the mock is still never permission to skip the state.
- **Before styling a card, an avatar, a status dot, or anything that floats above the page**, check
  [`docs/11`'s "Surface treatment"](docs/11-visual-design.md#surface-treatment) section first — a
  flat `surface-*` fill is usually not what the prototype actually uses there.

## Commands

| Command | What it does |
|---|---|
| `npm run verify` | typecheck → lint → lint:css → test → audit:prod → build. **Must be green before any step is `done`** |
| `npm run dev` | Vite dev server. No CSP in dev — HMR needs inline scripts, so the policy is build-only |
| `npm run e2e` | Playwright against a real production build, including the CSP assertions |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run lint` / `npm run lint:css` | ESLint (incl. the local rules) / stylelint |
| `npm run audit:prod` | Production-tree advisories only — the dev tree has unfixable build-time ones ([NOTES](docs/build/NOTES.md)) |
| `ICON_OUT=public/icons python3 scripts/make-icons.py` | Regenerate the PWA icons from the tokens |

**The pseudo-locale is dev-only** and reached explicitly: `npm run dev`, then `?lang=en-XA`, or the
DevBar toggle in the corner. It never ships and can never be auto-detected — that was a real bug,
see `NOTES.md`.

**Adding a lint rule?** It is not enforced until a test in `src/test/lint-rules.test.ts` proves it
fires. Both local rules shipped with holes that only surfaced under test.
