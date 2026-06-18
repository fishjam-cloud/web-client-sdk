import { describe, expect, test } from 'vitest';

import { AUTH_ERROR_REASONS, isAuthError, normalizeCloseReason } from '../auth';

describe('isAuthError', () => {
  test.each(AUTH_ERROR_REASONS)('matches exact reason "%s"', (reason) => {
    expect(isAuthError(reason)).toBe(true);
  });

  test('does not match unrelated error', () => {
    expect(isAuthError('something else')).toBe(false);
  });

  test('does not match empty string', () => {
    expect(isAuthError('')).toBe(false);
  });
});

describe('normalizeCloseReason + isAuthError', () => {
  test('matches "Invalid token" after normalization', () => {
    expect(isAuthError(normalizeCloseReason('Invalid token'))).toBe(true);
  });

  test('matches "INVALID TOKEN" after normalization', () => {
    expect(isAuthError(normalizeCloseReason('INVALID TOKEN'))).toBe(true);
  });

  test('matches "Expired Token" after normalization', () => {
    expect(isAuthError(normalizeCloseReason('Expired Token'))).toBe(true);
  });

  test('matches "Room Not Found" after normalization', () => {
    expect(isAuthError(normalizeCloseReason('Room Not Found'))).toBe(true);
  });

  test('matches reason with leading/trailing whitespace', () => {
    expect(isAuthError(normalizeCloseReason('  invalid token  '))).toBe(true);
  });

  test('does not match unrelated error after normalization', () => {
    expect(isAuthError(normalizeCloseReason('something else'))).toBe(false);
  });
});
