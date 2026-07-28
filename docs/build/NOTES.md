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

_(none yet)_

---

## Entries

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
