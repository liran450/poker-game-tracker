# The chosen design — reference assets

The visual direction is settled: the **poker tracker design** from Claude Design is the one.
The assets are here, and **[`docs/11-visual-design.md`](../11-visual-design.md) reads them back as a
specification** — real token values, the screens covered, and the collisions with the spec. Read
that first; this folder is the raw material behind it.

## What's here

| Path | What it is |
|---|---|
| `prototype/poker-tracker.dc.html` | The interactive prototype — nine screens. Open it in a browser; `support.js` next to it is its runtime |
| `screenshots/` | Stills of the live game screen and the add-players sheet |
| `handoff.md` | Provenance: what was built, from which spec documents, when |

The prototype is a **single-file mock** — inline styles, hardcoded Hebrew, no i18n, no event model.
It is a visual reference, not code to merge. See
[`11 — Collisions`](../11-visual-design.md#collisions-with-the-spec).

## What this folder is, and is not

[`docs/10-design-brief.md`](../10-design-brief.md) is the **brief** — the constraints handed *to* a
design pass. It deliberately stops short of deciding: the palette is "for the designer to refine",
the typeface is "Rubik or Heebo". This folder is the **answer** to that brief. Both stay: 10 says
why, this says what.

It is a **mockup**, so it is authoritative about *appearance* and silent about most *behaviour*.
That distinction is the whole reason this README exists — see the precedence rule below, which is
the one thing to read before building a screen from these files.

## Precedence — read this before copying anything

| Question | Decided by |
|---|---|
| Colour, type scale, spacing, radii, elevation, iconography, density, motion | **The design** |
| What a control *does*, where it lives, what it's called, which states exist | **`docs/01`–`docs/09`** |

Where they disagree, the spec wins on interaction and the design gets adapted to it. The
disagreements to expect, because the spec is unusually specific about them:

- **Bottom sheets, never dropdowns or popovers**, for every menu and picker
  ([`04`](../04-ux-spec.md)). A mockup that shows a dropdown gets rebuilt as a sheet in the
  design's own visual language.
- **A bottom action bar, never a floating action button**
  ([`04 — Action bar`](../04-ux-spec.md#action-bar)).
- **Everything interactive in the bottom third**, tap targets ≥ 48px, ≥ 8px apart.
- **Colour is never the only carrier of meaning** — if the design distinguishes win from loss by
  green and red alone, the `+`/`−` is added.
- **Hebrew wording comes from [`07`](../07-hebrew-glossary.md)**, which says plainly: do not invent
  new terms. Any label in the mockup that differs from the glossary is a mockup typo, not a
  rename.
- **Logical properties only.** However the design is exported, no `left`/`right` survives into the
  code.

A future session that finds a genuine conflict not listed here resolves it in the spec's favour,
records it in [`../build/NOTES.md`](../build/NOTES.md), and says so — rather than quietly building
the mockup.

## Known gaps

A mockup covers the happy path. The states this design does not cover — and there are many, because
[`10`](../10-design-brief.md#states-to-design-not-just-the-happy-path) requires around forty — are
enumerated in [`11`](../11-visual-design.md#what-the-design-does-not-cover). Step 3 derives them in
this design's own language.

## Updating these assets

`DesignSync` cannot authorise in a web session (it needs an interactive terminal), so a refreshed
design arrives either through Claude Design's **"Send to Claude Code Web"**, or as an export
dropped in here by hand. Whichever way: re-extract the values in
[`11`](../11-visual-design.md) rather than assuming they held, and update its collision list.
