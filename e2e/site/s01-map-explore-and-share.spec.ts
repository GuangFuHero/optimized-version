import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('S01：災情地圖瀏覽、圖層切換與關鍵字搜尋', () => {
  test('訪客瀏覽公開地圖、切換站點與任務圖層、搜尋「光復」並開啟本頁操作說明', async ({
    page,
    tutorial,
  }) => {
    tutorial.init({
      id: 'S01-map-explore',
      title: '災情地圖瀏覽、圖層切換與搜尋',
      subtitle: '免登入快速切換站點與求助任務圖層、搜尋特定地點並閱讀操作指引',
      surface: 'site',
    });

    await page.goto('/map');
    await expect(page.getByRole('navigation', { name: '前台模組' })).toBeVisible();
    await expect(page.getByRole('button', { name: '放大' })).toBeVisible();
    await tutorial.checkA11y('公開地圖首頁');

    const taskDimensionBtn = page
      .getByRole('group', { name: '資料維度' })
      .getByRole('button', { name: '任務' });
    await tutorial.step({
      title: '切換資料維度至「任務」',
      subtitle: '在地圖下方切換「站點／任務」，即時檢視災區內待協助的求助案件分布。',
      target: taskDimensionBtn,
      action: async () => {
        await taskDimensionBtn.click();
      },
    });
    await expect(taskDimensionBtn).toHaveAttribute('aria-pressed', 'true');

    const layerBtn = page.getByRole('button', { name: '開啟圖層控制' });
    await tutorial.step({
      title: '開啟地圖圖層控制面板',
      subtitle: '可切換底圖樣式，並開關危險管制區、責任區與封閉路段等救災圖層。',
      target: layerBtn,
      action: async () => {
        await layerBtn.click();
      },
    });
    await tutorial.checkA11y('地圖圖層控制面板開啟');
    await page.keyboard.press('Escape');

    const searchInput = page.getByRole('textbox', { name: '搜尋' }).first();
    await tutorial.step({
      title: '輸入關鍵字搜尋站點或任務',
      subtitle: '在頂部導覽列搜尋框輸入「光復」，即時篩選地圖上的相關站點與任務。',
      target: searchInput,
      action: async () => {
        await tutorial.type(searchInput, '光復');
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

    const helpBtn = page.getByRole('button', { name: /這一頁怎麼用/ }).first();
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
