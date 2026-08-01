import { useEffect, useState } from 'react';
import { listGroupMembers } from '@data/groups';
import { getProfilesPublic } from '@data/profiles';
import type { GroupMemberOption } from '@features/game/AddPlayersSheet';

/**
 * The add-players sheet's `◈ חברי החבורה` section needs a member's display name, not just their
 * id — `listGroupMembers` (a plain `group_members` read) only has the id, so this resolves names
 * via `profiles_public` the same way `useAccountNames` does for already-seated players. Shared by
 * the new-game setup screen and the in-game `+ שחקן` sheet — both need "who's in this game's
 * group, by name" for the identical reason.
 */
export function useGroupMemberOptions(
  groupId: string | null,
  enabled: boolean,
): readonly GroupMemberOption[] {
  const [options, setOptions] = useState<readonly GroupMemberOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!enabled || !groupId) {
        if (!cancelled) setOptions([]);
        return;
      }
      const members = await listGroupMembers(groupId);
      const profiles = await getProfilesPublic(members.map((m) => m.userId));
      if (cancelled) return;
      const nameById = new Map(profiles.map((p) => [p.id, p.displayName]));
      setOptions(members.map((m) => ({ userId: m.userId, displayName: nameById.get(m.userId) ?? '' })));
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, enabled]);

  return options;
}
