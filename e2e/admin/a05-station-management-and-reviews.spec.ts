import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('A05：資源站點管理、物資盤點與民眾修改建議審查', () => {
  test('進入「資源站點管理」檢視站點清單、展開站點詳情並通過無障礙檢測', async ({
    page,
    tutorial,
  }) => {
    tutorial.init({
      id: 'A05-admin-station-management',
      title: '管理後台：資源站點管理與建議審查',
      subtitle: '維護救災物資站、醫療站與收容所資訊，並審核現場民眾回報的狀態更新',
      surface: 'admin',
    });

    await page.goto('/login');
    await tutorial.loginWithCredentials('asuper01@mock.test');

    const stationsLink = page
      .getByRole('navigation', { name: '管理平台導覽' })
      .getByRole('link', { name: '資源站點管理' });

    await tutorial.step({
      title: '點擊導覽列「資源站點管理」',
      subtitle: '進入資源站點管理頁面，集中管理各類物資站、供水站與收容所。',
      target: stationsLink,
      action: async () => {
        await stationsLink.click();
      },
    });

    await expect(page).toHaveURL(/\/stations/);
    await expect(page.getByRole('heading', { level: 1, name: '資源站點管理' })).toBeVisible();
    await tutorial.checkA11y('管理後台資源站點管理頁面');

    const firstStationRow = page.getByRole('row').nth(1);
    if ((await firstStationRow.count()) > 0) {
      await tutorial.step({
        title: '點選站點列開啟物資盤點與詳情側欄',
        subtitle: '查看該站點的即時營運狀態、指派團隊、物資盤點明細與修改歷史時間軸。',
        target: firstStationRow,
        action: async () => {
          await firstStationRow.click();
        },
      });
      await expect(page.getByRole('button', { name: '關閉站點詳情' })).toBeVisible();
      await tutorial.checkA11y('管理後台站點詳情側欄');
    }
  });
});
