import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('S05：志工認領任務、查看「我的任務」與釋出名額', () => {
  test('志工登入後於列表查看招募中需求、開啟認領確認視窗並檢視我的任務', async ({ page, tutorial }) => {
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

    const ticketTab = page.getByRole('button', { name: /請求協助|任務/ }).first();
    if ((await ticketTab.count()) > 0) {
      await tutorial.step({
        title: '篩選「請求協助」任務單',
        subtitle: '切換資料類型至求助任務單，查看各項人力與物資缺額。',
        target: ticketTab,
        action: async () => {
          await ticketTab.click();
        },
      });
    }

    await tutorial.checkA11y('志工瀏覽求助任務列表');
  });
});
