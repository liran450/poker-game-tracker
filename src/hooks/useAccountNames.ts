import { useEffect, useState } from 'react';
import { getProfilesPublic } from '@data/profiles';

/**
 * Resolves account display names for a set of user ids via `profiles_public`
 * (docs/build/PLAN.md step 14) — every screen rendering a registered player's or a viewer's name
 * needs this, since `core/players.ts#renderPlayerName`'s account path is a real lookup, not
 * something derivable from local fold state alone. Shared by the live game view and the
 * settlement/summary routes rather than duplicated per screen — the same gap ("this id has no
 * name I already know locally") shows up in all three.
 */
export function useAccountNames(
  userIds: readonly string[],
  enabled: boolean,
): ReadonlyMap<string, string> {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const idsKey = userIds.join(',');

  useEffect(() => {
    // Nothing to resolve needs no fetch — `names` staying stale here is harmless, nothing
    // renders a lookup for an id that isn't in `userIds` in the first place.
    if (!enabled || userIds.length === 0) return;
    let cancelled = false;
    void getProfilesPublic(userIds).then((profiles) => {
      if (!cancelled) setNames(new Map(profiles.map((p) => [p.id, p.displayName])));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idsKey]);

  return names;
}
