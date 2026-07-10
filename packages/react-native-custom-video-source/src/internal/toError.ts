/** Coerce an unknown thrown value into an Error, leaving real Errors untouched. */
export function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
