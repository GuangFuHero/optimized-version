/**
 * 這一頁怎麼用 in the back office (prototype `Design/後台/js/shared/wg-help.jsx`): what each page is
 * for, in one place, as the site's (`shell/site/page-help`). A page without an entry gets no ？.
 *
 * Each line says what the page does now, not what the prototype draws, since a reader checks it
 * against the buttons in front of them: a line naming a button they do not have reads as a broken
 * page or a wrong account.
 *
 * Left out until the page they describe is in: 互助地圖 (its areas), 重複審核, 團隊, 成員與權限 —
 * the prototype has their words. The 誰可以做什麼 tables follow the permissions as decided, the
 * 政府隊's members holding what its admins hold here, as BE-RBAC-3 has it.
 */

import type { PageHelp } from '../site/page-help/page-help';

/** Keyed by the page's path, as the nav's items are (`nav.ts`). */
export const ADMIN_PAGE_HELP: Partial<Record<string, PageHelp>> = {
  '/dashboard': {
    title: '總覽儀表板',
    what: '藉由儀表板綜觀任務需求、志工媒合、資源站點的數量、類型及趨勢變化，了解即時熱點及尚需協助的區域。',
    can: [],
  },
  '/tickets': {
    title: '任務管理',
    what: '集中管理求助任務單，每張單可包含多筆獨立需求。',
    can: [
      '搜尋、篩選、查看任務',
      '建立或處理民眾提交的求助',
      '派人處理並更新任務進度',
    ],
    sections: [
      {
        title: '開啟空間',
        body: '同棟大樓多人求助時，可在地圖建立空間，填寫名稱及地上、地下樓層數（系統自動新增頂樓 RF）。可查看樓層需求、編輯或刪除（不影響任務單）。任務單填寫 RF 或「頂樓」皆會歸入頂樓。',
      },
    ],
    // As decided (BE-RBAC-3, B3): the 政府隊's members import, export and open spaces as its admins do;
    // NGO members do not. 責任區 go to NGO teams only.
    roles: [
      ['超級管理員', '全部功能'],
      ['政府隊（管理員、成員）', '建立、修改、匯入、匯出、開啟空間'],
      ['非政府組織隊管理員', '建立、修改、匯入、匯出'],
      ['非政府組織隊成員', '建立、修改'],
      ['資料檢核員', '查看全部任務與紀錄、匯出、重複審核'],
    ],
  },
  '/stations': {
    title: '資源站點管理',
    what: '管理加水、避難、醫療、物資等資源站點。',
    can: [
      '新增、編輯站點及營運狀態',
      '審核民眾提交的修改建議',
      '依權限指派站點給負責團隊',
      '依權限匯入、匯出',
    ],
    sections: [
      {
        title: '個別指派',
        body: '在列表「指派 Team」欄逐一指定團隊。指派後，團隊可編輯站點及處理修改建議，不會依責任區自動指派。',
      },
    ],
    // As decided: the 政府隊's members review every station's suggestions too.
    roles: [
      ['超級管理員', '全部功能'],
      [
        '政府隊（管理員、成員）',
        '新增、編輯站點、指派團隊、審核全部站點的修改建議；匯入、匯出',
      ],
      ['非政府組織隊管理員', '新增站點、編輯／刪除／審核本隊站點；匯入、匯出'],
      ['非政府組織隊成員', '新增站點、編輯本隊站點'],
      ['資料檢核員', '審核、撤銷所有修改建議；匯出'],
    ],
    note: '所有後台人員皆可查看站點。',
  },
  '/announcements': {
    title: '緊急公告',
    what: '發布會出現在每一頁最上方的紅色公告。',
    can: [
      '分別對前台（民眾與志工）或後台發布',
      '超級管理員可以隨時關閉公告',
      '查看以前發過的公告',
    ],
    note: '只有超級管理員可以發布。發出去所有人都會看到，請確認內容再送出。',
  },
  '/briefings': {
    title: '志工行前資訊',
    what: '志工出發前要看的內容：怎麼參與、怎麼到、要帶什麼、要注意什麼。',
    can: ['發布到前台，或從前台下架', '查看以前發布過的版本'],
    note: '前台一次只會有一份。發布新版本會直接取代舊的。',
  },
  '/settings': {
    title: '設定',
    what: '這次災害的基本資料都在這一頁設定。',
    can: [
      '改災害名稱、簡稱與起始時間',
      '設定地圖預設位置：前台與後台的地圖第一次打開就停在災區，之後停在每個人自己上次看的地方（沒設定會顯示全台）',
      '選這次用到哪幾種災害',
    ],
    note: '只有超級管理員可以修改。',
  },
};

/** The page an address is on, by its first segment: `/tickets?id=…` is 任務管理. */
export function adminPageHelpKey(pathname: string): string | null {
  const key = `/${pathname.split('/')[1] ?? ''}`;

  return ADMIN_PAGE_HELP[key] ? key : null;
}
