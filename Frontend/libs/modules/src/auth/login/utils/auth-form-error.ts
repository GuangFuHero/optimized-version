/**
 * Error whose message is safe to show the user verbatim.
 *
 * The form swallows every other error behind a generic message so raw backend/network text never
 * reaches the UI. Throw this from `onSubmitAsync` when the caller has already turned a failure into
 * user-facing copy.
 */
export class AuthFormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthFormError';
  }
}
