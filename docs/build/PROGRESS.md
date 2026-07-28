# Progress

**This file is the single source of truth for what is built.** [`PLAN.md`](PLAN.md) says what the
steps are; this file says where we are. Nothing else in the repo records status — no checkboxes in
the plan, no "done" comments in code — because two records of the same fact drift apart.

## How to use this file

**At the start of a session:** read the status table, then read the entry for the step in progress
(if any), then read [`NOTES.md`](NOTES.md). That is the whole handover.

**At the end of a session:** update the status table, and write or extend the step's entry below.
An entry is written even when a step is left unfinished — *especially* then, since the next
session's first question is "where did the last one stop and why".

**Statuses:** `not started` · `in progress` · `blocked` · `done`.

A step becomes `done` only when **every** exit criterion in `PLAN.md` is checked and
`npm run verify` is green. "Basically done" is `in progress`. Nothing is retroactively downgraded:
if a finished step turns out to be wrong, that is a new fix recorded in its entry, not a status
change — otherwise the history stops meaning anything.

---

## Status

| # | Step | Status | Finished | Commit |
|---|---|---|---|---|
| 0 | Plan and memory scaffolding | done | 2026-07-28 | _(this commit)_ |
| 1 | Toolchain and app skeleton | in progress | | |
| 2 | Money core | not started | | |
| 3 | Design system primitives | not started | | |
| 4 | Event model and fold | not started | | |
| 5 | Local persistence and the outbox | not started | | |
| 6 | Game setup, player list, add-players sheet | not started | | |
| 7 | The buy-in counter and the game page | not started | | |
| 8 | Settlement core | not started | | |
| 9 | End game, edit mode, share text | not started | | |
| 10 | Database foundation and RLS | not started | | |
| 11 | Snapshots, statistics source, retention | not started | | |
| 12 | Auth and cloud sync | not started | | |
| 13 | Sharing, viewers, join requests, takeover | not started | | |
| 14 | Groups, roles, private games | not started | | |
| 15 | Statistics | not started | | |
| 16 | Retention live, deletion, export | not started | | |
| 17 | Polish and v1 sign-off | not started | | |

**Next up:** finish step 1 — everything is built and `npm run verify` is green; two exit criteria
need a real GitHub Pages deployment, which needs the repository owner (see the step 1 entry).

### Checkpoints that are not steps

Things that gate progress but aren't build work, recorded here so they can't be quietly skipped:

| Checkpoint | Gates | Status |
|---|---|---|
| **Design assets committed to `docs/design/`, `docs/11` written from them** | Step 3 | ✅ done 2026-07-28 |
| **Play a real game on the step-7 build** | Step 8 | not reached |
| **Paste the share text into real WhatsApp on iOS and Android** | Step 9 `done` | not reached |

---

## Step entries

Each entry uses this shape. Keep them short — the point is what the *next* session needs, not a
diary.

```
### Step N — <name>
**Status:** …  **Sessions:** …  **Commits:** …

**Built.** What actually exists now.
**Deviated.** Where the result differs from PLAN.md, and why. (Then fix PLAN.md if the
deviation is the new intent, so the plan never lies about what the app does.)
**Left undone.** Anything skipped or stubbed, and what will pick it up.
**Watch out.** What the next step needs to know. Anything durable goes to NOTES.md instead.
```

---

### Step 0 — Plan and memory scaffolding
**Status:** done  **Sessions:** 1  **Commits:** 1

**Built.** `docs/build/PLAN.md` (18 steps derived from `docs/01`–`docs/10`), this file,
`NOTES.md`, and a root `CLAUDE.md` carrying the non-negotiable rules and the memory protocol.

**Deviated.** The plan reorders `09-roadmap.md`'s milestones in one place: the database schema and
its permission model land as steps 10–11, *after* the offline app rather than spread across M0 and
M3. The reasoning is in `NOTES.md` under *Sequencing*. The roadmap's own sequencing principle —
build the napkin replacement first — is preserved and in fact strengthened.

**Left undone.** Nothing. No code exists yet, which is correct for this step.

**Watch out.** `CLAUDE.md` is deliberately lean. Each step is expected to append to it the
commands and conventions that have become real, so it stays a description of the repo rather than
a wish list.

---

### Step 1 — Toolchain and app skeleton
**Status:** in progress — code complete, blocked on a deployment only the owner can make
**Sessions:** 1  **Commits:** 1

**Built.** Vite 8 + React 19 + TypeScript 5.9 (strict, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), path aliases, and the `docs/02` folder layout. Tailwind v4 with the
`docs/11` tokens as its `@theme`, SCSS modules wired with `camelCaseOnly`, a reset, and a light
theme that is structurally present but provisional. i18next with the Hebrew bundle, runtime
`lang`/`dir` from the locale, and the dev-only pseudo-locale. Self-hosted Rubik (Hebrew + Latin
subsets, ~5 KB each). Hash router. `vite-plugin-pwa` with manifest, service worker, generated icons
and a standalone offline page. Vitest + Testing Library, Playwright against the pre-installed
Chromium. A strict CSP injected at build. `npm run verify` and the Pages deploy workflow.

**Four lint guards, each proven by test** (`src/test/lint-rules.test.ts`, 34 assertions):
physical Tailwind utilities, physical CSS properties in SCSS, the `style` prop and
`dangerouslySetInnerHTML`, and literal user-facing strings. The i18n and RTL guards are **local
rules**, not off-the-shelf ones — both off-the-shelf options had holes big enough to make the rule
decorative. See `NOTES.md`.

**Deviated.**
- `react-router-dom` → `react-router@8`. The `-dom` package is unmaintained and unpatched; details
  in `NOTES.md`.
- The i18next language detector was **removed**, not configured. It booted English devices into the
  pseudo-locale. Locale resolution is explicit until a second real language exists.
- `PLAN.md` said "an ESLint rule banning literal user-facing strings"; it took two rules, one of
  them written here, because the plugin ignores arrow components.
- Sourcemaps are off in production: the repo is public, so they reveal nothing new and cost ~1.4 MB
  per deploy.

**Left undone — needs the repository owner.** Two exit criteria cannot be checked from here:
1. *The deployed Pages URL loads, installs to a home screen, and shows the offline page with the
   network off.* Needs **Pages enabled with source = GitHub Actions** on `main`, and a merge to
   `main` to trigger `deploy.yml`.
2. *The CSP is active on the deployed build.* Verified against the local production build via
   `vite preview` — the e2e test asserts zero CSP violations — but not yet against Pages, where the
   `/poker-game-tracker/` base path is live rather than simulated.

Everything else is checked. The step flips to `done` once those two are confirmed.

**Watch out.** The base path is hardcoded to `/poker-game-tracker/` in `vite.config.ts`; a repo
rename breaks every asset URL. And `connect-src` in the CSP is `'self'` only until
`VITE_SUPABASE_URL` is set — step 12 must set it or every Supabase call is blocked, silently, in
production only.
