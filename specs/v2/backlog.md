# v2 Backlog

各 v1 PRD 中**明文標記延後至 v2** 的項目，彙整於此以便排程時一次看完。

**這裡不是決策來源。** 每一條的權威定義都在原 PRD 的「開放問題」段落，本頁只是索引；要改決策請改原 PRD，不要改這裡。有些項目本身仍是待決問題（「要不要做」尚未拍板），不代表已排入 v2。

| 來源 feature | 項目 | 狀態 |
|---|---|---|
| [03-user-settings](../v1/03-user-settings/prd.md) | **敏感變更撤回冷靜期** — 變更後 24h 可撤回 | 列為 v2 可選 |
| [03-user-settings](../v1/03-user-settings/prd.md) | **帳號刪除上線時程** — 30 天寬限軟刪除歸 v1 或 v2、匿名化欄位範圍 | 待決 |
| [06-map-decision-support](../v1/06-map-decision-support/prd.md) | **行政區 SHP 圖資** — 匯入台灣行政區界轉 GeoJSON 預載，劃區可吸附行政區界 | 排程 v2 |
| [06-map-decision-support](../v1/06-map-decision-support/prd.md) | **沿線 Buffer 工具** — Turf.js `buffer`，v1 非必要 | 排程 v2 |
| [06-map-decision-support](../v1/06-map-decision-support/prd.md) | **Team Admin 自家責任區內畫子區** — 是否開放 | 待決 |
| [07-resource-station](../v1/07-resource-station/prd.md) | **貢獻者信任分級** — 高信任貢獻者自動通過低風險修改 | 待決 |
| [09-emergency-announcement](../v1/09-emergency-announcement/prd.md) | **多語支援** — 中英以外的語言納入 v1 或 v2 | 待決 |
| [04-rbac](../_shared/04-rbac.md) | **獨立唯讀 Viewer 角色** — v1 先用「Government 唯讀子集」暫代 | 列為 v2 |

## 怎麼把一個項目變成 v2 feature

1. 在原 PRD 把該項目從「開放問題」移出，寫成明確的產品決策。
2. 若它大到自成一個 feature：建 `specs/v2/<NN-feature>/`，沿用**原本的 feature 編號**（編號跨版本唯一，見 [`../README.md`](../README.md)）。
3. 若它只是既有 feature 的增修：把整個 feature 資料夾 `git mv` 到 `specs/v2/`，並在 v1 留下的位置從 [`README.md`](README.md) 的表格更新指向。
4. 從本頁移除該列。
