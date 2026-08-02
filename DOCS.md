# 文件地圖 — 島嶼守望 Wanguard

本頁說明現行文件的權威邊界。歷史路徑只供追溯，不得覆蓋 canonical 產品文件。

## 產品規格入口

產品定義集中於 [`specs/`](./specs/README.md)：

```text
specs/
  versions/                 正式 Version manifest；只彙整 Feature 與發布證據
  product-areas/            長期穩定的產品能力，不隨 Version 移動
    <semantic-area>/
      README.md             狀態、最短閱讀路徑、active Features、已知衝突
      prd.md                長期目的與範圍
      spec.md               已發布 baseline；首次發布前可以不存在
      decisions.md          已批准且仍有效的決策
      features/
        <FEATURE-ID>-<slug>/
          feature.md        一次變更、Open decisions、Acceptance criteria
          spec.md           必要時定義可觀察產品規則
          flow.md           必要時描述跨角色或狀態順序
          validation.md     Ready 前建立；記錄不可變 build 的驗證結果
```

人類讀者的三步路徑：

```text
產品區 README -> Target Version -> 負責的 Feature
```

AI agent 必須先讀 [`AGENTS.md`](./AGENTS.md)，再依相同路徑縮小範圍。

## Version 與發布語意

- [`v0.1.0`](./specs/versions/v0.1.0.md) 是早期試行版，涵蓋 Access Control、Member Management、Resource Stations、Task Management。
- [`v0.2.0`](./specs/versions/v0.2.0.md) 規劃 Identity and Account、Map Decision Support、Emergency Announcements。
- Feature 可獨立完成、驗證與上線；對使用者上線即為 `Released`，並立即更新產品區 baseline。
- Version 之後彙整一批 Released Features，不包住 Feature 資料夾，也不決定 Feature 是否已上線。
- `ACTIVE_VERSION` 只提供新 Feature 的預設 Target Version。

## 命名與歷史路徑

產品區使用 semantic slug，不使用 `01-10` 排序編號。舊名稱對照集中於 [`specs/product-areas/README.md`](./specs/product-areas/README.md)。舊的 `specs/v1.0.0/`、`specs/v2.0.0/` 與衝突工程文件會在內容遷移完成後移入 `specs/_archive/`。

## 工程與產品邊界

- [`Backend/`](./Backend/) 與 [`Frontend/`](./Frontend/) 是現行實作。
- Feature-local `engineering/` 只保存必要且已對齊的實作契約。
- `specs/_shared/engineering/` 只保存真正跨產品區的契約。
- 工程與產品行為衝突時，列出差異與影響並等待 Owner；不得自行覆蓋產品規格。

## 驗證

每次產品規格變更後執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-specs.ps1
```

文件檢查通過不代表 runtime validation 已完成。
