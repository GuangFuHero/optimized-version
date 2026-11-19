import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('S03：志工行前資訊檢視與個人裝備勾選', () => {
  test('進入行前資訊頁面、瀏覽注意事項並互動勾選裝備清單', async ({ page, tutorial }) => {
    tutorial.init({
      id: 'S03-briefing-checklist',
      title: '志工行前資訊與裝備檢查表',
      subtitle: '出發前往災區前，閱讀最新交通與安全須知並逐項確認個人攜帶裝備',
      surface: 'site',
    });

    await page.goto('/map');
    await expect(page.getByRole('button', { name: '放大' })).toBeVisible();
    const briefingLink = page
      .getByRole('navigation', { name: '前台模組' })
      .getByRole('link', { name: '行前資訊' });

    await tutorial.step({
      title: '點擊側邊欄「行前資訊」',
      subtitle: '在出發前區塊點選「行前資訊」，查看由救災指揮團隊發布的最新須知。',
      target: briefingLink,
      action: async () => {
        await briefingLink.click();
      },
    });

    await expect(page).toHaveURL(/\/briefing/);
    await tutorial.checkA11y('志工行前資訊頁面');

    const firstCheckbox = page.locator('input[type="checkbox"]').first();
    if ((await firstCheckbox.count()) > 0) {
      await tutorial.step({
        title: '勾選個人準備裝備清單',
        subtitle: '逐項勾選已備妥的防護裝備與補給品，勾選進度會自動保存在本機瀏覽器中。',
        target: firstCheckbox,
        action: async () => {
          await firstCheckbox.check();
        },
      });
      await expect(firstCheckbox).toBeChecked();
    }
  });
});
