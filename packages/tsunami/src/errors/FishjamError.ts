/** Possible values of {@link FishjamError.recoverability}. */
export type ErrorRecoverability = "retry" | "user_action" | "fatal";

/**
 * Base class of every error thrown by the SDK.
 *
 * Use it to tell SDK failures apart from other errors, then narrow to a
 * specific error class when a case needs dedicated handling:
 *
 * ```typescript
 * try {
 *   await client.connect(config);
 * } catch (error) {
 *   if (error instanceof FishjamError) {
 *     showErrorBanner(error.message);
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 *
 * When the SDK wraps a platform failure (for example a `DOMException` from the
 * browser), the original error is available on `cause`.
 */
export abstract class FishjamError extends Error {
  /**
   * Hints how your application can respond to this error:
   * - `"retry"` — the same operation may succeed if attempted again.
   * - `"user_action"` — ask the user to fix something first, for example grant
   *   a permission, free up the device, or sign in again.
   * - `"fatal"` — the operation cannot succeed; do not retry.
   */
  public abstract readonly recoverability: ErrorRecoverability;

  protected constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
