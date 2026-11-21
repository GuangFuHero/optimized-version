/**
 * What the sign-in pages say about where signing in leads (design `site-auth.jsx`). The page to come
 * back to is `?callbackUrl=`; the map and the list keep their place and filters in it, so those two
 * can promise that much — anywhere else, only the page.
 */

const HINT_PREFIX = '登入完成後會回到你剛剛那一頁';

/** Whether `pathname` is `section` or a page under it — `/mapping` is not the map. */
function isUnder(pathname: string, section: string): boolean {
  return pathname === section || pathname.startsWith(`${section}/`);
}

/** Where `callbackUrl` points, or null when it cannot be read as an address. */
function callbackPath(callbackUrl: string): string | null {
  try {
    // next-auth sometimes hands on a whole address rather than a path.
    return new URL(callbackUrl, 'http://localhost').pathname;
  } catch {
    return null;
  }
}

/**
 * The line under the card, or null when no page is waiting for the sign-in. A `callbackUrl` that is
 * not an address (anyone can type one into the bar) gets no line, and the page still signs in.
 */
export function returnHint(callbackUrl: string | null): string | null {
  const pathname = callbackUrl ? callbackPath(callbackUrl) : null;

  if (pathname === null) {
    return null;
  }

  if (isUnder(pathname, '/map')) {
    return `${HINT_PREFIX}，地圖的位置與篩選都會保留。`;
  }

  if (isUnder(pathname, '/list')) {
    return `${HINT_PREFIX}，篩選都會保留。`;
  }

  return `${HINT_PREFIX}。`;
}

/**
 * Said once signed in, while the page goes on. With no page to go back to, the back office's sign-in
 * ends on its dashboard. The site's ends in the back office or on the map, by who signed in
 * (`signedInLandingAsync`), which is not known yet here, so it names neither. The design tells only
 * those with an identity 「你有管理平台的身份」; said to everyone, ordinary accounts would see the
 * platform's name, which they never do (design `更新說明.md` D-2).
 */
export function signedInMessage(
  callbackUrl: string | null,
  app: 'site' | 'admin',
): string {
  if (callbackUrl) return '登入成功，正在回到你剛剛那一頁⋯';
  return app === 'admin'
    ? '登入成功，正在前往總覽儀表板⋯'
    : '登入成功，正在帶你過去⋯';
}
