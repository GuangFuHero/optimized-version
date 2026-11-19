---
name: tutorial-story
description: 把前台或管理後台的一段真實操作流程（或既有的 e2e/site、e2e/admin 劇本），寫成或更新為 Playwright E2E 劇本並執行 WCAG 無障礙檢查，再錄影產出兩種成品：用 Remotion 合成、有聚光燈與字幕的教學影片（MP4＋.vtt），以及用同一段錄影當舞台、能上一步／下一步／跳段播放每格片段的互動教學頁（HTML）。支援三種入口：帶入既有 e2e/ spec 或分集 ID（如 S01、all）、帶入一段新流程描述、或不帶引數直接由對話詢問情境。還沒做出來的設計、要開會比較方案，不適用（見下方「手畫舞台」）。
---

# Tutorial story：E2E 劇本 → 教學影片與互動教學頁

一支劇本同時是四樣東西：會擋 regression 的 E2E 測試、WCAG 2.1 AA 無障礙檢查、一支教學影片、一個互動教學頁。所以劇本裡的每一步都必須是**真的會在 app 上成立的操作**，影片上的聚光燈也是從真實畫面量出來的位置。

相關的檔案：

| 檔案 | 是什麼 |
|---|---|
| `e2e/fixtures/tutorial-recorder.ts` | `tutorial.init / section / step / checkA11y / loginWithCredentials`，錄下每一步的位置與時間 |
| `e2e/site/`、`e2e/admin/` | 劇本（spec），前台與後台各一個 Playwright project |
| `video/episodes.ts` | 影片分集清單；每支劇本都要在這裡登記 |
| `video/TutorialComposition.tsx` | 把錄影合成成影片：鏡頭縮放、聚光燈、字幕列、開場卡、章節名稱、總結卡 |
| `video/interactive.mjs` | 把錄影和時間軸做成互動教學頁：舞台是原始錄影，每一步一個隱形點擊區 |
| `video/scripted-demo/player.js` | 互動教學頁的播放器（游標、聚光燈、旁白、卡片、控制列）。外部引入的正本，**不要改**，要修就改上游再整份換掉 |
| `e2e/scripts/check-timeline.mjs` | 錄完之後檢查時間軸（`pnpm e2e:check`） |
| `e2e/scripts/preflight.mjs` | 開工前檢查環境，缺什麼就印出補上的指令（`pnpm e2e:preflight`） |

API 與欄位的完整說明在 `references/story-format.md`，寫劇本前先讀。

## 入口模式

呼叫時依使用者提供的輸入決定從哪一步切入：

- **帶入既有 `e2e/` 劇本或分集 ID**（例如 `e2e/site/s01-map-explore-and-share.spec.ts`、`S01`、`A05` 或 `all`）：跳過第 1～5 步，先確認是否要順手補上 `section()` 章節或 `summary` 總結（不需要就直接重錄），接著執行 **第 0 步（preflight）→ 第 6 步（錄影、檢查、產出 HTML／MP4）→ 第 7 步（驗收）**。
- **帶入一段新流程描述**（例如「幫志工承接任務做一支教學影片」）：依描述直接整理大綱，只補問還沒講清楚的細節（對象、起迄點、前台或後台），再照第 0～7 步從生成 E2E 劇本開始做到完。
- **沒帶任何引數**：開頭直接問使用者想做哪一種——**(A) 從既有的 `e2e/site/`、`e2e/admin/` 挑一支（或全部）錄製與產出教學頁／影片**，還是 **(B) 描述一個新情境，從生成 E2E 劇本開始**——取得回覆後再接手對應流程。

## 工作流程

整個流程由你（Claude）依序執行指令；使用者只需要同意執行，**不要請使用者自己去開服務、裝東西或打指令**。

