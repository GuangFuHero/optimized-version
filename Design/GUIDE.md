# Design — 設計在設計師的分支上

設計原型與設計系統匯出**不在 `main`**，在設計師的分支 `sucrelindesign`。那個分支就是最新的設計，不會合併進 `main`；
`main` 上的 `Design/` 只放這份說明與設計師 agent 的守則（[`CLAUDE.md`](CLAUDE.md)）。

## 設計分支上有什麼

| 路徑 | 內容 |
| --- | --- |
| `Design/前台/` | 民眾看到的網站：原型頁面（`*.html`）、`js/`、`docs/`（裁示與規格）、`更新說明.md`、`_ds/`（設計系統匯出） |
| `Design/後台/` | 管理平台，結構同上；`元件 Components.html` 是共用元件的設計稿 |
| `Design/handoff/` | 給工程師搬進 `Frontend/libs/ui` 的 TSX（目前在 `Design/components/`） |
| `Design/CHANGELOG.md` | 給工程師的簡短待辦清單，連到各側的詳細說明 |

## 怎麼讀

每次都先抓最新版：

```sh
git fetch origin sucrelindesign
git show "origin/sucrelindesign:Design/後台/docs/README.md"           # 讀單一檔案
git worktree add --detach ../design-latest origin/sucrelindesign     # 要開原型 HTML 時，開一個唯讀的 worktree
```

- 原型 HTML 直接用瀏覽器開，或在 worktree 的 `Design/` 底下跑 `npx serve .`。需要連網（React、Babel 等從 CDN 載入）。
- 之後要更新 worktree：`git -C ../design-latest checkout --detach origin/sucrelindesign`（先 fetch）。
- **不要**把設計分支 merge 或 cherry-pick 進前端的分支。
- 原型裡的示範資料、示範帳號、localStorage 狀態只是為了演出流程，不是規格；欄位與 API 以 `Backend/Spec/Docs/er-diagram.md` 與 GraphQL schema 為準。
- 程式註解與 spec 裡寫的 `Design/前台/…`、`Design/後台/…` 路徑，指的都是設計分支上的檔案。

## 兩個分支之間搬檔案（工程師）

`main` 和設計分支**互不合併**，設計師也不會把 `main` 合進她的分支。需要的檔案由工程師一個一個複製過去：

```sh
git fetch origin

# main → 設計分支（例：更新設計師 agent 的守則）
git switch sucrelindesign && git pull --ff-only
git checkout origin/main -- Design/CLAUDE.md Design/AGENTS.md
git commit -m "docs: copy the designer's agent guide from main"

# 設計分支 → 你的前端分支（例：頁面要用的圖或字型），放到 Frontend/ 裡用到它的地方
git show "origin/sucrelindesign:Design/<路徑>" > "Frontend/<放的位置>"
git add "Frontend/<放的位置>" && git commit
```

- 只複製需要的檔案，不要整個資料夾覆蓋。
- 設計檔不要放回 `main` 的 `Design/`；那裡只放這份 `GUIDE.md` 和設計師 agent 的守則。
- 設計分支的 `Design/README.md` 是設計師的總覽，和這份 `GUIDE.md` 是不同的檔，不要互相覆蓋。
- 往設計分支複製之前，先在 #uiux 告訴設計師。

前端工程師的 agent 照 [`../Frontend/CLAUDE.md`](../Frontend/CLAUDE.md)；設計系統說明在 [`../Frontend/docs/design-system.md`](../Frontend/docs/design-system.md)。
