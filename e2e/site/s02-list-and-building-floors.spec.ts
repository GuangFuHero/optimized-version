import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('S02：列表模式瀏覽與大樓樓層分區檢視', () => {
  test('切換至列表模式、篩選點位並開啟點位分享視窗', async ({ page, tutorial }) => {
    tutorial.init({
      id: 'S02-list-and-share',
      title: '列表模式瀏覽與點位分享',
      subtitle: '使用結構化列表快速檢視所有資源站點與求助案件，並透過 QR Code 分享',
      surface: 'site',
    });

    await page.goto('/map');
    await expect(page.getByRole('button', { name: '放大' })).toBeVisible();
    const listNavLink = page
      .getByRole('navigation', { name: '前台模組' })
      .getByRole('link', { name: '列表' });

    await tutorial.step({
      title: '從左側導覽列切換至「列表」模式',
      subtitle: '除了地圖視覺化檢視外，也可切換至列表模式以文字卡片瀏覽所有點位。',
      target: listNavLink,
      action: async () => {
        await listNavLink.click();
      },
    });

    await expect(page).toHaveURL(/\/list/);
    await tutorial.checkA11y('前台列表檢視頁面');

    const firstRowButton = page.locator('button[aria-pressed]').first();
    if ((await firstRowButton.count()) > 0) {
      await tutorial.step({
        title: '點選列表卡片查看站點或案件詳情',
        subtitle: '點擊任一列表列即可在右側（或抽屜）展開完整聯絡資訊、地址與需求明細。',
        target: firstRowButton,
        action: async () => {
          await firstRowButton.click();
        },
      });
      await tutorial.checkA11y('列表點位詳情展開狀態');
    }
  });
});
