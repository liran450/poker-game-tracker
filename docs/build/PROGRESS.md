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
| 1 | Toolchain and app skeleton | not started | | |
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

**Next up:** step 1 — toolchain and app skeleton. It has no blockers; step 3 is the first that
needs the design assets, so they can arrive any time before then.

### Checkpoints that are not steps

Things that gate progress but aren't build work, recorded here so they can't be quietly skipped:

| Checkpoint | Gates | Status |
|---|---|---|
| **Design assets committed to `docs/design/`, `docs/11` written from them** | Step 3 | ⏳ waiting on the user |
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
