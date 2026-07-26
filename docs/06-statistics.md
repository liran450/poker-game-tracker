# 06 — Statistics

Statistics read exclusively from the permanent snapshot tables `player_results` and
`game_summaries` ([03](03-data-model.md#permanent-tables)), never from the live game tables. That
is what makes them survive the retention policy: a game's detailed rows are purged after months,
and even an explicitly deleted game keeps contributing to statistics forever.

Only games that reached `finished` are ever counted.

## Inclusion rule (#10)

A signed-in user is included wherever they have a `player_results` row carrying their `user_id` —
i.e. being added to a game is enough; no separate opt-in. Guest rows carry no `user_id` and appear
only inside that game, until claimed (#21), at which point the claim updates the permanent rows
and their whole history merges retroactively.

## Scoping

**All statistics are scoped to a group (חבורה).** You never see players from another group, and no
figure aggregates across group boundaries. Three views:

| Scope | Hebrew | Visible to |
|---|---|---|
| Personal, within a group | שלי | Only you (#12) |
| Group leaderboards | החבורה | Members of that group (#11) |
| Personal, all groups | הכל | Only you — your own totals across every group you're in |

Games with no group contribute to your personal totals only.

A `stats_visibility = private` flag on the profile keeps someone off the group leaderboard while
still counting them, anonymously, in table-level aggregates.

**Currency:** all figures are shown in the group's currency. If a group ever mixes currencies,
money stats are reported per currency and never summed — an exchange rate is not something this
app should be guessing.

---

## Personal statistics (#12)

| Stat | Hebrew | Formula |
|---|---|---|
| Total net | סה"כ רווח/הפסד | `Σ net_minor` — your ₪−400 example |
| Games played | משחקים | `count(*)` |
| Win / loss rate | אחוז נצחונות | `count(net > 0) / count(net ≠ 0)` — **games ending exactly at zero are excluded from the denominator** (#12) |
| Wins / losses / breakeven | נצחונות · הפסדים · תיקו | Three raw counts, shown next to the rate |
| Total money played | סה"כ כסף ששוחק | `Σ owed_minor` |
| Average buy-in per game | ממוצע קנייה למשחק | `avg(owed_minor)` |
| Average result | ממוצע למשחק | `avg(net_minor)` |
| ROI | תשואה | `Σ net / Σ owed` as a % — the fairest comparison between a ₪50 player and a ₪200 player |
| Best night | הערב הכי טוב | `max(net_minor)` + which game |
| Worst night | הערב הכי גרוע | `min(net_minor)` |
| Profit per hour (#24) | תשואה לשעה | `Σ net / Σ (minutes_played / 60)` — uses per-player minutes, so someone who joined for the last 40 minutes isn't measured against a 5-hour session |
| Streak (#24) | רצף | Current consecutive games with `net > 0` (🔥) or `net < 0` (🧊), plus the all-time longest of each |
| Average buy-ins | ממוצע קניות | `avg(buys_count)` |
| Spent on shared costs | הוצאות משותפות | `Σ shared_costs_share_minor` — kept out of the poker figures entirely |

Worked check on your example: lost ₪100 five times, won ₪100 once →
`Σ net = −400` ✓, win rate `1/6 = 17%`, ROI `−400/600 = −67%`.

## Group-level statistics (#11)

Per player, within the group:

- Games played (#11)
- Win/loss rate, same zero-exclusion rule
- Total net, average net, ROI
- Average money played per game (#11)
- Average buy-ins per game
- Attendance rate — `games played / games the group played`

Per table / group (#11):

- Total money played across all games (#11)
- Number of games, total hours played
- Average pot per game, biggest night
- Average players per game, average buy-ins per game
- Average game duration
- **Total unaccounted / house loss** — the accumulated 🔴 discrepancies (#20). Amusing and
  occasionally revealing
- Total spent on shared costs
- Most common weekday, longest session

## Fun statistics

The seven you picked, and only these — a stats page that scrolls forever gets ignored.

| Stat | Hebrew | Definition |
|---|---|---|
| Nemesis / patron | היריב / הספונסר | From `transfer_summaries`: who you most often pay, and who most often pays you, with running totals. The one most likely to start an argument in the group chat |
| The donator | התורם | Largest total negative net in the group |
| Iron man | הברזל | Longest run of consecutive games attended |
| Hot / cold streak (#24) | רצף חם / קר | Consecutive winning or losing games, current and all-time best |
| Chip magnet | מגנט ז'יטונים | Highest average chip count at settle |
| The machine | המכונה | Most buy-ins in a single game, and the highest average |
| The comeback (#24) | הקאמבק | Games with 3+ buy-ins that still finished in the green — the count, and the biggest one |

Explicitly dropped: a reliability / "settles up on time" stat. It would have depended on people
marking transfers as paid, which they won't do, so the number would be wrong.

## Presentation rules

- **Sample size on every rate.** `62% (13 משחקים)`. Below 5 games, suppress the rate and show
  `נתונים חלקיים` — a 100% win rate from one game is misinformation.
- Lead with 2–3 hero numbers, then detail ([04](04-ux-spec.md#statistics)).
- Cumulative-net sparkline over time — the most compelling single visual.
- Filters: date range, group, and "only games I played in".
- Every table sortable, defaulting to something meaningful (net, not name).
- Money always rendered through the `<Money>` component: signed, LTR-isolated, in the group's
  currency ([04](04-ux-spec.md#rtl-and-hebrew)).

## Implementation notes

- Plain SQL views over `player_results` + `game_summaries` to start. Convert to materialised views
  refreshed by `finalize_game` only if a measurement says to.
- Every stat needs a unit test with a hand-computed fixture, especially the win-rate zero-exclusion
  and profit-per-hour with late joiners — both are easy to get subtly wrong and nobody would notice
  for months.
- Add a test that statistics are **unchanged** after `purge_expired_game_data()` runs and after a
  game is explicitly deleted. That is the whole point of the snapshot design, and it should fail
  loudly if someone ever repoints a stat at a live table.
