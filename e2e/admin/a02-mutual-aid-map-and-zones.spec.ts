import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('A02：互助地圖管理：責任區與管制區圖層', () => {
  test('從後台導覽列進入「互助地圖」並檢視責任區與圖層操作', async ({ page, tutorial }) => {
    tutorial.init({
      id: 'A02-admin-mutual-aid-map',
      title: '管理後台：互助地圖與責任區劃設',
      subtitle: '於後台互助地圖檢視各團隊責任區、危險管制區與現場案件分布',
      surface: 'admin',
    });

    await page.goto('/login');
    await tutorial.loginWithCredentials('asuper01@mock.test');

    const mapLink = page
      .getByRole('navigation', { name: '管理平台導覽' })
      .getByRole('link', { name: '互助地圖' });

    await tutorial.step({
      title: '點擊左側導覽列「互助地圖」',
      subtitle: '切換至後台專屬的互助地圖，管理各救災團隊的責任區範圍與封鎖線。',
      target: mapLink,
      action: async () => {
        await mapLink.click();
      },
    });

    await expect(page).toHaveURL(/\/map/);
    await expect(page.getByRole('heading', { level: 1, name: '互助地圖' })).toBeVisible();
    await tutorial.checkA11y('管理後台互助地圖頁面');
  });
});