0. **準備環境**：在專案根目錄跑 `pnpm e2e:preflight`。每一項 ✗ 下面都有 `fix:` 指令，照順序執行，然後再跑一次 preflight，直到全部 ✓：
   - `pnpm install`、`pnpm --dir Frontend install`、`pnpm exec playwright install chromium`、`pnpm exec remotion browser ensure`：直接執行。
   - 第一次在這台電腦用、資料庫是空的（`mock seed data` ✗）：`pnpm run setup`。注意要寫 `pnpm run setup`，`pnpm setup` 是 pnpm 自己的指令，不會跑專案的 setup。
   - 服務沒在跑（`backend`、`site`、`admin` ✗）：用背景執行 `pnpm dev`（後端用 Docker 時，它會一起把後端開起來）；後端已經在跑、只缺前端時，背景執行 `pnpm --dir Frontend dev`。接著跑 `pnpm e2e:preflight --wait 360`，它會等到服務都回應為止。
   - `next dev` 啟動後如果印出升級提醒、然後自己結束（輸出寫「Retry the same command」），**馬上**用背景再執行同一個指令一次；隔太久重跑會再被擋一次。
   - preflight 全部 ✓ 才往下做。
1. **先問清楚四件事**：要示範哪個流程（從哪裡開始、到哪裡結束）、給誰看（民眾、志工、團隊管理員、資料檢核員…）、分成哪幾段，以及是前台（`site`，:3000）還是後台（`admin`，:3001）。給一般民眾看的字幕用日常用語，不寫 `aria`、`radiogroup`、`textbox` 這類詞。
2. **確認流程在 app 裡真的走得通**：讀那一頁的程式碼，找出每一步要點的元素，以及它的無障礙名稱。
   - 定位一律用 `getByRole`、`getByLabel`、`getByText`，**不寫 CSS selector，也不寫座標**。
   - 元素沒有可用的無障礙名稱時，**修前端**（`aria-label`、`<label htmlFor>`、可見文字），不要改用 selector 繞過去。這是這套做法的重點之一：抓到的就是真的無障礙問題。修前端照 `Frontend/CLAUDE.md`。
3. **先在對話裡給大綱**：標題、副標、各段的 intro、每一步的標題與字幕、總結卡的重點。使用者點頭再寫 code；改一句字幕比重錄便宜。
4. **寫劇本**：`e2e/<surface>/<s|a><兩位數>-<slug>.spec.ts`，id 用 `S07-…`、`A07-…` 接著現有的編號。照 `references/story-format.md` 的骨架：`init`（含 `summary`）→ 每段 `section()` → 每一步 `step({ title, subtitle, target, action })` → 每次畫面換了就 `checkA11y()`。
5. **登記分集**：在 `video/episodes.ts` 的 `EPISODE_CATALOG` 加一筆 `recordedEpisode({ id, title, subtitle, surface })`。沒登記的分集不會出現在 Remotion，也算不出影片。
6. **跑測試，再錄影**（第 0 步的 preflight 要全部 ✓）：
   ```bash
   pnpm e2e e2e/admin/a07-xxx.spec.ts          # 快速模式：先讓它過
   pnpm e2e:record e2e/admin/a07-xxx.spec.ts   # 錄影模式：每步停 1.4 秒
   pnpm e2e:check A07-xxx                      # 檢查時間軸
   pnpm video:html A07-xxx                     # 只產出互動教學頁（快，不算影片）
   pnpm video:render A07-xxx                   # 產出影片與互動教學頁（慢）
   ```
   產出在 `video/out/`：`<id>.mp4`、`<id>.vtt`（字幕）、`<id>.chapters.vtt`（章節）、`<id>.html` 與 `<id>.webm`（互動教學頁和它的舞台，兩個檔要放在一起）。
   `e2e:check` 有 error 就修到全過：每一步都要有 `target`、目標要在畫面內、字幕不能空、無障礙檢查不能有違規、分集要有登記。
7. **親眼看兩種成品**：
   - 影片：`pnpm video:studio` 打開那一集，至少看開場卡、每段第一步、總結卡。
   - 互動教學頁：用瀏覽器打開 `video/out/<id>.html`，按 ▶ 播放演一遍；點每個章節並前後切格（`←` / `→`），確認每一步都播放該格錄影片段且聚光燈對齊目標；再把視窗縮到手機寬度看一次。
   聚光燈框錯地方、字幕擋住目標、鏡頭縮放切掉重點，`e2e:check` 都抓不到。

## 寫劇本的規則

