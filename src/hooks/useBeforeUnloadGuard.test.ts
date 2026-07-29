import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBeforeUnloadGuard } from './useBeforeUnloadGuard';

describe('useBeforeUnloadGuard', () => {
  it('prevents unload and sets returnValue when there are pending changes', () => {
    renderHook(() => useBeforeUnloadGuard(true));

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    // Per spec, `returnValue`'s getter always reflects the cancelled flag as a
    // boolean — assigning a falsy string (the historical idiom) cancels the
    // event, and reading it back yields `false`, not the assigned string.
    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe(false);
  });

  it('does nothing when there are no pending changes', () => {
    renderHook(() => useBeforeUnloadGuard(false));

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('stops guarding once pending changes clear', () => {
    const { rerender } = renderHook(({ pending }) => useBeforeUnloadGuard(pending), {
      initialProps: { pending: true },
    });
    rerender({ pending: false });

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
