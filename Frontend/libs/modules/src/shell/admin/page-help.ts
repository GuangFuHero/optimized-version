/**
 * 這一頁怎麼用 in the back office (prototype `Design/後台/js/shared/wg-help.jsx`): what each page is
 * for, in one place, as the site's (`shell/site/page-help`). A page without an entry gets no ？.
 *
 * Each line says what the page does now, not what the prototype draws, since a reader checks it
 * against the buttons in front of them: a line naming a button they do not have reads as a broken
 * page or a wrong account.
 *
 * Left out until the page they describe is in: 互助地圖 (its areas), 重複審核, 成員與權限 —
 * the prototype has their words. The 權限 tables follow the permissions as decided, which the
 * backend is still being brought up to; ask before matching them to its grants instead.
 */

import type {
  PageHelp,
  PagePermissions,
  PermissionMark,
} from '../site/page-help/page-help';

/** Every identity's row, in the account menu's groups; marks follow the page's `actions`. */
function identityGroups(
  govAdmin: readonly PermissionMark[],
  govMember: readonly PermissionMark[],
  ngoAdmin: readonly PermissionMark[],
  ngoMember: readonly PermissionMark[],
  auditor: readonly PermissionMark[],
): PagePermissions['groups'] {
  return [
    {
      title: '政府',
      rows: [
        ['管理員', govAdmin],
        ['成員', govMember],
      ],
    },
    {
      title: '非政府組織',
      rows: [
        ['管理員', ngoAdmin],
        ['成員', ngoMember],
      ],
    },
    { title: '平台身分', rows: [['資料檢核員', auditor]] },
  ];
}

const Y = 'all';
const O = 'own';
const N = 'none';

const ASK_FOR_ACCESS =
  '無法使用某項功能，表示目前身份暫無權限，請找團隊管理員或超級管理員。';

/** Keyed by the page's path, as the nav's items are (`nav.ts`). */
export const ADMIN_PAGE_HELP: Partial<Record<string, PageHelp>> = {
  '/dashboard': {
    title: '總覽儀表板',
    what: '綜觀任務需求、志工媒合、資源站點數量、類型及趨勢，掌握即時熱點與仍需協助區域。',
    can: [],
  },
  '/tickets': {
    title: '任務管理',
    what: '集中管理求助任務單，一張單可含多筆需求。所有後台人員都能查看。',
    can: [
      '搜尋、篩選及查看任務',
      '新增或處理求助任務',
      '更新任務內容及進度',
      '從「新增任務 ▾」匯入多張任務',
    ],
    sections: [
      {
        title: '開啟空間',
        body: '同棟大樓多人求助時，可在地圖建立空間，填名稱與地上、地下樓層數（自動加頂樓 RF）。可查看各樓層需求、編輯或刪除，不影響任務單。任務單寫 RF 或「頂樓」都歸入頂樓。',
      },
    ],
    // As decided: 責任區 go to NGO teams only, so an NGO team works the tickets inside its own; the
    // 政府隊's members import, export and open spaces as its admins do. Import and export: super
    // admins, the 政府隊 and NGO admins only — not NGO members, not data auditors. An NGO admin's
    // import adds tickets anywhere but updates only those inside; the footnote says the second half.
    // A member's ✕ under 刪除 is about others' tickets: deleting the one they created goes without
    // saying.
    permissions: {
      actions: ['新增', '修改', '刪除', '匯入', '匯出', '開啟空間'],
      own: '本隊責任區',
      footnote: '匯入更新既有任務只限本隊責任區。',
      groups: identityGroups(
        [Y, Y, Y, Y, Y, Y],
        [Y, Y, N, Y, Y, Y],
        [Y, O, O, Y, O, N],
        [Y, O, N, N, N, N],
        [N, N, N, N, N, N],
      ),
    },
    note: `${ASK_FOR_ACCESS}沒有責任區時，請找政府隊指派。`,
  },
  '/stations': {
    title: '資源站點管理',
    what: '管理加水、避難、醫療、物資等資源站點。所有後台人員都能查看。',
    can: [
      '新增、編輯站點及營運狀態',
      '審核民眾修改建議，已採用可撤銷',
      '指派站點給負責團隊',
      '從「新增站點 ▾」匯入多個站點',
    ],
    sections: [
      {
        title: '個別指派',
        body: '在列表「指派團隊」欄逐一指定。指派後，該團隊可編輯站點、審核修改建議。',
      },
    ],
    // As decided: the 政府隊's members review every station's suggestions too; only its admins
    // delete any station. An NGO admin's import adds stations anywhere but updates only its own, as the
    // footnote says; it exports only its own.
    permissions: {
      actions: ['新增', '編輯', '刪除', '指派', '審核', '撤銷', '匯入', '匯出'],
      own: '本隊站點',
      footnote: '匯入更新既有站點只限本隊站點。',
      groups: identityGroups(
        [Y, Y, Y, Y, Y, N, Y, Y],
        [Y, Y, N, Y, Y, N, Y, Y],
        [Y, O, O, N, O, N, Y, O],
        [Y, O, N, N, N, N, N, N],
        [N, N, N, N, Y, Y, N, N],
      ),
    },
    note: ASK_FOR_ACCESS,
  },
  '/announcements': {
    title: '緊急公告',
    what: '發布紅色公告，顯示在每一頁最上方。',
    can: ['對前台（民眾與志工）或後台發布', '隨時關閉公告', '查看過去公告'],
    note: '限超級管理員發布。送出後所有人都看得到，請先確認內容。',
  },
  '/briefings': {
    title: '志工行前資訊',
    what: '志工出發前須知：如何參與、交通、攜帶物品、注意事項。',
    can: ['發布到前台或下架', '查看過去版本'],
    note: '前台一次只顯示一份，發布新版會取代舊版。',
  },
  '/teams': {
    title: '團隊',
    what: '管理自己團隊的成員，也找得到其他團隊的管理員。',
    can: [
      '查看各隊管理員的電話與 Email',
      '管理自己團隊的成員',
      '審核加入團隊的申請',
    ],
    note: '只有團隊管理員與超級管理員看得到這一頁。',
  },
  '/settings': {
    title: '設定',
    what: '設定這次災害基本資料。',
    can: [
      '修改災害名稱、簡稱與起始時間',
      '設定地圖預設位置：第一次開地圖停在災區，之後停在各自上次位置（未設定顯示全台）',
      '選擇這次災害類型',
    ],
    note: '限超級管理員修改。',
  },
};

/** The page an address is on, by its first segment: `/tickets?id=…` is 任務管理. */
export function adminPageHelpKey(pathname: string): string | null {
  const key = `/${pathname.split('/')[1] ?? ''}`;

  return ADMIN_PAGE_HELP[key] ? key : null;
}