- **一步只有一個焦點。** 一步的 `target` 就是觀眾該看的地方；要同時看兩個地方，就拆成兩步。
- **`target` 是動作之前的位置。** recorder 在執行 `action` 之前量 `target` 的框，所以 `target` 要指「將要被點或被填的那個元素」，不是點完之後才出現的東西。點完會換畫面時，下一步再指新畫面上的元素。
- **字幕一句話**，60 字以內，說「做什麼、為什麼」，不說「點擊位於右上角的按鈕」這種影片已經看得到的事。`title` 是動作（「選擇需要的幫忙類別」），`subtitle` 是給觀眾的說明。
- **每段是一個完整的小故事**（例如「登入」「填寫求助」「送出之後」）；`section()` 的 intro 一兩句話說這段要示範什麼。一集 2～4 段、每段 2～5 步就好，超過就拆成兩集。
- **總結卡 2～4 點**，寫觀眾看完該記得的事，不寫「本影片示範了…」。
- **不要真的改壞資料。** 劇本跑在本機 seed 資料上：會送出、刪除、合併的流程，選一筆 seed 裡專門給測試用的資料，或示範到確認視窗就按「取消」，並在字幕說明真正送出會怎樣。要讓別人重跑也成立，就不能依賴上一次執行留下的資料。
- **登入用 `tutorial.loginWithCredentials()`**，帳號用 `Backend/scripts/seed_mock_scenarios.sql` 開頭列的 seed 帳號（`asuper01`、`aaudit01` 由 `global-setup.ts` 設好密碼）。
- **填表單用 `tutorial.type(locator, text)`**：一般 E2E（`fast`）會瞬間 `fill()`，錄製模式（`RECORD_TUTORIAL=1`，可用 `TUTORIAL_PACE=normal|slow` 調速）會平滑移動游標並逐字輸入。

## 互動教學頁怎麼運作

`video/scripted-demo/player.js` 原本是給「手畫的舞台」用的：照劇本移動游標、打亮聚光燈、顯示旁白和卡片。這裡把舞台換成錄下來的畫面：

- 舞台底下是原始錄影（`<id>.webm`），上面每一步疊一個對應位置的錨點框（錄影時量到的 `target` 框）。
- 切到任一步驟時，先定格在該格操作前的畫面對齊聚光燈與游標，點擊後播放該步驟的真實錄影片段（打字、點擊、展開抽屜）並停在終點，所以上一步、下一步、跳段看到的都是真實動作與畫面。
- 旁白、介紹卡、總結卡是 HTML 疊在上面，不是燒在影片裡。

限制：

- 只能照錄過的步驟與章節觀看，不能自由操作 app。要示範「填錯了怎麼辦」，就另外錄一段。
- 錄影只有一種配色，所以播放器的深色切換鈕藏起來了。
- 要把 `.html` 和 `.webm` 放在同一個資料夾才能播。

改字：目前旁白來自劇本的 `title`／`subtitle`，改完要重跑 `e2e:record`。之後會把文字拆成獨立的檔案，改字就不用重錄（見 `e2e/README.md` 的 TODO）。

## 手畫舞台：還沒做出來的設計

同一個播放器也能配手畫的舞台（照原型畫的假畫面），用來示範還沒做出來的設計、或開會比較方案。這種情況不寫 E2E，照播放器原本的寫法做：舞台、`data-demo` 錨點、`render(state)`、劇本，格式見 `video/scripted-demo/player.js` 的上游說明（scripted-demo skill）。

| | 錄影舞台（這個 skill 的主流程） | 手畫舞台 |
|---|---|---|
| 畫面 | 真的 app，錄下來 | 照原型畫的 |
| 能示範還沒做的設計 | 不行 | 可以 |
| 同時是 E2E 測試與無障礙檢查 | 是 | 否 |
| 介面改版後 | 重跑 `e2e:record` 就更新；定位找不到元素時 E2E 會失敗，提醒你教學過時了 | 要手動改舞台，沒有東西會提醒你 |

## 回報

交付時告訴使用者：劇本、影片和互動教學頁的位置、分成幾段幾步、`e2e:check` 的結果、這次順手修了哪些無障礙問題，以及沒做到或刻意省略的部分（例如示範到確認就取消、沒有真的送出）。
