/**
 * 這一頁怎麼用 (prototype `Design/前台/js/shared/wg-help.jsx`; spec S9): what each page of the site
 * is for, kept in one place so the words change here and nowhere else. A page without an entry
 * gets no ？ at all.
 */

export type SitePageHelpKey = 'site:map' | 'site:list';

export interface PageHelp {
  title: string;
  /** One sentence: what the page is for. */
  what: string;
  /** 你可以 — what a person can do here. */
  can: readonly string[];
  /** 注意, in a grey box at the foot. */
  note?: string;
}

/**
 * The designer's drafts (`wg-help.jsx:101-115`), read against the site as it is and approved by the
 * team on 2026-10-01: 在這裡新增 and 「＋」 came after the drafts, and a guest is kept from a
 * ticket's address and photos as well as its point (backend ADR-281), on the list too.
 * 回報站點資訊有誤 is left out until flow E sends a station correction to the server (#57).
 */
export const SITE_PAGE_HELP: Record<SitePageHelpKey, PageHelp> = {
  'site:map': {
    title: '地圖',
    what: '看附近有哪些資源站點，以及哪裡有人需要幫忙。',
    can: [
      '切換「站點」與「任務」，點圖示看詳細資訊',
      '需要幫忙時，按「請求協助」；也可以先點地圖上的位置，再按「在這裡新增」',
      '登入後可以承接任務',
      '登入後也可以按地圖上的「＋」新增站點',
    ],
    note: '沒有登入時，任務的位置會用格子顯示，也看不到地址與照片，保護求助者的隱私。',
  },
  'site:list': {
    title: '列表',
    what: '用清單的方式看資源站點與求助任務，適合搜尋與比較。',
    can: ['搜尋、篩選站點或任務', '點一筆看詳細資訊', '登入後可以承接任務'],
    note: '沒有登入時，看不到任務的地址與照片，保護求助者的隱私。',
  },
};

/** The page an address is on, if it has words of its own: 行前資訊 and the account pages do not. */
export function pageHelpKey(pathname: string): SitePageHelpKey | null {
  if (/^\/map(\/|$)/.test(pathname)) {
    return 'site:map';
  }

  return /^\/list(\/|$)/.test(pathname) ? 'site:list' : null;
}

/** The parts of `Storage` the marks use: `localStorage` on the site, a stand-in in tests. */
export type SeenStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** On this device, which pages' help was opened: `{ "site:map": 1, … }`. */
export const PAGE_HELP_SEEN_KEY = 'wg:page-help-seen';

/** Null where the browser will not hand it over (site data blocked); reading it can throw. */
export function localSeenStorage(): SeenStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readSeen(storage: SeenStorage | null): Record<string, unknown> {
  try {
    const seen: unknown = JSON.parse(
      storage?.getItem(PAGE_HELP_SEEN_KEY) ?? '{}',
    );

    return typeof seen === 'object' && seen !== null
      ? (seen as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** False when it cannot be read: the dot then stays, which only means it shows once too often. */
export function hasSeenPageHelp(
  storage: SeenStorage | null,
  key: SitePageHelpKey,
): boolean {
  return readSeen(storage)[key] === 1;
}

export function markPageHelpSeen(
  storage: SeenStorage | null,
  key: SitePageHelpKey,
): void {
  try {
    storage?.setItem(
      PAGE_HELP_SEEN_KEY,
      JSON.stringify({ ...readSeen(storage), [key]: 1 }),
    );
  } catch {
    // Not kept, then: the dot comes back on the next visit.
  }
}
