import type { AuthIdentityType } from './identity-validation';

/** The pages a sign-in can pass through on its way back to where it started. */
export type AuthPage =
  | '/login'
  | '/register'
  | '/forgot-password'
  | '/reset-password';

/**
 * A link between the sign-in pages that keeps `?callbackUrl=` — the page the sign-in should end on —
 * whichever way the person goes: to register, or through a forgotten password and back. A's
 * 「登入後接」 and B's 請求協助 put the ticket, the claim and the help form in it; dropping it on
 * the way sent them to a bare `/map` (`note/login-page-spec.md` Q10). The reset page also needs the
 * account the code went to.
 */
export function authHref(
  page: AuthPage,
  {
    callbackUrl,
    identity,
  }: {
    callbackUrl: string | null;
    identity?: { type: AuthIdentityType; value: string };
  },
): string {
  const query = new URLSearchParams();

  if (identity) {
    query.set('type', identity.type);
    query.set('value', identity.value);
  }

  if (callbackUrl) {
    query.set('callbackUrl', callbackUrl);
  }

  const search = query.toString();

  return search ? `${page}?${search}` : page;
}
