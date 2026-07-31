-- Statistics source (03-data-model.md#statistics-source, docs/build/PLAN.md step 11). Plain
-- views over the two permanent tables, to be built on by step 15's actual formulas — kept to
-- exactly this shape until a measurement says a materialised view is needed
-- (03-data-model.md: "at the scale of a home game ... they return in milliseconds").
--
-- Personal statistics ("שלי"/"הכל") read player_results/game_summaries directly, filtered by
-- user_id: 06-statistics.md is explicit that "no personal view" excludes is_private, since a
-- private game still counts toward the player's own figures. This view exists for the other
-- case — anything visible to a group ("החבורה") — where 06-statistics.md's one rule applies:
-- "A private game is excluded from every group-scoped figure and every group-visible list."
-- Baking that in here now means step 14 (which introduces the first game anyone can actually
-- set is_private on) has nothing to retrofit on this view.
--
-- Both source tables are tier-1 (kept forever, unaffected by purge_expired_game_data()), so this
-- view's is_private exclusion keeps holding after a game's live rows are purged.

create view group_player_results as
select pr.*, gs.name as game_name, gs.played_on, gs.currency, gs.finished_at
from player_results pr
join game_summaries gs on gs.game_id = pr.game_id
where not gs.is_private;

comment on view group_player_results is
  'Group-scoped statistics source (06-statistics.md#scoping). Filter by pr.group_id = $1. '
  'Never used for personal stats, which read player_results/game_summaries directly so private '
  'games keep counting toward the player''s own figures.';
