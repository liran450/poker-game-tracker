import { describe, expect, it } from 'vitest';
import { looksLikeAuthCallback } from './authCallback';

describe('looksLikeAuthCallback', () => {
  it('is true for a magic-link/OAuth token fragment', () => {
    expect(looksLikeAuthCallback('#access_token=abc&refresh_token=def&type=magiclink')).toBe(true);
  });

  it('is true for an auth error fragment', () => {
    expect(looksLikeAuthCallback('#error=access_denied&error_code=otp_expired&error_description=x')).toBe(
      true,
    );
  });

  it('is false for a normal app route', () => {
    expect(looksLikeAuthCallback('#/account')).toBe(false);
  });

  it('is false for an empty hash', () => {
    expect(looksLikeAuthCallback('')).toBe(false);
  });
});
