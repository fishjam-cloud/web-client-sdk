export const AUTH_ERROR_REASONS = [
  'missing token',
  'invalid token',
  'expired token',
  'room not found',
  'peer not found',
  'peer already connected',
] as const;

export type AuthErrorReason = (typeof AUTH_ERROR_REASONS)[number];

export const isAuthError = (error: string): error is AuthErrorReason =>
  AUTH_ERROR_REASONS.includes(error as AuthErrorReason);
