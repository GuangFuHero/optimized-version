# Wireframe — 任務管理

用畫面而非文字描述設計，供討論與拍板使用。**不是規格**——拍板後的結論寫回 [`../prd.md`](../prd.md)。

| 檔案 | 在回答什麼 |
|---|---|
| [`01-current-model.md`](01-current-model.md) | 現在的資料實際長什麼樣（用後端真實種子資料畫） |
| [`02-field-admin-options.md`](02-field-admin-options.md) | 「管理員自訂欄位」的三個做法，後台畫面對照 |
| [`03-form-effect.md`](03-form-effect.md) | 每個做法對報案表單的實際影響 |
| [`custom-fields.html`](custom-fields.html) | **可互動線框圖** — 直接用瀏覽器開啟。套用災害欄位組、欄位庫搜尋與自動整併、停用機制，右側即時預覽表單 |

## 怎麼讀

先看 01 弄懂現況，再看 02 選一個做法，用 03 檢查那個做法出來的表單能不能接受。

ASCII 圖可直接在編輯器與 GitHub 上讀、可 diff、不需要工具；`custom-fields.html` 是單一自足檔案（無外部相依），雙擊即可在瀏覽器操作。

視覺沿用 claude.ai Design 的 `Wan Guard Design System`（`ui_kits/console` 的 shell 結構與 `tokens/semantic.css` 的色票）。**只表達結構與資訊層級，不表達視覺樣式**——配色、間距、元件樣式屬 UI 設計，不在此處決定。
