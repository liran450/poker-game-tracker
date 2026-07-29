# Notes — what we learned while building

Durable knowledge that outlives a session. [`PROGRESS.md`](PROGRESS.md) says *where we are*; this
file says *what we now know*. It is the mechanism that stops the same mistake being made twice, so
writing to it is part of finishing a step, not an afterthought.

## What belongs here

- **Traps** — something that broke, and why, in enough detail that the fix is obvious next time.
- **Decisions taken during build** that the specification didn't settle, with the reasoning.
- **Environment facts** — versions, flags, quirks of the tooling, things that cost half an hour to
  discover.
- **Retractions** — an entry that turned out to be wrong. Edit it in place and mark it
  `~~struck~~ — superseded: …`. Never silently delete: an entry someone once relied on has to
  stay findable.

## What does not belong here

Status (that's `PROGRESS.md`), product decisions (those are `docs/01`–`docs/10`, and if a build
session changes one, the doc gets edited and the change is noted here), or narration of work that
went fine.

## Format

Newest first, so the file is read top-down. Each entry:

```
### <short imperative title>
**Step N · date · trap | decision | environment | retraction**

What happened, why it matters, and what to do about it.
```

---

## Open questions raised during build

Questions the specification doesn't answer, found while building. Ask the user; don't guess.
`README.md` says every planning question was closed across five review rounds, so anything landing
here is genuinely new — which makes it worth asking rather than quietly inventing an answer.

_(none open — see the settled entry below on session storage.)_

---

## Entries

### Hebrew pluralization needs `_two`, not just `_one`/`_other`
**Step 6 · 2026-07-29 · trap**

`Intl.PluralRules('he').select(n)` returns **three** categories that actually occur for integers:
`one` for 1, `two` for 2, `other` for everything else (0, 3, 4, … 100). i18next resolves a
pluralized `t(key, { count })` call by looking up `key_<category>`; if a key defines `_one` and
`_other` but not `_two`, then `count === 2` resolves to nothing and i18next prints the **raw key**
onto the screen. This is silent in code and in unit tests that don't render with a real i18next
instance — it only showed up when the step-6 flow was driven in an actual browser (`addPlayers
.commit` literally rendered instead of `הוסף 2 שחקנים`).

Fix: whenever a key is split into `_one`/`_other` for Hebrew, it needs `_two` as well (usually with
the same text as `_other` — "הוסף 2 שחקנים" is grammatically fine, Hebrew's "two" category is a
distinct plural *form*, not different wording, for most everyday sentences). `src/i18n/
pluralization.test.ts` now fails the build if a future `_one`/`_other` pair ships without a `_two`.
**A key that is never split at all (no `_one`/`_other`/`_two` suffix) is always safe regardless of
count** — i18next only attempts plural resolution when at least one suffixed variant exists for
that base — so the simplest fix for a string that doesn't need real singular/plural wording is to
not split it, per the existing `gallery.playerCountLabel` precedent.

### Local actor id stands in for a real account until step 12
**Step 6 · 2026-07-29 · decision**

Every event needs a non-null `actorId`, and every game needs a `hostId`, but there are no accounts
until step 12. `core/offline/localIdentity.ts` mints a random UUID once per device, persists it in
a new `meta` Dexie table (IndexedDB, not `localStorage` — consistent with the session-storage
preference in `CLAUDE.md`, though this id carries no privilege of its own so the choice is
consistency, not defence), and `createGame` stamps it as both the actor on every event and, via a
`host_changed` event fired at creation, the game's host. This is a build-time engineering decision,
not a product one — nothing user-facing depends on this id's shape, and step 12 replaces it with a
real profile id behind the same seam (`gameActions.ts`) without touching anything above it.

### Fake timers hang fake-indexeddb
**Step 6 · 2026-07-29 · trap**

