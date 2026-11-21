# 貢獻指南

謝謝你願意幫忙島嶼守望（救災資訊平台）。這份文件說明怎麼回報問題、怎麼送 PR、PR 怎麼審查，以及送進來的內容用什麼授權。

參與這個專案的每一個人，都要遵守[行為準則](CODE_OF_CONDUCT.md)。

## 目錄

1. [送進來的內容用什麼授權](#送進來的內容用什麼授權)
2. [回報問題](#回報問題)
3. [開始之前要讀的](#開始之前要讀的)
4. [分支與 PR 流程](#分支與-pr-流程)
5. [審查與合併](#審查與合併)
6. [設計稿](#設計稿)
7. [用 AI 工具寫的程式](#用-ai-工具寫的程式)
8. [維護者分工](#維護者分工)

---

## 送進來的內容用什麼授權

- **程式碼與技術文件**：GNU General Public License v3.0 only（`GPL-3.0-only`），全文見 [`LICENSE`](LICENSE)。
- **設計素材**（插圖、吉祥物「光復寶寶」、UI 設計稿、設計文件）：創用 CC 姓名標示－相同方式分享 4.0 國際（`CC-BY-SA-4.0`）。
- **名稱與 Logo**：不在上述授權範圍內。

送 PR 就表示你同意你的貢獻照上面的授權釋出，而且你有權利這樣釋出（是你自己寫的，或是來源的授權允許）。每一類內容的範圍，見 [`LICENSING.md`](LICENSING.md)。

<!--
待決定（Carol）：貢獻者協議。
GuangFuHero 組織首頁寫「所有程式碼貢獻者需先簽署個人 CLA，CLA Assistant Bot 會在第一次提交 PR 時要求簽署」，
但這個 repo 目前沒有 CLA bot 在跑。三選一，決定後改這一段，並同步組織首頁：
  A. 裝 CLA Assistant，照組織首頁做。
  B. 改用 DCO：每個 commit 加 `Signed-off-by:`（`git commit -s`），並加 DCO 檢查。比較輕，GPL 專案常用。
  C. 都不要求，只靠上面這段「送 PR 即同意」，並把組織首頁的 CLA 段拿掉。
-->

新增的原始碼檔案，第一行（有 shebang 的放在 shebang 下一行）加上授權標示：

```python
# SPDX-License-Identifier: GPL-3.0-only
```

```ts
// SPDX-License-Identifier: GPL-3.0-only
```

從別的專案複製程式碼進來時，保留原本的著作權與授權標示，並在 PR 說明寫出來源和授權。授權不相容 GPL-3.0 的程式碼不能放進來。

## 回報問題

- **一般的錯誤或功能建議**：開 [GitHub issue](https://github.com/GuangFuHero/optimized-version/issues)。寫清楚：做了什麼、預期看到什麼、實際看到什麼、用哪個環境和瀏覽器，能附截圖更好。
- **資安問題**：**不要**開公開的 issue，照 [`SECURITY.md`](SECURITY.md) 私下通報。
- 不要在 issue、PR 或截圖裡放真實的個人資料（姓名、電話、地址、帳號）。測試請用假資料。

## 開始之前要讀的

| 你要改的 | 先讀 |
|---|---|
| 任何程式 | 根目錄 [`CLAUDE.md`](CLAUDE.md)、[`README.md`](README.md) 的「5 分鐘跑起完整系統」 |
| 前端（`Frontend/`） | [`Frontend/CLAUDE.md`](Frontend/CLAUDE.md)、[`Frontend/README.md`](Frontend/README.md)、[`Frontend/docs/design-system.md`](Frontend/docs/design-system.md)（動 UI 前一定要讀） |
| 後端（`Backend/`） | [`Backend/CLAUDE.md`](Backend/CLAUDE.md)、[`Backend/README.md`](Backend/README.md) |
| 規格與決策 | `Backend/Spec/<編號>/spec.md` 與 `decisions.md`（ADR） |
| 部署 | [`DEPLOY.md`](DEPLOY.md) |

## 分支與 PR 流程

1. **從最新的 `main` 開分支**。分支名稱用類型開頭：`feat/`、`fix/`、`docs/`、`chore/`、`test/`、`refactor/`，例如 `fix/dedup-queue-gone-sides`。
   - 要進正在準備的版本的修正（例如 `release/v0.1.0`），PR 的 base 選那條 release 分支，合併後再帶回 `main`。不確定的話先問維護者。
2. **一個 PR 做一件事**。不相關的修改分開送，審查比較快，出問題也好退回。
3. **Commit 訊息**用 [Conventional Commits](https://www.conventionalcommits.org/zh-hant/v1.0.0/) 的格式：`類型(範圍): 做了什麼`，例如 `fix(frontend): upgrade packages with known security advisories`。
4. **送出前，在自己的電腦上確認**：
   - 前端：`pnpm --dir Frontend typecheck`、`pnpm --dir Frontend lint`、`pnpm --dir Frontend test`，以及有改到的 app 能 build（`pnpm --dir Frontend build:demo`、`build:admin`）。
   - 後端：`uv --directory Backend run ruff check` 和 `ruff format`，以及 `pytest`。
   - 改了 SQLAlchemy model：一定要附 Alembic migration，而且 `alembic heads` 只能有一個。
   - 改了 REST API 或 GraphQL schema：跑 `pnpm --dir Frontend schemas:generate`，把產生的型別一起 commit，CI 會檢查。
5. **PR 說明寫三件事**：
   - **改了什麼、為什麼**：連到對應的 issue、規格（`Backend/Spec/…`）或 ADR。
   - **怎麼驗證的**：跑了哪些測試、手動測了哪些畫面或 API。
   - **影響**：資料庫 migration、設定或環境變數、權限、對外 API 有沒有變。
6. 有畫面改動的，附前後對照的截圖（手機和桌機）。

## 審查與合併

- `main` 有分支保護：**至少要 1 位維護者 approve**，必過的 CI 檢查也要通過，才能合併。不能直接 push 到 `main`。
- 改到 [`.github/CODEOWNERS`](.github/CODEOWNERS) 列的路徑時，GitHub 會自動請負責的維護者審查。
- CI 會跑：
  - `frontend-ci`：重新產生前端型別合約，檢查跟 commit 的一致，再跑型別檢查、lint 和測試。
  - `backend-tests`：後端 pytest。
  - `ruff-check`：後端格式和 lint。
  - `alembic-heads`：migration 只能有一個 head。
- 審查的人看：行為對不對、有沒有測試、權限和個資有沒有處理好、文件有沒有跟著改。有不同意見就在 PR 討論，討論的結果寫進 PR 或 ADR，不要只留在聊天群組。
- 審查意見都處理好、CI 都過了以後，由作者或維護者用 **merge commit** 合併。
- 合併以後刪掉分支。

## 設計稿

設計稿不在 `main`，在設計師的分支 `sucrelindesign`，兩個分支互不合併。怎麼讀、怎麼在兩邊搬檔案，見 [`Design/GUIDE.md`](Design/GUIDE.md)。設計素材用 CC BY-SA 4.0。

## 用 AI 工具寫的程式

可以用 AI 工具（例如 Claude Code）協助寫程式和文件，repo 裡的 `CLAUDE.md`、`AGENTS.md` 就是給這些工具看的守則。不過：

- **送 PR 的人要為內容負責**：自己讀過、跑過測試，能回答審查的問題。
- 審查標準跟人寫的程式一樣，不會因為是 AI 寫的就放寬。
- 不要把不能公開的資料（密碼、金鑰、真實個資、未公開的資安報告）貼進 AI 工具。

## 維護者分工

| 範圍 | 維護者（GitHub 帳號） |
|---|---|
| 專案管理、授權、行為準則 | `@carolchu1208` |
| 後端（`Backend/`）、規格（`Spec/`、`Backend/Spec/`） | `@Taiwanchaoh`、`@jujuyuzu` |
| 前端（`Frontend/`） | `@jujuyuzu`、`@chingweih`、`@hanhsienlei` |
| 設計（`Design/`、設計分支） | `@sucrelindesign` |
| CI、部署（`.github/`、`DEPLOY.md`） | `@jujuyuzu`、`@Taiwanchaoh` |

實際自動指派審查的規則，以 [`.github/CODEOWNERS`](.github/CODEOWNERS) 為準。
