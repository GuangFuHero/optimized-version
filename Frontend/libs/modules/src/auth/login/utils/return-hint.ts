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

/** The line under the card, or null when no page is waiting for the sign-in. */
export function returnHint(callbackUrl: string | null): string | null {
  if (!callbackUrl) {
    return null;
  }

  // next-auth sometimes hands on a whole address rather than a path.
  const { pathname } = new URL(callbackUrl, 'http://localhost');

  if (isUnder(pathname, '/map')) {
    return `${HINT_PREFIX}，地圖的位置與篩選都會保留。`;
  }

  if (isUnder(pathname, '/list')) {
    return `${HINT_PREFIX}，篩選都會保留。`;
  }

  return `${HINT_PREFIX}。`;
}

/**
 * Said once signed in, while the page goes on. With no page to go back to the sign-in ends on the
 * map, so it says that instead of the design's 「回到你剛剛那一頁」.
 */
export function signedInMessage(callbackUrl: string | null): string {
  return callbackUrl
    ? '登入成功，正在回到你剛剛那一頁⋯'
    : '登入成功，正在前往地圖⋯';
}