`vi.useFakeTimers()` combined with a Dexie call against `fake-indexeddb` hangs — the fake
IndexedDB's internal scheduling apparently depends on real timers/microtasks that fake timers
intercept, and once one test times out without reaching `vi.useRealTimers()`, every subsequent
test's `beforeEach` (which itself touches Dexie) hangs too, cascading a single failure into the
whole file. Hit this trying to control `lastPlayedAt` ordering in `recentPlayers.test.ts`. Fix:
never use fake timers in a test that touches `db.*` — seed explicit timestamps directly via
`bulkPut`/`put` instead of manipulating the system clock.

### The core/ purity lint rule was scoped too wide
**Step 5 · 2026-07-29 · trap**

Step 1's `no-restricted-imports` rule banning React/Supabase/Dexie/UI imports was written against
`src/core/**/*.ts` — everything under `core/`. But `CLAUDE.md`'s actual Purity rule names exactly
two files, `core/settlement.ts` and `core/events.ts`, and `02-architecture.md`'s repository layout
explicitly places the Dexie outbox at `core/offline/`. The wide glob would have made it impossible
to build step 5 inside `core/offline/` at all — it errored on the first `import Dexie` there.

Fixed by narrowing the glob to `src/core/*.ts` (direct children of `core/` only), which still
covers `money.ts`, `settlement.ts` and `events.ts` but excludes any subdirectory. **If a future
step adds another file directly under `core/` that legitimately needs Dexie/React (unlikely, but
possible for a shared type), put it in a subfolder — the direct-children glob is what keeps the two
provably-pure files enforced without also trapping `core/offline/`.**

### fake-indexeddb and dexie-react-hooks added
**Step 5 · 2026-07-29 · environment**

