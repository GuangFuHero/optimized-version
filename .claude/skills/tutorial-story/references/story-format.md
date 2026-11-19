# 劇本格式（tutorial recorder API）

寫劇本、或 `pnpm e2e:check` 沒過時讀這份。原始碼在 `e2e/fixtures/tutorial-recorder.ts`，完整的劇本範例在 `e2e/site/`、`e2e/admin/`。

## 骨架

```ts
import { expect, test } from '../fixtures/tutorial-recorder';

test.describe('A07：資料檢核員審查站點修改建議', () => {
  test('從審查佇列核准一筆建議', async ({ page, tutorial }) => {
    tutorial.init({
      id: 'A07-station-review',            // 也是 e2e/output/ 的資料夾名、Remotion 的分集 id
      title: '審查民眾送來的站點修改建議',
      subtitle: '看懂建議改了什麼、有沒有衝突，再決定採用或退回',
      surface: 'admin',
      summary: [                             // 總結卡；不寫就用通用的結語
        '建議和目前的值並排顯示，衝突的欄位會標出來',
        '每一筆可以分別採用或退回，並留一句備註',
      ],
    });

    await page.goto('/login');
    await tutorial.checkA11y('後台登入頁');
    await tutorial.loginWithCredentials('aaudit01@mock.test');

    tutorial.section('打開審查佇列', '民眾在前台提出的修改，會先排進這裡等人審查。');

    await page.goto('/stations');
    const reviewButton = page.getByRole('button', { name: /審查/ });
    await tutorial.step({
      title: '按「審查」打開佇列',
      subtitle: '按鈕上的數字是還在等待審查的建議數。',
      target: reviewButton,
      action: async () => {
        await reviewButton.click();
      },
    });
    await expect(page.getByRole('dialog')).toBeVisible();
    await tutorial.checkA11y('審查佇列');

    tutorial.section('決定採用或退回', '一次看一個站點，逐欄比對後再送出。');
    // …更多 step
  });
});
```

## `tutorial.init(options)`

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | 是 | `S07-…`（前台）或 `A07-…`（後台），接著現有的編號；要跟 `video/episodes.ts` 登記的一樣 |
| `title` | 是 | 影片標題，開場卡與總結卡都會用 |
| `subtitle` | 是 | 開場卡上的一句話：這集要教什麼 |
| `surface` | 是 | `'site'` 或 `'admin'`，要跟檔案所在的資料夾一致 |
| `summary` | 否 | 總結卡的重點，2～4 點 |

## `tutorial.section(title, intro?)`

開始一段。之後的每一步都屬於這段，直到下一次 `section()`。

- 字幕列上方會顯示段落名稱。
- 會另外輸出 `chapters.vtt`（`<track kind="chapters">` 用的章節檔），`pnpm video:render` 時複製成 `video/out/<id>.chapters.vtt`。
- 不分段也可以；一集只有 2～3 步時不用分。

## `tutorial.step(options)`

| 欄位 | 必填 | 說明 |
|---|---|---|
| `title` | 是 | 這一步的動作，例如「選擇需要的幫忙類別」 |
| `subtitle` | 是 | 給觀眾的一句說明，60 字以內 |
| `target` | 實際上必填 | 觀眾該看的元素（Playwright `Locator`）。沒有 `target` 就沒有聚光燈與鏡頭縮放，`e2e:check` 會報錯 |
| `action` | 否 | 這一步要做的事，例如點擊、填字。在量完 `target` 的位置之後才執行 |
| `holdMs` | 否 | 做完之後停多久；錄影模式預設 1400ms，快速模式 100ms |

`step` 會先等 `target` 出現、把滑鼠移上去、量它的框，再執行 `action`，最後停 `holdMs`。所以：

- `target` 要指動作之前就在畫面上的元素。
- 一個 `action` 裡可以填好幾個欄位（例如一次填完地址與聯絡人），但字幕要說的是同一件事。
- 目標要在 1280×720 的畫面內。在捲動區塊裡的元素，先 `scrollIntoViewIfNeeded()` 再當 `target`。

