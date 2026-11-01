# Design/ — 設計師的 agent 守則

`main` 是唯一的真實來源。設計師在 `sucrelindesign` 分支工作，用 PR 合併回 `main`。
前端工程師（和他們的 agent）只看 `main` 上的 `Design/`，所以檔案放對位置才會被看到。

## 檔案放哪裡

```text
Design/
├── 前台/                 民眾看到的網站（public site）
│   ├── *.html            原型頁面，一個畫面一支
│   ├── js/               原型的程式
│   ├── docs/             裁示、規格說明、截圖（.md + 圖）
│   └── _ds/wan-guard-design-system-…/   設計系統匯出（tokens/*.css、字型）
├── 後台/                 管理平台（admin），結構同上；元件 Components.html 也在這
├── handoff/              給工程師搬進 Frontend/libs/ui 的 TSX，一個元件一個資料夾
├── CHANGELOG.md          每次合併一筆；工程師從這裡接工作
└── README.md
```

- 原型頁面放 `前台/` 或 `後台/`；裁示與規格放那一側的 `docs/`。
- 給工程師的程式碼放 `handoff/<元件名>/index.tsx`。以前放在 `components/`，下一次合併起改放 `handoff/`（把現有的搬過去，並在 CHANGELOG 記一筆）。
- 只動 `Design/` 底下的檔案。**不要改 `Frontend/` 的任何東西**，包括 `design-tokens.ts`；那是工程師照你的 handoff 與 CHANGELOG 去改。

## Tokens（設計系統匯出）

- `前台/_ds/` 和 `後台/_ds/` 各放一份，兩份**必須完全相同**，在同一個 PR 一起更新。
  合併前檢查：`diff -r Design/前台/_ds Design/後台/_ds` 沒有輸出。
- 改了任何 token，在 CHANGELOG 逐一列出「token 名：舊值 → 新值」。
- 前端的 `design-tokens.ts` 可能比 `_ds/` 新（有些裁示已先寫進前端）。重新匯出前先看它開頭的註解，別把已裁示的值匯回舊的。

## 手機

手機的樣子是設計的一部分，不是工程師自己決定的事。
決定了手機上的規則（字級、點擊範圍、斷點、底部安全區…），寫進那一側的 `docs/`，不要只寫在程式註解裡。
目前前端已有的手機規則與還沒定的問題，列在 `Frontend/docs/design-system.md` 的「手機」一節；回答那裡的問題時也寫進 `docs/`。

## 每次合併到 main 的 PR

1. 只含 `Design/` 底下的路徑。
2. 保留工程師在 `CHANGELOG.md` 打的勾（以 `main` 上的版本為準）。
3. `CHANGELOG.md` 最上面加一筆（格式見該檔），結尾一定有「Frontend 待辦」清單；沒有待辦就寫「無」。
4. PR 說明列出受影響的畫面（原型檔名）。

設計分支上也有 `Frontend/` 的 commit，所以不要直接從它開 PR。照這樣切一個只有 `Design/` 的分支：

```sh
git fetch origin
git switch -c design/<這次的主題> origin/main        # 從最新的 main 開新分支
git checkout sucrelindesign -- Design/                # 只帶過來 Design/
git status                                            # 只能看到 Design/ 底下的路徑
git diff origin/main -- Design/CHANGELOG.md           # 工程師打的 [x] 不可以變回 [ ]；有就改回 [x]
git commit -m "design: <這次的主題>" && git push -u origin HEAD   # 再開 PR 到 main
```

- 設計分支上刪掉的檔案不會跟著過來；要刪的話在新分支上 `git rm`。
- 設計分支裡 `Frontend/` 的改動**不放進這個 PR**：要給工程師的程式碼放 `handoff/`，或在 #uiux 告訴工程師。

## 不要做

- 不要改名或搬動既有路徑，除非在 CHANGELOG 記下「舊路徑 → 新路徑」：前端文件連結到這些檔案。
- 不要新增大型二進位檔（影片、大圖、新字型）。截圖壓到合理大小再放。
