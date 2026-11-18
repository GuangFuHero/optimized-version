import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('S01：災情地圖瀏覽、關鍵字搜尋與操作說明', () => {
  test('訪客瀏覽公開地圖、搜尋「光復」並開啟本頁操作說明', async ({ page, tutorial }) => {
    tutorial.init({
      id: 'S01-map-explore',
      title: '災情地圖瀏覽與關鍵字搜尋',
      subtitle: '免登入快速查看資源站點、搜尋特定地點並閱讀操作指引',
      surface: 'site',
    });

    await page.goto('/map');
    await expect(page.getByRole('navigation', { name: '前台模組' })).toBeVisible();
    await tutorial.checkA11y('公開地圖首頁');

    const searchInput = page.getByRole('textbox', { name: '搜尋' }).first();
    await tutorial.step({
      title: '輸入關鍵字搜尋站點或任務',
      subtitle: '在頂部導覽列搜尋框輸入「光復」，即時篩選地圖上的相關站點與任務。',
      target: searchInput,
      action: async () => {
        await searchInput.fill('光復');
      },
    });
    await tutorial.checkA11y('輸入搜尋關鍵字後（含清除搜尋按鈕）');

    const clearBtn = page.getByRole('button', { name: '清除搜尋' }).first();
    await tutorial.step({
      title: '清除搜尋條件',
      subtitle: '點擊搜尋框右側的「清除搜尋」按鈕，恢復顯示全部範圍點位。',
      target: clearBtn,
      action: async () => {
        await clearBtn.click();
      },
    });

    const helpBtn = page.getByRole('button', { name: '這一頁怎麼用' }).first();
    await tutorial.step({
      title: '開啟「這一頁怎麼用」無障礙導覽',
      subtitle: '隨時可點擊右上角的問號按鈕，查看地圖圖層與標記的操作說明。',
      target: helpBtn,
      action: async () => {
        await helpBtn.click();
      },
    });

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await tutorial.checkA11y('這一頁怎麼用說明視窗');

    const closeBtn = dialog.getByRole('button', { name: /知道了|關閉/i }).first();
    await tutorial.step({
      title: '關閉說明視窗回到地圖',
      subtitle: '閱讀完畢後關閉說明視窗，繼續操作災情地圖。',
      target: closeBtn,
      action: async () => {
        await closeBtn.click();
      },
    });
  });
});
