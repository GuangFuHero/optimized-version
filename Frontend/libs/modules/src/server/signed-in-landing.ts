import {
  currentUserFromBackendAsync,
  NO_BACK_OFFICE_IDENTITY,
  READ_IN_BROWSER,
} from './current-user';

/**
 * Where the site's sign-in lands when no page asked for one — password, Google and LINE alike:
 * the back office for whoever holds an identity there, the map for everyone else (design
 * `site-auth.js:62-103`, decided 2026-09-27). A page that asked wins, as the login form sees to:
 * the person was in the middle of something there.
 *
 * Asked as the back office asks (`(portal)/layout.tsx`): the backend answers an account with nothing
 * besides `user` with a 403 (ADR-329), so nobody is sent there only to be told they have no access.
 * `/admin` goes on to the back office through the site's redirect (`next.config.js`), as
 * 前往管理平台 does. Any doubt — a guest, a token only the browser can refresh, the backend out of
 * reach — lands on the map, which works for everyone.
 */
export async function signedInLandingAsync(
  cookieHeader: string | null,
): Promise<'/admin' | '/map'> {
  try {
    const user = await currentUserFromBackendAsync(cookieHeader, 'admin');
    return user && user !== READ_IN_BROWSER && user !== NO_BACK_OFFICE_IDENTITY
      ? '/admin'
      : '/map';
  } catch {
    return '/map';
  }
}
