import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInstallPrompt } from './useInstallPrompt';

describe('useInstallPrompt', () => {
  it('cannot install until the browser fires beforeinstallprompt', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it('becomes installable once the event fires, and prevents the default mini-infobar', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = new Event('beforeinstallprompt', { cancelable: true });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.canInstall).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('promptInstall calls the deferred event\'s prompt() and resets canInstall', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt });

    act(() => {
      window.dispatchEvent(event);
    });
    act(() => {
      result.current.promptInstall();
    });

    expect(prompt).toHaveBeenCalledOnce();
    expect(result.current.canInstall).toBe(false);
  });
});
