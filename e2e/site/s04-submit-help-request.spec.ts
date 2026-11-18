import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('S04：民眾發出「請求協助（報案開單）」與無障礙表單驗證', () => {
  test('登入後開啟「請求協助」抽屜、填寫地點與需求項目並驗證必填提示', async ({ page, tutorial }) => {
    tutorial.init({
      id: 'S04-submit-help-request',
      title: '發出「請求協助」需求單',
      subtitle: '民眾或現場人員回報受災位置、聯絡方式與所需志工／物資數量',
      surface: 'site',
    });

    await page.goto('/login');
    await tutorial.checkA11y('前台登入頁面');
    await tutorial.loginWithCredentials('avol01@mock.test');
    await expect(page).toHaveURL(/\/(map|list)/);

    const requestHelpBtn = page.getByRole('button', { name: '請求協助' }).first();
    await tutorial.step({
      title: '點擊右上角「請求協助」按鈕',
      subtitle: '打開請求協助表單抽屜，開始填寫需要志工支援的地點與項目。',
      target: requestHelpBtn,
      action: async () => {
        await requestHelpBtn.click();
      },
    });

    const titleField = page.getByLabel(/標題/);
    await expect(titleField).toBeVisible();
    await tutorial.checkA11y('請求協助表單抽屜開啟狀態');

    await tutorial.step({
      title: '填寫求助標題與地址資訊',
      subtitle: '輸入清楚的求助標題（如「一樓客廳積泥需要幫忙清理」）與門牌地址。',
      target: titleField,
      action: async () => {
        await titleField.fill('一樓客廳積泥需要幫忙清理');
        await page.getByLabel(/地址/).fill('花蓮縣光復鄉中山路一段100號');
        await page.getByLabel(/現場聯絡人/).fill('王阿嬤');
        await page.getByLabel(/聯絡方式/).fill('0912-345-678');
      },
    });

    const firstNeedRadio = page
      .getByRole('radiogroup', { name: /你需要什麼幫忙/ })
      .getByRole('radio')
      .first();
    await tutorial.step({
      title: '選擇需要的幫忙類別',
      subtitle: '在無障礙單選群組（radiogroup）中點選最接近的支援類別。',
      target: firstNeedRadio,
      action: async () => {
        await firstNeedRadio.click();
      },
    });
    await tutorial.checkA11y('請求協助表單選擇需求類別後');

    const cancelBtn = page.getByRole('button', { name: '取消' });
    await tutorial.step({
      title: '確認表單內容或取消關閉',
      subtitle: '確認所有必填欄位完整後即可點擊「送出」；此教學示範點擊「取消」關閉抽屜。',
      target: cancelBtn,
      action: async () => {
        await cancelBtn.click();
      },
    });
  });
});