`fake-indexeddb/auto` is imported at the top of `src/test/setup.ts` so Dexie has a real IndexedDB
under Vitest/jsdom (jsdom itself doesn't implement one). `dexie-react-hooks`'s `useLiveQuery` drives
`useSyncState` — no Zustand yet; game/UI state that genuinely needs it arrives with step 6's
screens, per `02-architecture.md#frontend-stack`. Both landed with zero production-audit impact
(`npm audit --omit=dev --audit-level=high` stayed clean).

### `Event.returnValue` is a boolean mirror of `defaultPrevented`, not a settable string
**Step 5 · 2026-07-29 · trap**

The historical `event.returnValue = ''` idiom used by `useBeforeUnloadGuard` still works — assigning
any falsy value sets the cancelled flag — but per the modern spec (and jsdom, correctly) the
*getter* always returns a boolean reflecting `defaultPrevented`, never the string you assigned. A
test asserting `event.returnValue === ''` will fail against a correct implementation; assert
`defaultPrevented`/`returnValue === false` instead.

### Light-theme accent colour is below AA for body text
**Step 3 · 2026-07-28 · trap**

The light-theme accent (`#9a6812`) on surface-app (`#f5f2ee`) is 4.31:1 — below the 4.5:1 WCAG AA
threshold for normal text. On surface-card (`#edeae4`) it drops to 4.01:1. Dark theme passes
comfortably (8.69:1 and 8.06:1 respectively).

This is the design-specified token from `docs/11`. The accent in light theme is used primarily at
heading size (AA-large is 3:1, which it clears) or as button fill (where on-accent text on accent
background passes at 8.4:1). Body-size accent text on these backgrounds should be avoided in light
theme, or the token should be darkened — but that is a design decision, not a code fix.

### Test files need eslint-disable for literal props
**Step 3 · 2026-07-28 · trap**

The `local/no-literal-jsx-text` rule correctly flags literal strings in `title`, `label`, and
similar props — but in test files these are test data, not user-facing text. The fix is a file-level
`/* eslint-disable local/no-literal-jsx-text */` after the imports. This is not a hole in the rule;
it's working as designed. The rule's job is to catch literals in production components, and the
disable comment is the right opt-out for tests.

### The pseudo-locale hijacked every English device
**Step 1 · 2026-07-28 · trap**

Registering `en-XA` in `supportedLngs` alongside `i18next-browser-languagedetector` meant that a
phone reporting `en-US` booted **into the pseudo-locale** — pseudo-translated Hebrew, in LTR, as the
real UI. i18next's `getBestMatchFromCodes` falls back from `en-US` to `en`, finds no exact match,
and then accepts any supported tag sharing the language part. `en-XA` shares it.

The e2e smoke test caught it on the first run, which is the argument for having written it.

Fix: **the language detector is gone**. With exactly one shipping language there is nothing to
detect, so the locale is resolved explicitly — `?lang=` or a value this app itself stored, dev-only
— and the pseudo bundle is excluded from production builds entirely (verified: `en-XA` does not
appear in `dist/`). Real detection comes back when a second real language ships, and whoever adds it
must not re-introduce this: **never put a pseudo or partial locale in `supportedLngs` next to a
detector.**

### eslint-plugin-i18next silently ignores arrow components
**Step 1 · 2026-07-28 · trap**

`i18next/no-literal-string` reports JSX returned from a function *declaration* and says nothing
about `export const Page = () => <p>שלום</p>`. Half of any React codebase is arrow components, so
the rule would have looked enforced while enforcing nothing — the worst failure mode for a guard.

Fix: a local rule, `local/no-literal-jsx-text`, covering every component shape plus the attributes
users actually read (`alt`, `title`, `placeholder`, `aria-label`…), with `<Trans>` children exempt.
The plugin stays as a second net. `src/test/lint-rules.test.ts` asserts the arrow case specifically.

**The general lesson, worth applying to every rule added later:** a lint rule is not enforced until
a test proves it fires. Both local rules had holes that only surfaced under test — the Tailwind rule
also missed `clsx('flex', cond && 'pr-3')`, because a `CallExpression > Literal` selector only sees
direct children and the class was nested inside a `LogicalExpression`.

### react-router: use `react-router`, not `react-router-dom`
**Step 1 · 2026-07-28 · environment**

`react-router-dom` tops out at 7.18.1 and every 7.x from 7.12.0 carries an unpatched high advisory
(RSC-mode CSRF). The patched line is `react-router` **8.3.0** — v8 folded the `-dom` package in and
stopped publishing it.

Note the trap: `npm audit fix` proposes downgrading to 7.11.0, which made things **worse** — it
re-opened several advisories fixed in 7.18.0. Always read the version ranges rather than trusting
the suggested fix. Result: `react-router@8` and a clean production audit.

### TypeScript is pinned to 5.9.3 on purpose
**Step 1 · 2026-07-28 · environment**

TypeScript's latest is 7.0.2, but `typescript-eslint@8.65.0` declares `typescript >=4.8.4 <6.1.0`,
so TS 6 and 7 have no type-aware linting yet. Lint enforcement is load-bearing here, so TypeScript
is pinned exactly (`"typescript": "5.9.3"`, no caret) rather than floating. Revisit when
typescript-eslint ships TS 7 support; do not bump it casually.

### CI audits production dependencies, not the dev tree
**Step 1 · 2026-07-28 · decision**

`vite-plugin-pwa@1.3.0` (latest) pulls `workbox-build`, which drags in 8 packages with high
advisories — `ejs`, `jake`, `brace-expansion`, `minimatch` and friends. There is no upgrade: the
plugin is already current. All 8 are **build-time only** and absent from the production tree
(verified with `npm ls --omit=dev`).

So `npm run verify` gates on `npm audit --omit=dev --audit-level=high`, which must stay clean. Dev
advisories are visible in a plain `npm audit` but do not fail the build — a gate nobody can pass
gets disabled, and then nothing is gated. Re-check when vite-plugin-pwa updates workbox.

### Smaller environment facts
**Step 1 · 2026-07-28 · environment**

- **stylelint autofix strips `-webkit-text-size-adjust`**, which iOS Safari — a primary target —
  still needs. `property-no-vendor-prefix` is off for that reason; don't turn it back on.
- **Playwright**: the sandbox ships Chromium build 1194 while `@playwright/test@1.62` wants 1234,
  and downloading is not an option here. `playwright.config.ts` points at `/opt/pw-browsers/chromium`
  when it exists and otherwise lets Playwright resolve its own, so CI is unaffected.
- **Tailwind v4's `@theme` gives both halves for free**: each token becomes a utility *and* a CSS
  custom property, which is exactly the "one definition, two consumers" that `CLAUDE.md` asks for.
  No separate mirror file is needed.
- **The CSP is injected at build only.** Vite's dev server needs inline scripts for HMR, so a policy
  loose enough for dev would be a policy nobody tested. Dev has no CSP; the built output has the
  strict one, and the e2e test asserts the real build raises no violations.

### Session persists across reloads; XSS gets the whole security budget
**Step 0 · 2026-07-28 · decision**

Settled by the owner, closing the open question this file previously carried. Signing the host out
mid-game because they backgrounded the app is unacceptable, so **the session persists** — IndexedDB
preferred over `localStorage`, though that preference is a marginal gain and not a defence, since
both are readable by any script on the origin. The airtight option (httpOnly cookies) needs a
server, and we deliberately don't have one.

**The consequence is the important half:** if a script runs on our origin it takes the session, so
XSS is *the* security problem in this app and the effort goes there rather than into storage
theatre. That made the CSP a real step-1 deliverable rather than a nice-to-have — a
`<meta http-equiv>` tag, because GitHub Pages can't set headers, with `script-src 'self'` and no
`unsafe-inline`/`unsafe-eval`. Two earlier decisions are what make a policy that strict actually
hold: self-hosted fonts (no Google Fonts request) and no inline styles. The full rule set is in
`CLAUDE.md` under Security.

### Tailwind first, SCSS module as the fallback
**Step 0 · 2026-07-28 · decision · supersedes an earlier reversal**

Doc 02 always specified Tailwind. A preference for SCSS modules briefly replaced it, then the owner
restored Tailwind as the default with SCSS modules as the fallback — reach for a module when
Tailwind can't express something (keyframes, complex selectors, vendor pseudo-elements) or when the
component needs real CSS work anyway. Docs 02 and 09 are back to their original wording; this entry
exists so the round trip doesn't look like drift.

The lasting consequence is that **the RTL guard now needs both halves**: an ESLint rule over
physical Tailwind utilities (`ml-`, `mr-`, `left-`…) *and* a stylelint rule over physical CSS
properties in whatever SCSS exists. Enforcing only one leaves the other side unguarded. A third
rule bans the `style` prop, which the CSP also depends on.

### Four collisions between the prototype and the spec — spec wins in all four
**Step 0 · 2026-07-28 · trap**

The design landed and `docs/11-visual-design.md` was extracted from it. Four places where building
the prototype faithfully would break a spec'd rule, listed here because they are easy to reproduce
by accident and all four are invisible in a screenshot:

1. The `−` on the buy counter is **44×44px**; the floor is 48px. Grow it and grow `+` alongside it —
   the asymmetry is meant to be relative weight, not an undersized decrement.
2. Rubik is loaded from **Google Fonts**; `02` requires a self-hosted subset.
3. The prototype is one file of inline styles with hardcoded Hebrew. Lifting its markup would
   bypass `i18next`, `<Money>` and the event model at once.
4. Physical CSS (`left`/`right`) throughout — fine in a permanently-RTL mock, fatal under the
   pseudo-locale.

None of the four changes how anything looks, which is why the resolution is always "adapt the
design", never "revisit the spec". Full detail in
[`../11-visual-design.md`](../11-visual-design.md#collisions-with-the-spec).

Also worth knowing: the prototype already gets two things right that are easy to lose —
`font-variant-numeric:tabular-nums` on every numeral, and `direction:ltr; unicode-bidi:isolate` on
money. That is the `<Money>` rule, already proven in situ.

### The mockup decides appearance; the spec decides behaviour
**Step 0 · 2026-07-28 · decision**

The poker tracker design from Claude Design is the chosen visual direction, and its assets belong
in `docs/design/` with `docs/11-visual-design.md` written from them. `docs/10-design-brief.md`
stays as the brief that asked for it — it leaves the palette and typeface explicitly open, which is
exactly the hole the design fills, and step 3 could not otherwise start from anything firmer than
"deep amber or teal".

The rule that matters, because a future session will otherwise faithfully reproduce a mockup and
break a spec'd rule doing it: **the design is authoritative for colour, type, spacing, density,
iconography and motion; `docs/01`–`docs/09` are authoritative for what a control does, where it
lives, what it's called, and which states exist.** The predictable collisions — dropdowns vs bottom
sheets, a floating action button vs the bottom action bar, colour-only win/loss, and any label that
drifts from the glossary in `07` — are enumerated in `docs/design/README.md`. A mockup is also
silent on ~40 of the states `10` requires; silence there is a gap to fill in the design's language,
never a decision that the state isn't needed.

### `/design-sync` runs the other way, and not from here
**Step 0 · 2026-07-28 · environment**

`/design-sync` uploads an existing compiled component library *to* Claude Design so its agent
builds with real components. It does not pull a design *from* Claude Design into a repo, and this
repo has no components to upload until step 3. Separately, `DesignSync` cannot authorise in a web
session — it wants an interactive terminal — so design assets arrive either through Claude Design's
"Send to Claude Code Web", which seeds them into the workspace, or by being exported and committed
by hand. Worth re-reading after step 3, when syncing the real components up becomes genuinely
useful.

### Sequencing: the offline app before the database
**Step 0 · 2026-07-28 · decision**

`09-roadmap.md` puts the Supabase project and first migration in M0 and cloud sync in M3. This
plan instead builds the entire offline app (steps 1–9) before touching Postgres (steps 10–11).

Why: the schema's shape is dictated by the event model, and the event model is the thing most
likely to be adjusted once real screens are built against it. Writing migrations first means
rewriting them; writing them after step 9 means writing them once, from a design that has already
survived a real game night. The one thing that genuinely cannot wait — the keep-alive cron, which
`02-architecture.md` warns must not be discovered the night of a game — is still explicitly part
of step 10, and step 10 comes long before any game depends on the network.

The dependency this creates is recorded in both directions: `core/events.ts` (step 4) fixes the
event-type union, and step 10's Postgres enum must match it character for character. Step 10's
exit criteria include a test that reads both and asserts they agree, so the two cannot drift.

### Two rules to read before building anything
**Step 0 · 2026-07-28 · decision**

From `README.md`, restated because everything else keys off them and a session that gets these
wrong will build the wrong thing several steps deep:

- **Into a group:** an owner or admin invites you by exact username, and *you* accept. There is no
  invite link and no other path.
- **Into a game:** either the host's share link, or — if you're already in the group — you ask and
  the host approves. Both paths end in host approval. Adding someone to a game never adds them to
  the group.

---

### Zod v4 discriminatedUnion type assertion
**Step 4 · 2026-07-28 · trap**

`z.discriminatedUnion` in zod v4 expects a tuple type `[ZodObject, ZodObject, ...ZodObject[]]`
built from its internal `$ZodLooseShape` type. When the variants are built dynamically via
`.map()`, TypeScript cannot prove the tuple shape, so a `as unknown as [...]` cast is needed. This
is purely a type-level issue — the runtime works correctly. The cast references
`z.core.$ZodLooseShape`, which is a stable public API surface in zod 4.x.

### Event count: spec says 30, reality is 31
**Step 4 · 2026-07-28 · decision**

`03-data-model.md` says "~30 event types" but the actual table lists 31 distinct types (the `note`
event is present in the table but may have been excluded from the count). The `EVENT_TYPES` array
is the single source of truth; the spec's "~30" is treated as approximate. All 31 types are
implemented and tested.
