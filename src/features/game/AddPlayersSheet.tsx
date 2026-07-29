import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@components/BottomSheet';
import { SelectionChip } from '@components/SelectionChip';
import { Button } from '@components/shared/Button';
import { TextField } from '@components/shared/TextField';

export interface AddPlayersSheetProps {
  open: boolean;
  onClose: () => void;
  onCommit: (names: readonly string[]) => void;
  /**
   * Sorted, most-frequently-played-with first. Stands in for the group
   * quick-add list (04-ux-spec.md#adding-players--the-multi-select-sheet)
   * until step 14 supplies real groups — there is no ◈ marker here because
   * that glyph specifically means group membership, which doesn't exist yet.
   */
  recentNames: readonly string[];
}

/**
 * One component, two entry points (the setup screen and the in-game
 * `+ שחקן` action) per spec — nothing is written to the game until the
 * footer commit, so a mis-tap here costs nothing.
 */
export function AddPlayersSheet({ open, onClose, onCommit, recentNames }: AddPlayersSheetProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [newName, setNewName] = useState('');

  function toggle(name: string): void {
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  function addNewName(): void {
    const trimmed = newName.trim();
    if (!trimmed) return;
    // A typed name matching an existing pick selects it rather than duplicating it.
    setSelected((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
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
    onCommit(selected);
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
              {selected.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className="inline-flex min-h-tap items-center gap-1.5 rounded-lg border-2 border-accent bg-surface-amber-dim px-3.5 text-body font-semibold text-fg"
                >
                  {name}
                  <span aria-hidden="true" className="text-fg-tertiary">
                    {'✕'}
                  </span>
                </button>
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
                  selected={selected.includes(name)}
                  onClick={() => toggle(name)}
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