## `tutorial.checkA11y(context, { strict? })`

用 axe-core 掃整頁的 WCAG 2.1 A／AA（排除 Leaflet 地圖圖磚、暫時停用 `color-contrast`）。有 critical／serious 違規時測試直接失敗。每次畫面明顯換了（開了抽屜、換了頁）就掃一次，`context` 寫成看得懂的畫面名稱。`strict: false` 只記錄不失敗，只在確定是第三方元件的問題、而且另外記了 issue 時用。

## `tutorial.loginWithCredentials(email, password?)`

用登入表單登入（錄成一步），10 分鐘內同一個帳號會重用 cookie，避免撞到後端的登入次數限制。密碼預設 `Mock1234!`。

## 錄出來的東西

`pnpm e2e:record` 之後，每一集在 `e2e/output/<id>/`：

| 檔案 | 內容 |
|---|---|
| `recording.webm` | 原始錄影 |
| `timeline.json` | 每一步的標題、字幕、段落、位置、時間，以及每次無障礙檢查的結果 |
| `captions.vtt` | 字幕檔，一步一句 |
| `chapters.vtt` | 章節檔；有用 `section()` 才有 |

同時會複製一份到 `video/public/recordings/`，給 `pnpm video:studio` 即時預覽。

`pnpm video:html <id>` 或 `pnpm video:render <id>` 之後，`video/out/` 會有：

| 檔案 | 內容 |
|---|---|
| `<id>.mp4` | 合成好的教學影片（只有 `video:render`） |
| `<id>.vtt`、`<id>.chapters.vtt` | 影片的字幕與章節，時間已經對齊影片（影片開頭有 2 秒開場卡） |
| `<id>.html`、`<id>.webm` | 互動教學頁和它的舞台（原始錄影），兩個檔放在一起才能播 |

互動教學頁從時間軸自動產生：每一段（`section()`）一個章節，段落的 intro 是介紹卡，`init` 的 `summary` 是最後一段的總結卡，每一步的 `subtitle` 是旁白。每一步停在 `startMs` 之後一點點（目標已經出現、動作還沒做）的畫面；點下去之後換到下一步的畫面，一段的最後一步則停在自己動作做完的畫面。

## `pnpm e2e:check` 會檢查什麼

| 項目 | 等級 |
|---|---|
| 有 `timeline.json`、`recording.webm`、`captions.vtt` | error |
| 分集有在 `video/episodes.ts` 登記 | error |
| 每一步都有 `target`、框有大小、在畫面內 | error |
| 字幕不是空的；每步至少 500ms；步驟時間不重疊 | error |
| 每一段至少有一步 | error |
| 無障礙檢查沒有違規 | error |
| 字幕超過 60 字 | warn |
| 有分段時，第一段之前的步驟沒有段落 | warn |
| 整集沒有做過無障礙檢查 | warn |

## 常見錯誤

| 症狀 | 原因 | 修法 |
|---|---|---|
| `getByRole` 找不到元素 | 元素沒有無障礙名稱，或名稱跟畫面上的字不同 | 修前端：補 `aria-label`、把 `<label>` 接到輸入框；不要改用 CSS selector |
| 聚光燈框在空白處 | `target` 指到點完才出現的元素，或指到會動的容器 | `target` 改指動作前就在的元素；換畫面後的東西放到下一步 |
| `e2e:check` 說目標在畫面外 | 元素在捲動區塊或畫面下方 | 先 `scrollIntoViewIfNeeded()`，或換一個在畫面內的元素 |
| Remotion 裡找不到這一集 | 沒在 `video/episodes.ts` 登記 | 加 `recordedEpisode({ id, title, subtitle, surface })` |
| 第二次跑就失敗 | 劇本依賴上一次留下的資料（例如已經送出過） | 示範到確認視窗就取消，或每次用新的、可重複的資料 |
| 登入一直失敗 | 撞到後端登入次數限制 | 用 `loginWithCredentials`，它會重用 cookie |
