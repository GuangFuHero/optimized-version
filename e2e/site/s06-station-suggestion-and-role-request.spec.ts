import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('S06：回報資源站點修改建議＆申請成為後台團隊人員', () => {
  test('一般志工點擊「申請管理權限」開啟角色申請抽屜並進行無障礙檢測', async ({ page, tutorial }) => {
    tutorial.init({
      id: 'S06-role-request-and-suggestion',
      title: '申請成為後台管理人員與回報站點更新',
      subtitle: '救災團隊或地方政府人員可直接在線上提交角色與所屬團隊申請',
      surface: 'site',
    });

    await page.goto('/login');
    await tutorial.loginWithCredentials('avol03@mock.test');
    await expect(page).toHaveURL(/\/(map|list)/);

    const applyBtn = page.getByRole('button', { name: '申請管理權限' }).first();
    await tutorial.step({
      title: '點擊頂部導覽列「申請管理權限」',
      subtitle: '尚未具備後台身分的使用者，可點擊「申請管理權限」打開申請表單抽屜。',
      target: applyBtn,
      action: async () => {
        await applyBtn.click();
      },
    });

    const drawerDialog = page.getByRole('dialog');
    await expect(drawerDialog).toBeVisible();
    await tutorial.checkA11y('申請管理權限抽屜');

    const closeBtn = drawerDialog.getByRole('button', { name: /取消|關閉/ }).first();
    await tutorial.step({
      title: '填寫角色與團隊資訊後送出或關閉',
      subtitle: '選擇欲申請的角色與所屬團隊並完成手機驗證即可送出；此處示範關閉抽屜。',
      target: closeBtn,
      action: async () => {
        await closeBtn.click();
      },
    });
  });
});
