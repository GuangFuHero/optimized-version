# Design/ — 設計師的 agent 守則

設計師在 `sucrelindesign` 分支工作，這個分支就是**最新的設計**，**不會合併進 `main`**。
前端工程師永遠讀這個分支的最新版本（不釘在某個 commit）。`main` 會合進這個分支，反過來不會。
這份守則放在 `main`，合進來之後你才看得到它。

## 跟上 main

定期把 `main` 合進設計分支（至少每次交付前一次）：

```sh
git switch sucrelindesign
git fetch origin && git merge origin/main
```

- **第一次合 `main` 一定要這樣做**（`main` 刪掉了舊的 `Design/前台/`、改寫了 `Design/README.md`）：

  ```sh
  git merge --no-commit origin/main   # 已經在 merge 中（停在衝突、有 MERGE_HEAD）就跳過這行，直接做下一行
  git checkout HEAD -- "Design/前台" Design/README.md   # 拿回設計分支的版本
  git diff --stat HEAD -- Design/                        # 只能剩 Design/CLAUDE.md、Design/AGENTS.md
  git commit
  ```

  沒有衝突也要做：設計分支沒改過的檔（`_ds/`、字型、logo）會被直接刪掉，不會出現衝突。
- 其他衝突在 `Design/` 底下：在設計分支上解決，保留設計分支的設計檔。
- 衝突在 `Design/` 以外的檔案：先停下，在 #uiux 請工程師處理，不要自己改。

## 檔案放哪裡（設計分支上）

```text
Design/
├── 前台/                 民眾看到的網站（public site）
│   ├── *.html            原型頁面，一個畫面一支
│   ├── js/               原型的程式
│   ├── docs/             裁示、規格說明、截圖（.md + 圖）
│   ├── 更新說明.md        每次交付的詳細說明
│   └── _ds/wan-guard-design-system-…/   設計系統匯出（tokens/*.css、字型）
├── 後台/                 管理平台（admin），結構同上；元件 Components.html 也在這
├── handoff/              給工程師搬進 Frontend/libs/ui 的 TSX，一個元件一個資料夾
├── CHANGELOG.md          給工程師的待辦清單（格式見下）
└── README.md
```

- 給工程師的程式碼放 `handoff/<元件名>/index.tsx`。現在放在 `components/` 的，下次交付時搬到 `handoff/`，並在 CHANGELOG 記一筆。
- handoff 的 TSX：給前台畫面的用 MUI 圖示（`@mui/icons-material`），給後台畫面的用 Lucide（`lucide-react`）。
- 只改 `Design/` 底下的檔案。`Design/` 以外的改動（根目錄 `README.md`、`logo/`、`Frontend/`…）不要自己做：程式碼放 `handoff/`，其他在 #uiux 告訴工程師，由他們開 PR 到 `main`。
- 不要改名或搬動既有路徑，除非在 CHANGELOG 記下「舊路徑 → 新路徑」：前端文件與程式註解連結到這些路徑。
- 不要新增大型二進位檔（影片、大圖、新字型）。截圖壓到合理大小再放。

## Tokens（設計系統匯出）

- `前台/_ds/` 和 `後台/_ds/` 各放一份，兩份**必須完全相同**，一起更新。
  檢查：`diff -r Design/前台/_ds Design/後台/_ds` 沒有輸出。
- 改了任何 token，在 CHANGELOG 逐一列出「token 名：舊值 → 新值」。
- 前端的 `Frontend/libs/ui/src/theme/design-tokens.ts` 可能比 `_ds/` 新（有些裁示已先寫進前端）。重新匯出前先看它開頭的註解，別把已裁示的值匯回舊的。不要改這支檔案。

## 手機

手機的樣子是設計的一部分，不是工程師自己決定的事。決定了手機上的規則（字級、點擊範圍、斷點、底部安全區…），寫進那一側的 `docs/`，不要只寫在程式註解裡。
前端已有的手機規則與還沒定的問題，列在 `Frontend/docs/design-system.md` 的「手機」一節。

## CHANGELOG.md（設計分支上）

給工程師的**簡短待辦清單**；詳細說明照舊寫在各側的 `更新說明.md` 或 `docs/`，每一筆連過去。
每次交付在**最上面**加一筆。工程師不在這裡打勾：進度記在 `main` 的 `Frontend/docs/design-system-audit.md`，他們的 PR 會寫出對應哪一筆。

```markdown
## <日期> <一句話說這次改了什麼>

**影響畫面**：`後台/任務管理 Ticket Management.html`、…

**詳細說明**：`後台/更新說明.md` 的這次那一節、`後台/docs/….md`

### Token 異動（沒有就寫「無」）
- `--color-xxx`：`#舊值` → `#新值`

### 路徑異動（沒有就省略）
- `舊路徑` → `新路徑`

### Frontend 待辦（沒有就寫「無」）
- 要做的事（對應的原型畫面或 handoff 檔案）
```
