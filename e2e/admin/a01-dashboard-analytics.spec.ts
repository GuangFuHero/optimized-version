import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('A01：後台總覽儀表板與災情數據趨勢分析', () => {
  test('管理員登入後台、檢視總覽儀表板與統計指標並通過無障礙檢測', async ({ page, tutorial }) => {
    tutorial.init({
      id: 'A01-dashboard-analytics',
      title: '管理後台：總覽儀表板與數據趨勢',
      subtitle: '掌握志工人力缺口、需求類別分布與即時救災進度指標',
      surface: 'admin',
    });

    await page.goto('/login');
    await tutorial.checkA11y('管理後台登入頁面');
    await tutorial.loginWithCredentials('asuper01@mock.test');

    const nav = page.getByRole('navigation', { name: '管理平台導覽' });
    await expect(nav).toBeVisible();
    await tutorial.checkA11y('管理後台總覽儀表板');

    const heading = page.getByRole('heading', { level: 1 });
    await tutorial.step({
      title: '檢視「總覽儀表板」核心指標',
      subtitle: '登入後預設進入總覽儀表板，查看待處理任務單、志工媒合率與資源站點概況。',
      target: heading,
    });
  });
});
