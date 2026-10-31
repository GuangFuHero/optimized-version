/**
 * 這一頁怎麼用 (prototype `Design/前台/js/shared/wg-help.jsx`): what each page of the site
 * is for, kept in one place so the words change here and nowhere else. A page without an entry
 * gets no ？ at all.
 */

export type SitePageHelpKey = 'site:map' | 'site:list' | 'site:briefing';

/** A titled part between 你可以 and 注意: a paragraph, a list, or both. */
export interface PageHelpSection {
  title: string;
  body?: string;
  items?: readonly string[];
}

/** Any of its text may set words in bold between `**`, as the prototype's `rich` does. */
export interface PageHelp {
  title: string;
  /** One sentence: what the page is for. */
  what: string;
  /** 你可以 — what a person can do here. */
  can: readonly string[];
  sections?: readonly PageHelpSection[];
  /** 注意, in a grey box at the foot. */
  note?: string;
}

/**
 * The designer's words (`wg-help.jsx:133-148`), as 糖 lined them up with Carol's in Notion
 * (prototype `27edcb9a`, 2026-10-31). 在這裡新增, and a guest kept from a ticket's address and photos
 * (backend ADR-281), were here already (team, 2026-10-01); 回報站點資訊有誤 now reads 對站點提出修改建議,
 * as the station detail's button does.
 */
export const SITE_PAGE_HELP: Record<SitePageHelpKey, PageHelp> = {
  'site:map': {
    title: '地圖',
    what: '看附近有哪些資源站點，以及哪裡有人需要幫忙。',
    can: [
      '切換「站點」與「任務」，點圖示看詳細資訊',
      '需要幫忙時，按「請求協助」；也可以先點地圖上的位置，再按「在這裡新增」',
      '登入後可以承接任務，或對站點提出修改建議',
    ],
    note: '沒有登入時，任務的位置會用格子顯示，也看不到地址與照片，保護求助者的隱私。',
  },
  'site:list': {
    title: '列表',
    what: '用清單的方式看資源站點與求助任務，適合搜尋與比較。',
    can: [
      '搜尋、篩選站點或任務',
      '點一筆看詳細資訊',
      '登入後可以承接任務，或對站點提出修改建議',
    ],
    note: '沒有登入時，看不到任務的地址與照片，保護求助者的隱私。',
  },
  // The designer's draft as it stands (`wg-help.jsx:149-153`), not yet read by the team.
  'site:briefing': {
    title: '志工行前資訊',
    what: '出發當志工之前，先看這一頁。',
    can: [
      '了解怎麼參與、交通方式與注意事項',
      '勾選打包清單（只存在這台裝置）',
      '列印帶在身上',
    ],
  },
};

/** A stretch of help text, bold or not. */
export interface HelpTextRun {
  text: string;
  bold: boolean;
}

/**
 * Help text split where `**` marks bold, as the prototype's `rich` splits it: every other stretch is
 * bold, so a mark left open runs bold to the end.
 */
export function helpTextRuns(text: string): HelpTextRun[] {
  return text
    .split('**')
    .map((part, index) => ({ text: part, bold: index % 2 === 1 }))
    .filter((run) => run.text !== '');
}

/** As wide as the prototype's panel: 400 when a section holds a list, 340 otherwise. */
export function pageHelpWidth(help: PageHelp): number {
  return help.sections?.some((section) => section.items?.length) ? 400 : 340;
}

/** The page an address is on, if it has words of its own: the account pages do not. */
export function pageHelpKey(pathname: string): SitePageHelpKey | null {
  if (/^\/map(\/|$)/.test(pathname)) {
    return 'site:map';
  }
  if (/^\/list(\/|$)/.test(pathname)) {
    return 'site:list';
  }

  return pathname === '/briefing' ? 'site:briefing' : null;
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
