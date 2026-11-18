import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('A03：任務管理看板、大樓空間分區管理與批次匯出', () => {
  test('進入「任務管理」頁面、檢視案件列表並通過無障礙檢測', async ({ page, tutorial }) => {
    tutorial.init({
      id: 'A03-admin-ticket-board',
      title: '管理後台：任務管理與建築空間分區',
      subtitle: '篩選與指派求助案件、管理集合住宅樓層戶別需求並支援批次匯入匯出',
      surface: 'admin',
    });

    await page.goto('/login');
    await tutorial.loginWithCredentials('asuper01@mock.test');

    const ticketsLink = page
      .getByRole('navigation', { name: '管理平台導覽' })
      .getByRole('link', { name: '任務管理' });

    await tutorial.step({
      title: '進入「任務管理」看板',
      subtitle: '在左側導覽列點選「任務管理」，集中檢視所有民眾通報的求助任務單。',
      target: ticketsLink,
      action: async () => {
        await ticketsLink.click();
      },
    });

    await expect(page).toHaveURL(/\/tickets/);
    await expect(page.getByRole('heading', { level: 1, name: '任務管理' })).toBeVisible();
    await tutorial.checkA11y('管理後台任務管理頁面');
  });
});
