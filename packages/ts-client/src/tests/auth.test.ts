import { describe, expect, test } from 'vitest';

import { AUTH_ERROR_REASONS, isAuthError } from '../auth';

describe('isAuthError', () => {
  test.each(AUTH_ERROR_REASONS)('matches exact lowercase reason "%s"', (reason) => {
    expect(isAuthError(reason)).toBe(true);
  });

  test('matches "Invalid token" with capital I (server casing)', () => {
    expect(isAuthError('Invalid token')).toBe(true);
  });

  test('matches "INVALID TOKEN" (all caps)', () => {
    expect(isAuthError('INVALID TOKEN')).toBe(true);
  });

  test('matches "Expired Token" (mixed case)', () => {
    expect(isAuthError('Expired Token')).toBe(true);
  });

  test('matches "Room Not Found" (mixed case)', () => {
    expect(isAuthError('Room Not Found')).toBe(true);
  });

  test('matches reason with leading/trailing whitespace', () => {
    expect(isAuthError('  invalid token  ')).toBe(true);
  });

  test('does not match unrelated error', () => {
    expect(isAuthError('something else')).toBe(false);
  });

  test('does not match empty string', () => {
    expect(isAuthError('')).toBe(false);
  });
});
