# 06 — Statistics

All statistics are aggregations over `player_game_results`
([03](03-data-model.md#derived-view-player_game_results)) restricted to games with
`status = 'finished'`. Unfinished games never appear in statistics.

## Inclusion rule (#10)

A signed-in user is included wherever they have a `game_players` row with their `user_id` — i.e.
being added to a game is enough; no separate opt-in. Guest rows carry no `user_id` and therefore
appear only inside that game, until claimed (#21), at which point their whole history merges
retroactively.

## Scoping and privacy

Requirement #11 says global statistics are "visible to everyone". Taken literally that means a
stranger who signs up can browse your friends' gambling records, which is almost certainly not
the intent, and is a real privacy problem — this is money and it's a legally sensitive activity
in Israel.

**Recommendation: statistics are scoped to a group (חבורה).** Within your circle everything is
open — that's the social contract of a home game, and the comparison is the fun part. Across
groups, nothing is shared. Three levels:

| Scope | Hebrew | Visible to |
|---|---|---|
| Personal | שלי | Only you (#12) |
| Group | החבורה | Members of that group (#11) |
| Cross-group personal | הכל | Only you — your own totals across every group |

Plus a `stats_visibility = private` flag on the profile for anyone who'd rather not be on the
group leaderboard; they still see their own numbers, and they're counted in table-level
aggregates anonymously. See [08 Q2](08-gaps-and-open-questions.md#q2) if you actually want it
global.

---

## Personal statistics (#12)

| Stat | Hebrew | Formula |
|---|---|---|
| Total net | סה"כ רווח/הפסד | `Σ net_agorot` — your ₪−400 example |
| Games played | משחקים | `count(*)` |
| Win / loss rate | אחוז נצחונות | `count(net > 0) / count(net ≠ 0)` — **games ending exactly at zero are excluded from the denominator** (#12) |
| Wins / losses / breakeven | נצחונות · הפסדים · תיקו | Three raw counts, shown next to the rate |
| Total money played | סה"כ כסף ששוחק | `Σ owed_agorot` |
| Average buy-in per game | ממוצע קנייה למשחק | `avg(owed_agorot)` |
| Average result | ממוצע למשחק | `avg(net_agorot)` |
| ROI | תשואה | `Σ net / Σ owed` as a % — the fairest comparison between a ₪50 player and a ₪200 player |
| Best night | הערב הכי טוב | `max(net_agorot)` + which game |
| Worst night | הערב הכי גרוע | `min(net_agorot)` |
| Profit per hour (#24) | תשואה לשעה | `Σ net / Σ hours`, where hours = `(ended_at − greatest(started_at, joined_at)) / 3600`. Requires per-player join time; that's why `joined_at` exists in the schema |
| Streak (#24) | רצף | Current consecutive games with `net > 0` (hot 🔥) or `net < 0` (cold 🧊), plus the all-time longest of each |
| Average buy-ins | ממוצע קניות | `avg(buys_count)` |
| Volatility | תנודתיות | `stddev(net_agorot)` — the "wild" vs "steady" player. Optional, fun |

Worked check on your example: lost ₪100 five times, won ₪100 once →
`Σ net = −400` ✓, win rate `1/6 = 17%`, ROI `−400/600 = −67%`.

## Group-level statistics (#11)

Per player, within the group:

- Games played (#11)
- Win/loss rate, same exclusion rule
- Total net, average net, ROI
- Average money played per game (#11)
- Average buy-ins per game
- Attendance rate — `games played / games the group played`
- Reliability — `% of their transfers marked שולם`, only if the group actually uses the checkbox

Per table / group (#11):

- Total money played across all games (#11)
- Number of games, total hours played
- Average pot per game, biggest night
- Average players per game, average buy-ins per game
- Average game duration
- **Total unaccounted / house loss** — the accumulated 🔴 discrepancies (#20). Amusing and
  occasionally revealing.
- Most common weekday, longest session

## Fun statistics (#24 and additions)

| Stat | Hebrew | Definition |
|---|---|---|
| Hot / cold streak (#24) | רצף חם / קר | Consecutive winning or losing games |
| Biggest comeback (#24) | הקאמבק הגדול | Games with `buys_count ≥ 3` and `net > 0`; show the count and the biggest one |
| The machine | המכונה | Most buy-ins in a single game |
| Nemesis / patron | היריב / הספונסר | From the `transfers` table: who you most often pay, and who most often pays you, with totals. Genuinely the funniest stat here |
| Rock | הסלע | Lowest volatility with a positive net |
| Donator | התורם | Largest total negative net in the group |
| Iron man | ברזל | Longest attendance streak |
| Early bird / closer | ראשון לצאת / אחרון לסגור | Based on `settled_at` ordering |
| Chip magnet | מגנט ז'יטונים | Highest average chips at settle |
| Cash king | מלך המזומן | Highest share of buy-ins paid in cash (#18) |

Ship maybe six of these, not all — a stats page that scrolls forever gets ignored. Pick the ones
that generate arguments in the group chat.

## Presentation rules

- **Sample size on every rate.** `62% (13 משחקים)`. Below 5 games, suppress the rate and show
  `נתונים חלקיים` — a 100% win rate from one game is misinformation.
- Lead with 2–3 hero numbers, then detail ([04](04-ux-spec.md#statistics)).
- Cumulative-net sparkline over time — the most compelling single visual.
- Filters: date range, group, and "only games I played in".
- Every table sortable, defaulting to something meaningful (net, not name).
- Money always formatted with the `<Money>` component, signed, LTR-isolated
  ([04](04-ux-spec.md#rtl-and-hebrew)).

## Implementation notes

- Start with plain SQL views. At the scale of a home game (hundreds of games over years) they
  return in milliseconds.
- If they ever slow down, switch to a materialised view refreshed on `game_ended`. Do not
  denormalise before there's a measured problem.
- Every stat needs a unit test with a hand-computed fixture, especially the win-rate exclusion
  rule and the per-hour calculation with late joiners — both are easy to get subtly wrong and
  nobody will notice for months.
