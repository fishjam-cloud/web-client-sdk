/**
 * Base class of every error thrown by the SDK.
 *
 *
 * When the SDK wraps a platform failure (for example a `DOMException` from the
 * browser), the original error is available on `cause`.
 */
export class FishjamError extends Error {
    constructor(message, options) {
        super(message, options);
    }
}
