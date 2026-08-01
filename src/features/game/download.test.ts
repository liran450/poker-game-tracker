import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadJson } from './download';

describe('downloadJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an object URL for the serialized payload and clicks a download anchor', () => {
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob;
      return 'blob:mock-url';
    });
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJson('poker-game-2026-08-01-abcd1234.json', { hello: 'world' });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
