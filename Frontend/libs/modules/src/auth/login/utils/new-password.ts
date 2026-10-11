/**
 * The one rule for a password someone sets — on register, reset, change, or a first password on an
 * account that signed up through Google or LINE. Eight characters is the design's number for reset,
 * taken for all four (2026-10-02) so the same password is not turned down in one place and taken
 * in another.
 *
 * Only the browser can hold it: the password is hashed before it leaves (`credentials.ts`), so the
 * backend sees 64 hex characters whatever was typed, and its `min_length=6` only stops a caller that
 * forgot to hash (ADR-166). A shorter password set before stays good: sign-in does not check length.
 */

export const NEW_PASSWORD_MIN_LENGTH = 8;

export const newPasswordText = {
  tooShort: `密碼至少 ${NEW_PASSWORD_MIN_LENGTH} 個字元`,
  mismatch: '兩次輸入的密碼不一樣',
  placeholder: `至少 ${NEW_PASSWORD_MIN_LENGTH} 個字元`,
} as const;

/**
 * The password as it is hashed: without the spaces around it, as sign-in has always sent it. Setting
 * one used to hash the spaces too, so a new password typed with one never signed in.
 */
export function normalizePassword(raw: string): string {
  return raw.trim();
}

/**
 * What is wrong with a new password, or null. Read as it will be hashed, so the spaces around it
 * count for neither the length nor the second entry.
 */
export function newPasswordProblem(
  password: string,
  confirm?: string,
): string | null {
  const normalized = normalizePassword(password);

  if (normalized.length < NEW_PASSWORD_MIN_LENGTH) {
    return newPasswordText.tooShort;
  }

  if (confirm !== undefined && normalizePassword(confirm) !== normalized) {
    return newPasswordText.mismatch;
  }

  return null;
}

/**
 * The same rule, said under the field it is about: a short password under the first, a second entry
 * that differs under the second (design `site-auth.jsx` `ResetView`).
 */
export function newPasswordFieldProblems(
  password: string,
  confirm: string,
): { password?: string; confirm?: string } {
  const problem = newPasswordProblem(password, confirm);

  if (!problem) {
    return {};
  }

  return problem === newPasswordText.mismatch
    ? { confirm: problem }
    : { password: problem };
}
