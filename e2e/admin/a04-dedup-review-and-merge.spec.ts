import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('A04：疑似重複案件審核與合併（Deduplication Review）', () => {
  test('檢視重複審核佇列、點開疑似重複配對進行雙欄比對並通過無障礙檢測', async ({
    page,
    tutorial,
  }) => {
    tutorial.init({
      id: 'A04-admin-dedup-review',
      title: '管理後台：重複案件審核與合併',
      subtitle: '比對系統自動標記的疑似重複任務單，逐欄選擇保留資料並完成合併',
      surface: 'admin',
    });

    await page.goto('/login');
    await tutorial.loginWithCredentials('asuper01@mock.test');

    const auditLink = page
      .getByRole('navigation', { name: '管理平台導覽' })
      .getByRole('link', { name: '重複審核' });
    await tutorial.step({
      title: '點擊側邊欄「重複審核」進入審核佇列',
      subtitle: '超級管理員與資料稽核員可從側邊欄開啟重複審核，檢視疑似重複配對卡片。',
      target: auditLink,
      action: async () => {
        await auditLink.click();
      },
    });
    await expect(page).toHaveURL(/\/audit/);
    await tutorial.checkA11y('管理後台重複審核頁面');

    const reviewBtn = page.getByRole('button', { name: /檢視|比對|審核/ }).first();
    if ((await reviewBtn.count()) > 0) {
      await tutorial.step({
        title: '點開配對卡片進入雙欄比對頁',
        subtitle: '逐欄比較 A 單與 B 單的地點、聯絡人與需求明細，決定要合併或標記為不同案件。',
        target: reviewBtn,
        action: async () => {
          await reviewBtn.click();
        },
      });
      await tutorial.checkA11y('重複審核雙欄比對頁面');
    }
  });
});
