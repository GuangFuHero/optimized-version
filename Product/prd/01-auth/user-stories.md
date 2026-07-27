# User Stories — 身份認證 (Auth)

> **根基文件。** 定義「為誰、在什麼情境、想達成什麼價值」；同資料夾的 [`prd.md`](prd.md) 是對應的功能規格（如何實作）。
> 閱讀與設計順序：先讀本文件（問題空間），再讀 `prd.md`（解法空間），避免從功能反推需求。
>
> ⚠️ 本份 stories 係早期自 `prd.md` 反向提取，尚未經獨立的問題空間盤點（深度可對照 [05](../05-member-management/user-stories.md) / [08](../08-ticket-management/user-stories.md)）。作為根基使用前請先複核。

* **As a** 市民或志工，**I want** 用 Line 或 Google 帳號一鍵登入，**so that** 不需要記住額外的帳號密碼。
* **As a** 市民或志工，**I want** 用手機號碼收 SMS 驗證碼登入，**so that** 在沒有社群帳號的情況下也能使用平台。
* **As a** 後台管理人員，**I want** 透過究平安 SSO 登入後自動取得對應權限，**so that** 不需要手動切換角色，能直接開始工作。
