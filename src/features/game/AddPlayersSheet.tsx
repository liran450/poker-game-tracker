import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { SelectionChip } from '@components/SelectionChip';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';
import type { AccountPlayerPick } from '@core/offline/gameActions';

/** A group member the ◈ section can offer (docs/build/PLAN.md step 14). */
export interface GroupMemberOption {
  readonly userId: string;
  readonly displayName: string;
}

interface GuestPick {
  readonly kind: 'guest';
  readonly name: string;
}
interface AccountPick {
  readonly kind: 'account';
  readonly userId: string;
  readonly displayName: string;
}
type Pick = GuestPick | AccountPick;

export interface AddPlayersSheetProps {
  open: boolean;
  onClose: () => void;
  onCommit: (names: readonly string[], accountPlayers: readonly AccountPlayerPick[]) => void;
  /**
   * Sorted, most-frequently-played-with first — the free-text quick-add
   * history (04-ux-spec.md#adding-players--the-multi-select-sheet)'s second
   * section, `חברים נוספים`, once a group is in play; the only section when
   * it isn't.
   */
  recentNames: readonly string[];
  /**
   * The game's group's members, marked with `◈` — empty when the game has
   * no group, in which case the whole `◈ חברי החבורה` section is omitted
   * rather than shown empty.
   */
  groupMembers?: readonly GroupMemberOption[];
}

/**
 * One component, two entry points (the setup screen and the in-game
 * `+ שחקן` action) per spec — nothing is written to the game until the
 * footer commit, so a mis-tap here costs nothing.
 */
export function AddPlayersSheet({
  open,
  onClose,
  onCommit,
  recentNames,
  groupMembers = [],
}: AddPlayersSheetProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Pick[]>([]);
  const [newName, setNewName] = useState('');

  function isSelectedGuest(name: string): boolean {
    return selected.some((p) => p.kind === 'guest' && p.name === name);
  }

  function isSelectedAccount(userId: string): boolean {
    return selected.some((p) => p.kind === 'account' && p.userId === userId);
  }

  function toggleGuest(name: string): void {
    setSelected((prev) =>
      prev.some((p) => p.kind === 'guest' && p.name === name)
        ? prev.filter((p) => !(p.kind === 'guest' && p.name === name))
        : [...prev, { kind: 'guest', name }],
    );
  }

  function toggleAccount(member: GroupMemberOption): void {
    setSelected((prev) =>
      prev.some((p) => p.kind === 'account' && p.userId === member.userId)
        ? prev.filter((p) => !(p.kind === 'account' && p.userId === member.userId))
        : [...prev, { kind: 'account', userId: member.userId, displayName: member.displayName }],
    );
  }

  function togglePick(pick: Pick): void {
    if (pick.kind === 'guest') toggleGuest(pick.name);
    else toggleAccount(pick);
  }

  function addNewName(): void {
    const trimmed = newName.trim();
    if (!trimmed) return;
    // A typed name matching an existing pick selects it rather than duplicating it.
    if (!isSelectedGuest(trimmed)) {
      setSelected((prev) => [...prev, { kind: 'guest', name: trimmed }]);
    }
    setNewName('');
  }

  function handleNewNameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      addNewName();
    }
  }

  function reset(): void {
    setSelected([]);
    setNewName('');
  }

  function handleCommit(): void {
    if (selected.length === 0) return;
    const names = selected.filter((p): p is GuestPick => p.kind === 'guest').map((p) => p.name);
    const accountPlayers: AccountPlayerPick[] = selected
      .filter((p): p is AccountPick => p.kind === 'account')
      .map((p) => ({ userId: p.userId, displayName: p.displayName }));
    onCommit(names, accountPlayers);
    reset();
    onClose();
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={t('addPlayers.title')}>
      <div className="flex flex-col gap-4">
        {selected.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-caption font-semibold text-fg-tertiary">
              {t('addPlayers.selectedCount', { count: selected.length })}
            </span>
            <div className="flex flex-wrap gap-2">
              {selected.map((pick) => (
                <button
                  key={pick.kind === 'guest' ? `guest:${pick.name}` : `account:${pick.userId}`}
                  type="button"
                  onClick={() => togglePick(pick)}
                  className="inline-flex min-h-tap items-center gap-1.5 rounded-lg border-2 border-accent bg-surface-amber-dim px-3.5 text-body font-semibold text-fg"
                >
                  {pick.kind === 'guest' ? pick.name : pick.displayName}
                  <span aria-hidden="true" className="text-fg-tertiary">
                    {'✕'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {groupMembers.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-body-sm font-semibold text-fg-tertiary">
              {t('addPlayers.groupSection')}
            </h3>
            <div
              role="listbox"
              aria-label={t('addPlayers.groupSection')}
              className="flex max-h-64 flex-wrap content-start gap-2 overflow-y-auto"
            >
              {groupMembers.map((member) => (
                <SelectionChip
                  key={member.userId}
                  label={member.displayName}
                  groupMember
                  selected={isSelectedAccount(member.userId)}
                  onClick={() => toggleAccount(member)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-body-sm font-semibold text-fg-tertiary">
            {t('addPlayers.recentSection')}
          </h3>
          {recentNames.length === 0 ? (
            <p className="text-body-sm text-fg-disabled">{t('addPlayers.noRecentNames')}</p>
          ) : (
            <div
              role="listbox"
              aria-label={t('addPlayers.recentSection')}
              className="flex max-h-64 flex-wrap content-start gap-2 overflow-y-auto"
            >
              {recentNames.map((name) => (
                <SelectionChip
                  key={name}
                  label={name}
                  selected={isSelectedGuest(name)}
                  onClick={() => toggleGuest(name)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <TextField
            aria-label={t('addPlayers.newNamePlaceholder')}
            placeholder={t('addPlayers.newNamePlaceholder')}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={handleNewNameKeyDown}
          />
          <Button variant="secondary" onClick={addNewName} disabled={!newName.trim()}>
            {t('addPlayers.addToList')}
          </Button>
        </div>

        <Button variant="primary" fullWidth disabled={selected.length === 0} onClick={handleCommit}>
          {t('addPlayers.commit', { count: selected.length })}
        </Button>
      </div>
    </BottomSheet>
  );
}
