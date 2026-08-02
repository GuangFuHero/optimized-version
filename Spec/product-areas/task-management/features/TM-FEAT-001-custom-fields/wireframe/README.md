# Wireframe — 任務管理

用畫面而非文字描述設計，供討論與拍板使用。**不是規格**——拍板後的結論必須寫回 [`../feature.md`](../feature.md) 或 [`../spec.md`](../spec.md)。

| 檔案 | 在回答什麼 |
|---|---|
| [`01-current-model.md`](01-current-model.md) | 現在的資料實際長什麼樣（用後端真實種子資料畫） |
| [`02-field-admin-options.md`](02-field-admin-options.md) | 「管理員自訂欄位」的三個做法，後台畫面對照 |
| [`03-form-effect.md`](03-form-effect.md) | 每個做法對報案表單的實際影響 |
| [`../flow.md`](../flow.md) | 已清理的使用者行為流程；只描述順序並引用產品規則 |
| [`custom-fields.html`](custom-fields.html) | **可互動線框圖** — 直接用瀏覽器開啟。套用災害欄位組、欄位庫搜尋與自動整併、停用機制，右側即時預覽表單 |

## 怎麼讀

先看 01 理解歷史模型，再看 02 與 03 了解當時的畫面提案；產品行為與未決問題仍以 Feature 文件為準。

ASCII 圖可直接在編輯器與 GitHub 上讀、可 diff、不需要工具；`custom-fields.html` 是單一自足檔案（無外部相依），雙擊即可在瀏覽器操作。

ASCII 圖**只表達結構與資訊層級**，不表達視覺樣式。

## 已知落差

畫面上只畫了救援／人力／物資三種需求種類，實際有**四種**——還有一個**醫療**。醫療目前沒有任何設定欄位，依 `TM-CF-119` 這是合法狀態，表單照常運作，只是不顯示自訂欄位區塊。要重畫這些圖時請補上第四個頁籤。

`custom-fields.html` 的視覺沿用 claude.ai Design 的 `Wan Guard Design System`（`ui_kits/console` 的 shell 結構與 `tokens/semantic.css` 的色票），但它仍是**線框圖不是設計稿**——用既有 token 是為了讓討論聚焦在流程而非配色，最終的元件樣式與細節仍以 Design System 專案為準。
