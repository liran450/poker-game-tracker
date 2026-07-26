# 🃏 Poker Game Tracker — מעקב כספים למשחק פוקר ביתי

A Hebrew-first, RTL, mobile web app (PWA) for tracking money in a friendly home poker game:
buy-ins, chips, the cash pot, end-of-game settlement with a minimum number of transfers, and
long-term statistics per player and per table.

**Status: planning only.** No code yet. This repo currently contains the full product,
architecture, data-model, UX and design specification, intended to be handed off to a design
pass and then to implementation.

---

## The one-paragraph version

A React PWA hosted for free on GitHub Pages, backed by Supabase's free tier (Postgres + Auth +
Realtime + Row Level Security). No servers to run, no hosting bill. Friends open a link on
Android or iPhone, optionally "Add to Home Screen", and the host tracks buy-ins with one tap per
buy-in. Everyone else at the table can watch live, read-only. At the end of the night the app
verifies that buy-ins equal chips, then computes the smallest possible set of money transfers
and produces a WhatsApp-ready text summary.

---

## Documents

Read them in this order.

| # | Document | What's in it |
|---|---|---|
| 01 | [Product spec](docs/01-product-spec.md) | Scope, personas, roles, every feature, requirement traceability |
| 02 | [Architecture](docs/02-architecture.md) | Stack choice, hosting, DB comparison, offline, realtime, security |
| 03 | [Data model](docs/03-data-model.md) | Tables, enums, derived views, RLS policies, event sourcing |
| 04 | [UX spec](docs/04-ux-spec.md) | Every screen, button placement, interactions, RTL rules, states |
| 05 | [Settlement](docs/05-settlement.md) | Money math, the pot, minimum-transfer algorithm, edit mode |
| 06 | [Statistics](docs/06-statistics.md) | Exact stat definitions and formulas, privacy, sample-size rules |
| 07 | [Hebrew glossary](docs/07-hebrew-glossary.md) | Canonical Hebrew UI wording + share-text templates |
| 08 | [Gaps & open questions](docs/08-gaps-and-open-questions.md) | What was missing from the brief; decisions needed from you |
| 09 | [Roadmap](docs/09-roadmap.md) | Milestones, cut lines, testing strategy, risks |
| 10 | [Design brief](docs/10-design-brief.md) | Handoff package for the design pass |

---

## Key decisions made in this plan

These were judgement calls. Each is justified in the linked document, and each is reversible.

1. **PWA on GitHub Pages, not a native app.** One codebase, works on Android + iPhone,
   installable to the home screen, zero cost, no app-store review. → [02](docs/02-architecture.md)
2. **Supabase free tier** over Firebase. Real SQL makes the statistics page trivial, and Row
   Level Security maps exactly onto the host/player/viewer permission model. One caveat — free
   projects pause after 7 days idle — is handled with a scheduled keep-alive ping.
   → [02](docs/02-architecture.md#database-choice)
3. **Buy-in `+` is one tap with undo, not tap-then-confirm.** You asked me to choose between
   per-row approve/cancel and a batch bottom bar. I recommend a third option that beats both,
   and degrades into your batch bar automatically when several rows change at once.
   → [04](docs/04-ux-spec.md#the-buy-in-counter--the-most-important-interaction-in-the-app)
4. **Every change is an append-only event.** This gives the audit trail you asked for (#22),
   conflict-free concurrent editing, offline sync, and undo — all from one mechanism.
   → [03](docs/03-data-model.md#event-sourcing)
5. **Offline-first.** Home games have bad Wi-Fi. The app must work fully with no connection and
   sync later. This wasn't in the brief and is the single biggest technical requirement.
   → [02](docs/02-architecture.md#offline-first)
6. **The cash pot is modelled as a player.** It's a node in the settlement graph with a negative
   balance, which makes "pay Dana out of the cash on the table" fall out of the same algorithm.
   → [05](docs/05-settlement.md#the-pot-as-a-settlement-node)
7. **Statistics are scoped to a group (חבורה), not global to all app users.** "Visible to
   everyone" almost certainly means everyone in your circle, not strangers.
   → [06](docs/06-statistics.md#scoping-and-privacy)

## Things you'll want to decide before implementation starts

Full list with context in [08](docs/08-gaps-and-open-questions.md). The short version:

- Should non-host players at the table be able to add their *own* buy-ins, or is the host the
  only writer? (Affects the permission model significantly.)
- Are statistics per-group, global, or both?
- Half buy-ins / non-standard buy amounts for one player — needed, or out of scope?
- Bit / PayBox: there is no public deep-link API. See
  [05](docs/05-settlement.md#payment-links--reality-check-23) for what actually works.
