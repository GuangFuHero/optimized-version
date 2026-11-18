import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('A04：疑似重複案件審核與合併（Deduplication Review）', () => {
  test('檢視重複審核頁面與無障礙結構', async ({ page, tutorial }) => {
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
  });
});
