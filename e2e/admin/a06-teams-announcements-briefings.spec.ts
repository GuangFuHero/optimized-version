import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('A06：組織權限管理：團隊成員審核、緊急公告與行前須知發布', () => {
  test('管理員依序巡覽「團隊」、「緊急公告」與「志工行前資訊」管理頁面', async ({ page, tutorial }) => {
    tutorial.init({
      id: 'A06-admin-teams-announcements-briefings',
      title: '管理後台：團隊權限、緊急公告與行前資訊發布',
      subtitle: '審核團隊成員加入申請、發布全站緊急公告並更新志工行前須知',
      surface: 'admin',
    });

    await page.goto('/login');
    await tutorial.loginWithCredentials('asuper01@mock.test');

    const nav = page.getByRole('navigation', { name: '管理平台導覽' });

    const teamsLink = nav.getByRole('link', { name: '團隊' });
    await tutorial.step({
      title: '進入「團隊」管理成員與入隊申請',
      subtitle: '管理員可在此審核新成員的角色申請，或產生團隊專屬邀請連結與 QR Code。',
      target: teamsLink,
      action: async () => {
        await teamsLink.click();
      },
    });
    await expect(page).toHaveURL(/\/teams/);
    await tutorial.checkA11y('管理後台團隊管理頁面');

    const usersLink = nav.getByRole('link', { name: '成員與權限' });
    await tutorial.step({
      title: '進入「成員與權限」管理全站角色',
      subtitle: '超級管理員可在此檢視全平台人員清單與調整 RBAC 權限。',
      target: usersLink,
      action: async () => {
        await usersLink.click();
      },
    });
    await expect(page).toHaveURL(/\/users/);
    await tutorial.checkA11y('管理後台成員與權限頁面');

    const announcementsLink = nav.getByRole('link', { name: '緊急公告' });
    await tutorial.step({
      title: '進入「緊急公告」管理頁面',
      subtitle: '發布或更新顯示於前台與後台頂部的緊急救災公告。',
      target: announcementsLink,
      action: async () => {
        await announcementsLink.click();
      },
    });
    await expect(page).toHaveURL(/\/announcements/);
    await tutorial.checkA11y('管理後台緊急公告頁面');

    const briefingsLink = nav.getByRole('link', { name: '志工行前資訊' });
    await tutorial.step({
      title: '進入「志工行前資訊」編輯頁面',
      subtitle: '套用災害範本並編輯提供給前台志工閱讀的行前須知與裝備檢查表。',
      target: briefingsLink,
      action: async () => {
        await briefingsLink.click();
      },
    });
    await expect(page).toHaveURL(/\/briefings/);
    await tutorial.checkA11y('管理後台志工行前資訊頁面');
  });
});
