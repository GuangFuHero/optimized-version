import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('S05：志工認領任務、查看「我的任務」與確認視窗', () => {
  test('志工登入後於列表切換任務單、打開案件詳情並開啟承接確認視窗', async ({
    page,
    tutorial,
  }) => {
    tutorial.init({
      id: 'S05-volunteer-claim',
      title: '志工承接任務與管理「我的任務」',
      subtitle: '志工瀏覽招募中的求助案件，確認地點與人數後一鍵承接並管理個人任務清單',
      surface: 'site',
    });

    await page.goto('/login');
    await tutorial.loginWithCredentials('avol03@mock.test');
    await expect(page).toHaveURL(/\/(map|list)/);

    const listNavLink = page
      .getByRole('navigation', { name: '前台模組' })
      .getByRole('link', { name: '列表' });
    await tutorial.step({
      title: '切換至列表檢視招募中的求助任務',
      subtitle: '進入列表模式瀏覽目前急需志工支援的任務單。',
      target: listNavLink,
      action: async () => {
        await listNavLink.click();
      },
    });
    await expect(page).toHaveURL(/\/list/);

    const taskBtn = page
      .getByRole('group', { name: '資料維度' })
      .getByRole('button', { name: '任務' });
    await tutorial.step({
      title: '切換資料維度至「任務」清單',
      subtitle: '篩選出民眾發出的求助任務單，檢視各項人力與物資缺額。',
      target: taskBtn,
      action: async () => {
        await taskBtn.click();
      },
    });
    await tutorial.checkA11y('志工瀏覽求助任務列表');

    const claimBtn = page.getByRole('button', { name: /我要去幫忙|承接/ }).first();
    if ((await claimBtn.count()) > 0) {
      await tutorial.step({
        title: '點擊「我要去幫忙」開啟承接確認視窗',
        subtitle: '在正式承接前，系統會再次列出案件地址、現場聯絡人與目前缺額供志工確認。',
        target: claimBtn,
        action: async () => {
          await claimBtn.click();
        },
      });
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await tutorial.checkA11y('承接任務確認視窗');

      const cancelBtn = dialog.getByRole('button', { name: /取消|關閉/ }).first();
      await tutorial.step({
        title: '確認資訊後可點擊承接或取消返回',
        subtitle: '確認可到場支援即可送出承接；此處示範取消以保留測試資料乾淨。',
        target: cancelBtn,
        action: async () => {
          await cancelBtn.click();
        },
      });
    }
  });
});
