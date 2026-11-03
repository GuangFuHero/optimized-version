# Agent 指引

- 前端工作（`Frontend/`）：先照 [`Frontend/CLAUDE.md`](Frontend/CLAUDE.md)，動 UI 前一定要讀設計系統。
- 設計工作（`Design/`）：照 [`Design/CLAUDE.md`](Design/CLAUDE.md)。
- 設計在設計師的分支 `sucrelindesign`（不會合併進 `main`），讀法與兩個分支之間怎麼搬檔案見 [`Design/GUIDE.md`](Design/GUIDE.md)。
- 程式碼註解、docstring 與 `main` 上的文件（含 Spec、ADR、decisions.md）：寫成不看別處也懂的句子，不放工單編號（如 WG-…、ADMIN-…）、issue／PR 編號、commit hash、Notion／Discord 連結、日期（指這段文字何時寫、何時決定；法規生效日、測試資料時間這類內容本身的日期照寫）。這些放 commit 訊息或 PR 說明；git 已記下每段文字何時、從哪個 PR 加進來。
  - 可以留：ADR、Spec、Spec 裡的需求（FR-、SC-…）、設計規則（BTN-、TAG-、INP-、PRG-…）的編號，它們指向 repo 或設計分支裡的定義；註解只寫「依 ADR-…」這類引用也可以。
  - 可以留：spec-kit（`Backend/.specify/`）範本與 constitution 自帶的日期欄位，例如 `spec-template.md` 的 `**Created**`、`plan-template.md` 的 `**Date**`，以及用範本產生的 spec、plan 裡的這些欄位；alembic 產生 migration 時寫進 docstring 的 `Create Date` 也留著。
  - 可以留：`Frontend/docs/design-system-audit.md` 偏差表的「PR」欄，照那份文件的規則填。
  - 每條 ADR 的狀態行與 decisions.md 檔頭的 Status 只寫狀態，例如「狀態：ACCEPTED」、「Status: ACCEPTED」、「狀態：被 ADR-… 取代」；原因或驗證結果寫在下一行。
  - 後端的 Spec、ADR、decisions.md 不寫前端檔案路徑；原型路徑（`Design/…`）可以寫。
  - 文件檔頭的「最後更新」日期不要新增，改文件時也不用更新；git 記著每次修改的時間。spec-kit 自帶的 `Last Amended`、`Last updated` 照 spec-kit 的流程更新。
  - 已經寫進去的不用回頭改，包括現在還開著的 PR 裡的文字。
