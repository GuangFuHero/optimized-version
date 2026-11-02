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
 * 政府隊's members importing tickets and reviewing every station's suggestions included.
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
    what: '所有求助任務單都在這裡。一張單可以有多筆需求，各有自己的狀態。',
    can: [
      '查看、搜尋、篩選任務單',
      '建立任務單，或處理民眾從前台送來的求助',
      '派人去處理你責任區內的任務，並更新進度',
    ],
    sections: [
      {
        title: '開啟空間',
        body: '同棟大樓有多人需要協助時，可透過工具列「開啟空間」，在地圖點選建築（自動帶入地址），填寫名稱及地上、地下樓層數，系統會自動新增頂樓 RF。\n\n建立後，空間會與任務單一同顯示於列表及地圖（方形圖釘）。點選可查看各樓層的待協助情況，並編輯空間資訊或刪除（不影響底下任務單）。任務單樓層填寫 RF 或「頂樓」，皆會歸入頂樓。',
      },
      {
        title: '志工缺口',
        // Volunteer numbers count 人力 needs only; 物資 is counted in 筆 on the dashboard.
        body: '上方「志工缺口」只算人力需求還差幾人。物資（便當、水這類東西）不算人數，改在總覽儀表板的「物資需求」看還有幾筆沒人接。',
      },
    ],
    // A ticket belongs to the team whose 責任區 its place is in; there is no handing a ticket to a
    // team by itself.
    roles: [
      ['超級管理員', '全部功能'],
      [
        '政府隊（管理員、成員）',
        '建立任務單；修改、派人處理責任區內的任務；匯入任務單。管理員另外可以開啟空間、匯出',
      ],
      [
        '團隊管理員',
        '建立任務單；修改、刪除、派人處理責任區內的任務；匯入、匯出',
      ],
      ['團隊成員', '建立任務單；修改責任區內的任務'],
      ['資料檢核員', '查看全部任務單與紀錄、匯出、處理重複審核'],
    ],
  },
  '/stations': {
    title: '資源站點管理',
    what: '管理加水、避難、醫療、物資等資源站點。',
    can: [
      '新增或修改站點資料，包含營運狀態',
      '審核民眾從前台送來的修改建議',
      '把站點指派給團隊負責',
      '用表格或地圖檢視；有權限的人可以匯入、匯出',
    ],
    sections: [
      {
        title: '個別指派',
        body: '站點需在列表的「指派 Team」欄逐一指定團隊，無須在地圖圈選。指派後，團隊即可編輯站點及處理修改建議。站點不會因位於團隊責任區內而自動指派。',
      },
    ],
    roles: [
      ['超級管理員', '全部功能，包含撤銷已採用的修改建議'],
      [
        '政府隊（管理員、成員）',
        '新增、編輯所有站點（含營運狀態）；把站點指派給團隊；審核所有站點的修改建議（核准或退回）',
      ],
      ['團隊管理員', '新增站點；編輯、刪除、審核指派給本隊的站點；匯入、匯出'],
      ['團隊成員', '新增站點；編輯指派給本隊的站點'],
      ['資料檢核員', '審核、撤銷所有站點的修改建議；匯出'],
    ],
    note: '所有後台人員都可以查看站點。',
  },
  '/announcements': {
    title: '緊急公告',
    what: '發布會出現在每一頁最上方的紅色公告。',
    can: [
      '分別對前台（民眾與志工）或後台發布',
      '隨時關閉公告',
      '查看以前發過的公告',
    ],
    note: '只有超級管理員可以發布。公告沒有關閉鈕，發出去所有人都會看到，請確認內容再送出。',
  },
  '/briefings': {
    title: '志工行前資訊',
    what: '志工出發前要看的內容：怎麼參與、怎麼到、要帶什麼、要注意什麼。',
    can: ['從範本開始編寫', '發布到前台，或從前台下架', '查看以前發布過的版本'],
    note: '前台一次只會有一份。發布新版本會直接取代舊的。',
  },
  '/settings': {
    title: '設定',
    what: '這次災害的基本資料、地圖預設位置、這次用到哪幾種災害，都在這一頁設定。',
    can: [
      '改災害名稱、簡稱與起始時間',
      '設定地圖預設位置：前台與後台的地圖第一次打開就停在災區，之後停在每個人自己上次看的地方（沒設定會顯示全台）',
      '選這次用到哪幾種災害',
    ],
    note: '所有後台人員都看得到這一頁，只有超級管理員可以修改。改了之後所有人的畫面都會跟著變。',
  },
};

/** The page an address is on, by its first segment: `/tickets?id=…` is 任務管理. */
export function adminPageHelpKey(pathname: string): string | null {
  const key = `/${pathname.split('/')[1] ?? ''}`;

  return ADMIN_PAGE_HELP[key] ? key : null;
}
