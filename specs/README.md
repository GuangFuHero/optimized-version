# specs — 規格樹

**本資料夾是產品與工程規格的唯一權威來源。** 依「發布版本 → feature → 文件層」三層組織。

```
specs/
├── ACTIVE_VERSION          # 新規格要落在哪一版（目前 v1.0.0）
├── v1.0.0/                 # 一個發布版本
│   ├── README.md           #   本版範圍與 feature 列表
│   └── 06-map-decision-support/
│       ├── user-stories.md #   問題空間
│       ├── prd.md          #   產品規格
│       ├── research/       #   決策依據
│       └── engineering/    #   工程規格：spec.md / plan.md / tasks.md / checklists/
├── v2.0.0/                 # 下一版（目前只有 backlog）
├── _shared/                # 橫切定義，不屬於任何單一 feature 或版本
├── _template/              # 新 feature 的範本
└── _archive/               # 已凍結，勿引用
```

**入口：** [v1.0.0 範圍](v1.0.0/README.md) · [v2.0.0 backlog](v2.0.0/backlog.md) · [權限定義 04-rbac](_shared/04-rbac.md) · [跨 feature 旅程](_shared/user-journey.md) · [工程規格閱讀指引](_shared/engineering/specs-reading-guide.md)

## 三層文件，上層是下層的來源

| 檔案 | 層 | 回答什麼 | 權威性 |
|------|----|----------|--------|
| `user-stories.md` | 問題空間 | 為誰、在什麼情境、想達成什麼價值 | ✅ 最高 |
| `prd.md` | 產品規格 | 系統該有什麼行為、什麼算完成 | ✅ 權威 |
| `engineering/spec.md` | 工程規格 | 如何實作、資料模型、API、任務拆解 | ✅ 權威（實作面） |
| `research/` | 決策依據 | 成熟產品怎麼做、為什麼這樣選 | 參考 |

**閱讀順序：先 `user-stories.md`，再 `prd.md`，最後 `engineering/`。** 避免從功能反推需求。

衝突時往上走：工程規格與 PRD 衝突，以 PRD 為準並回報差異；PRD 與 user-stories 衝突，以 user-stories 為準。

`engineering/` 之所以是子資料夾而不是平鋪，有兩個理由：產品層的 `research/`（產品調研）與工程層的 `research.md`（技術調研）名稱會撞；且一個 feature 可能對應多份工程規格（如 08 有 request-management 與 volunteer-dispatch 兩份，各自一個子資料夾）。

## 版本規則

一個版本 = 一個發布里程碑。**一個 feature 同時只存在於一個版本資料夾**，不跨版本複製。

- **版本資料夾以 semver 命名**：`v<major>.<minor>.<patch>`，例如 `v1.0.0`、`v1.1.0`、`v2.0.0`。三段都要寫滿，`v1` 或 `v1.0` 都不合法——工具鏈以 `sort -V` 排序，補滿三段才能正確比較（`v1.10.0` 才會排在 `v1.9.0` 之後）。
- 語意沿用 semver：破壞性的模型或流程重做進 major，既有 feature 的增補進 minor，規格勘誤進 patch。

- **編號跨版本唯一。** `06-map-decision-support` 從 v1.0.0 移到 v2.0.0 之後仍是 06。這讓 `[[06-map-decision-support]]` 這類引用不因換版失效，也讓工具鏈能用編號跨版本定位。
- **推進到下一版就是 `git mv` 整個資料夾**，然後更新兩邊 `README.md` 的表格。
- **`ACTIVE_VERSION` 決定新 feature 落在哪。** 這是宣告不是推測——`v2.0.0/` 可以先作為 backlog 存在很久，才輪到它成為正在寫規格的版本。要切版就改這個檔。
- 版本內的延後項目記在下一版的 `backlog.md`，但**決策本身留在原 PRD 的「開放問題」**，backlog 只是索引。

## 橫切定義

不屬於任何單一 feature 的東西放 [`_shared/`](_shared/)，各 feature 引用而不重述。

| 主題 | 文件 |
|------|------|
| 角色權限 RBAC | [`_shared/04-rbac.md`](_shared/04-rbac.md) — 平台 5 角色職掌、Team 內角色、資料可見性矩陣、各模組權限總表 |
| 跨 feature 旅程 | [`_shared/user-journey.md`](_shared/user-journey.md) |
| 橫切工程文件 | [`_shared/engineering/`](_shared/engineering/) — ER 圖、GraphQL API 設計、RBAC 權限設計、feature 相依分析 |

資料模型的實際狀態以 [`_shared/engineering/er-diagram.md`](_shared/engineering/er-diagram.md) 為準。

## 新增 feature

跑 `/speckit.specify`，或手動複製 [`_template/`](_template/) 下的兩份範本。腳本會依 `ACTIVE_VERSION` 建出 `specs/<version>/<NN-feature>/` 並同時鋪好產品層與 `engineering/`。

先寫 `user-stories.md`，再寫 `prd.md`。

## 撰寫規範

- **User Story 是脊椎**：UX Flow、功能需求、驗收標準都要對應得到某條 story。
- **乾淨、解耦、自足**：一份 PRD 不纏繞其他 PRD，沒有上下文的人也能讀懂。
- **不寫變更紀錄／版本號**——歷史交給 Git，狀態寫在 front-matter 的 `status`。
- **章節不編號**，且不自創同義標題（統一用「開放問題」「驗收標準」）。跨文件引用寫章節名稱，不寫 `§1.3`。
- 跨 feature 引用用 `[[NN-feature-slug]]`——**不寫相對路徑**，這樣 feature 換版移動時引用不會壞。

每份 PRD 開頭有 YAML front-matter：`feature` / `title` / `status` / `owner` / `depends_on` / `design`。
`status` 取值：`draft` → `definition` → `approved` → `shipped`。

## 相關文件

| 文件 | 說明 |
|------|------|
| [`../DOCS.md`](../DOCS.md) | 全 repo 文件地圖：哪份文件對哪件事有權威、哪些已凍結 |
| [`_archive/`](_archive/) | 已凍結文件，**勿引用** |
| [`../.specify/`](../.specify/) | spec-kit 工具鏈（範本與腳本），由 `/speckit.*` 指令驅動 |
