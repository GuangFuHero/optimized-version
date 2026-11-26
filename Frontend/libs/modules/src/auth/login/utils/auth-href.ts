// SPDX-License-Identifier: GPL-3.0-only
import {
  withQuery,
  type SiteHref,
  type SITE_PATHS,
} from '../../../route/paths';
import type { AuthIdentityType } from './identity-validation';

/** The pages a sign-in can pass through on its way back to where it started. */
export type AuthPage = (typeof SITE_PATHS)[
  | 'login'
  | 'register'
  | 'forgotPassword'
  | 'resetPassword'];

/**
 * A link between the sign-in pages that keeps `?callbackUrl=` — the page the sign-in should end on —
 * whichever way the person goes: to register, or through a forgotten password and back. A's
 * 「登入後接」 and B's 請求協助 put the ticket, the claim and the help form in it; dropping it on
 * the way sent them to a bare `/map`. The reset page also needs the
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
): SiteHref {
  const query = new URLSearchParams();

  if (identity) {
    query.set('type', identity.type);
    query.set('value', identity.value);
  }

  if (callbackUrl) {
    query.set('callbackUrl', callbackUrl);
  }

  return withQuery(page, query);
}
