# Wanguard 產品規格治理重構設計

**日期：** 2026-08-01
**狀態：** 已完成書面覆核，等待實作計畫
**範圍：** `specs/` 的 Version、產品區、Feature、Spec、Flow、Validation 與 Claude 交接規則

## 目標

重構 Wanguard 的產品文件，使產品能力可以獨立定義、開發、驗證與發布，同時在指定時間彙整成正式 Version。文件必須讓 PM、設計、工程與 AI agent 能用最短閱讀路徑找到唯一有效來源，並以機械式檢查防止文件角色、Version 歸屬與連結再次漂移。

## 已確認的產品與發布語意

- 第一個目標版本是早期試行版 `v0.1.0`，不是穩定正式版，也不是已發布 baseline。
- Access Control（原 RBAC）與 Member Management 已進入開發；Resource Stations 已有規格；Task Management 正在定義。
- `v0.1.0` 收錄 Access Control、Member Management、Resource Stations 與 Task Management；Identity and Account、Map Decision Support、Emergency Announcements 排入 `v0.2.0`，原 Guest Ticket Privacy 改為 Task Management 的 Feature。
- 各 Feature 可以獨立完成、驗證與上線，不必等待同一 Version 的其他 Features 一起發布。
- Feature 一旦對使用者上線即為 `Released`，並立即成為產品現況的一部分。
- 正式 Version 是一批 Released Features 的彙整與發布紀錄，不是 Feature 文件的容器，也不決定 Feature 的即時發布狀態。
- 目前沒有可用的 released baseline anchor；在第一個 Feature 發布前，產品區可沒有 baseline `spec.md`。這是 readiness 資訊，不得用猜測補齊。

## 架構決策

採用「產品區固定、Version 獨立 manifest」模型。

```text
specs/
  README.md
  ACTIVE_VERSION
  versions/
    v0.1.0.md
    v0.2.0.md
  product-areas/
    identity-and-account/
    access-control/
    member-management/
    map-decision-support/
    resource-stations/
    task-management/
      README.md
      prd.md
      spec.md                    # 首次發布後才建立
      decisions.md
      features/
        TM-FEAT-001-custom-fields/
          feature.md
          spec.md
          flow.md
          validation.md
      research/
      wireframe/
    emergency-announcements/
  _shared/
  _template/
  _archive/
```

### Version 的位置與責任

Version 放在 `specs/versions/<version-id>.md`。它只回答：

- 這次正式版本的單一產品成果是什麼。
- 收錄哪些 Feature。
- 哪些項目明確排除或延後。
- 每個收錄 Feature 的狀態、發布證據、validation 與不可變 commit。
- 正式彙整 gate 是否通過。

Version 不得：

- 包住產品區或 Feature 資料夾。
- 複製 Feature 的需求、Spec 或 Flow。
- 以移動 Feature 資料夾的方式表示升版。
- 使用 `main`、`latest` 等可移動名稱作為發布證據。

`ACTIVE_VERSION` 保留，只宣告新 Feature 預設應連到哪個 Version；它不決定文件實體位置。

### Version 編號規則

採用 Semantic Versioning，格式固定為 `vMAJOR.MINOR.PATCH`：

- `v0.x.y`：早期試行階段，產品行為仍可能快速調整，不承諾穩定相容。
- `v0.MINOR.0`：增加一批可獨立使用的產品能力，例如 `v0.1.0`、`v0.2.0`。
- `v0.MINOR.PATCH`：不擴大產品範圍的修正，例如 `v0.1.1`。
- `v1.0.0`：產品進入可對外穩定使用、開始承諾相容性的第一個正式版本。
- `v2.0.0` 以上：已穩定產品發生不相容的重大行為變更。

不使用 `v0.0.0` 作為目標版本。它無法表達一批可辨識的交付範圍；尚未發布的狀態應由 Version status 與 Feature status 表達，而不是另造零版本。

### 產品區的責任

`specs/product-areas/<area-slug>/` 是一個長期穩定的產品能力位置，不隨 Version 移動。產品區以使用者可理解的能力命名，不加排序數字。

- `README.md`：狀態、最小閱讀路徑、active Features、baseline 狀態與已知衝突。
- `prd.md`：產品區的長期目的、範圍與核心取捨；首次發布前可承載初始產品範圍，但不是發布證據。
- `spec.md`：目前對使用者生效的 released baseline。首次發布前可以不存在。
- `decisions.md`：已批准且仍具約束力的決策；不保存訪談過程或工具操作紀錄。
- `features/`：一次產品演進的定義與歷史。
- `research/`：證據、探索與歷史材料，不具規格權威。
- `wireframe/`：討論媒介；拍板結果必須回寫 Feature 或 Spec。

現有 01–10 不保留為長期產品區編號，因為它混合了排序、產品區與 Feature 三種概念。新的產品區邊界為：

| 新產品區 | 來源與範圍 |
|---|---|
| `identity-and-account` | 合併原 01 Auth、02 Profile、03 Settings |
| `access-control` | 原 04 RBAC，具有獨立開發與發布生命週期 |
| `member-management` | 原 05 |
| `map-decision-support` | 原 06 |
| `resource-stations` | 原 07 |
| `task-management` | 原 08，並將原 10 Guest Ticket Privacy 收為 Feature |
| `emergency-announcements` | 原 09 |

`_shared/` 僅保留沒有獨立生命週期的共同資料模型、詞彙與跨產品區旅程。

技術文件不是每個產品區的必備層。只有當 API、資料、遷移或跨系統契約無法由產品 Spec 與程式碼清楚表達時，才在所屬 Feature 建立 `engineering/`；它不得另行定義產品行為。多個產品區共用的技術契約才放在 `_shared/engineering/`。

## Feature 生命週期

Feature 使用固定位置：

```text
product-areas/<area-slug>/features/<feature-id>-<slug>/
```

狀態為：

```text
Draft -> Ready -> In delivery -> Validated -> Released
                                  \-> Superseded
```

- `Draft`：允許 blocking Open decisions 與不完整 Spec。
- `Ready`：Owner 已批准，沒有 blocking Open decisions，`validation.md` 已完整覆蓋 AC 與 Spec rules。
- `In delivery`：實作進行中；產品行為仍以 Feature／Spec 為準。
- `Validated`：同一不可變 build 的所有適用 validation 項目已通過。
- `Released`：已對使用者上線；行為同步合併到產品區 baseline `spec.md`。
- `Superseded`：被後續 Feature 取代，但保留歷史。

每個 Feature 必須有且只有一個 `Target Version`。Feature 獨立上線後可以先成為 Released；Version manifest 之後再將它納入正式彙整。

### 命名規則

- 產品區資料夾使用穩定的英文能力名稱，不帶順序數字，例如 `task-management`。
- Feature ID 使用產品區代碼與三位流水號，例如 `TM-FEAT-001`；流水號只保證唯一，不表示優先順序或發布順序。
- Feature 資料夾使用 `<feature-id>-<slug>`，例如 `TM-FEAT-001-custom-fields`。
- Spec rule 使用能力代碼與三位流水號，例如 `TM-CF-101`。
- Acceptance criteria 使用 Feature-local `AC-01`、`AC-02`；不得用章節順序作跨文件引用。
- Version 的交付順序只由 manifest 表達，不編進產品區或 Feature 名稱。

既有名稱遷移後的 Feature IDs：

```text
IAM-FEAT-001-authentication
IAM-FEAT-002-user-profile
IAM-FEAT-003-user-settings
AC-FEAT-001-role-based-access
TM-FEAT-001-custom-fields
TM-FEAT-002-task-assignment
TM-FEAT-003-guest-ticket-privacy
```

## 文件角色與資訊路由

| 資訊 | 唯一位置 |
|---|---|
| 產品區入口、狀態、已知衝突 | 產品區 `README.md` |
| 一次產品演進、範圍、未決問題、AC | `feature.md` |
| 可觀察產品規則 | Feature `spec.md` |
| 跨畫面、角色或狀態順序 | Feature `flow.md` |
| 當前驗證清單與結果 | Feature `validation.md` |
| 已批准決策及理由 | 產品區 `decisions.md` |
| 已發布產品現況 | 產品區 baseline `spec.md` |
| 正式版本收錄與 gate | `versions/<version-id>.md` |
| 視覺外觀 | Figma 或 `wireframe/` |
| 研究與討論歷史 | `research/` |
| Feature 專屬技術契約 | Feature-local `engineering/`，只有必要時建立 |
| 跨產品區技術契約 | `_shared/engineering/` |

Open decisions 只能出現在所屬 Feature 的 `feature.md`。Flow 不得建立規則、限制、決策或建議；只引用 Feature Spec rule IDs。Validation 可重述預期結果以便測試，但不得創造新需求。

## Task Management 遷移

### 產品區入口

新增 `task-management/README.md`，提供：

- 現況為 `Definition`，不能宣稱 Ready。
- 最小閱讀路徑：README -> 目標 Version -> 負責的 Feature。
- 目前沒有 released baseline。
- 兩份舊 engineering spec 與現行 PRD 有契約衝突。
- active Features 與各自 blocking decisions。

### TM-FEAT-001 Custom Fields

自訂欄位影響多角色、多步驟、權限、資料保留、停用、錯誤、離線與併發，因此必須有獨立 Feature Spec 與 Flow。

```text
features/TM-FEAT-001-custom-fields/
  feature.md
  spec.md
  flow.md
  validation.md
```

遷移原則：

- D10–D16 已批准內容改寫為正常產品行為與有效 decisions。
- 原 D1–D16 grill 過程移到 `research/decision-history-2026-08-01.md`，保留證據但退出正式閱讀路徑。
- Q1–Q11 只留在 `feature.md` 的 Open decisions，並標示會阻塞哪些 AC 或 Spec rules。
- `spec.md` 使用 `TM-CF-101` 形式的穩定 ID。
- `flow.md` 只描述端到端順序並引用 `TM-CF-*`；移除 upsert、key、EAV 實作敘述與作者建議。
- `validation.md` 對應 AC 與 Spec rules；因尚未針對不可變 build 執行測試，所有核取方塊保持未勾選。

### TM-FEAT-002 Task Assignment

建立 Draft `feature.md`，集中唯一 blocking Open decision：

- 志工自行承接。
- Coordinator 指派後由志工接受。
- 兩者並存時的觸發條件、權限與多人協作規則。

在 Owner 拍板前不建立 Spec 或 Flow。兩份現有工程規格標記為 `legacy-unreconciled`，退出最小閱讀路徑但不刪除。工程文件不得再被稱為現行實作契約，直到其狀態、類型、身份與指派規則完成對齊。

兩份舊工程規格移到 `_archive/legacy-engineering/task-management/`。若日後某段 API 或資料契約仍有效，必須先對齊 Feature Spec，再把必要部分重建到對應 Feature 的 `engineering/`，不得整份搬回。

## 其他產品區的遷移

現有 01–10 依新的七個產品區邊界，從 `specs/v1.0.0/` 遷移到 `specs/product-areas/`。這不是一對一改路徑：01–03 合併為 Identity and Account，10 轉為 Task Management 的 Feature。搬移時同步所有入口、相對連結、舊 ID 對照與工程文件引用。

本輪不為其他產品區大量建立空白 Feature 文件。Access Control 與 Member Management 已進入開發，必須在其產品區 README 與 `versions/v0.1.0.md` 明確標示 `In delivery`，並列出「尚未完成 Feature 化／validation 化」的遷移 blocker。Resource Stations 與 Task Management 依現有證據標示 `Definition` 或 `Draft`。

Version 範圍固定如下：

| Version | 收錄範圍 |
|---|---|
| `v0.1.0` | Access Control、Member Management、Resource Stations、Task Management |
| `v0.2.0` | Identity and Account、Map Decision Support、Emergency Announcements，以及 v0.1 明確延後的獨立 Features |

產品區或 Feature 不得因被列入 Version manifest 就自動升級狀態；狀態只依決策、交付與驗證證據更新。

## Claude 與 Agent 防護

Repo 根目錄新增：

```text
AGENTS.md
CLAUDE.md
.agents/skills/manage-product-spec/SKILL.md
.agents/skills/derive-feature-spec/SKILL.md
```

規則：

- Claude 先讀根 `README.md`、`AGENTS.md`、`specs/README.md`，再讀產品區 README、目標 Version 與負責 Feature。
- `CLAUDE.md` 只指向 `AGENTS.md`，不複製治理規則。
- 變更 Feature／Version／Decision／Spec／Flow／Validation 時必須讀 repo-local skills。
- 不得自行把 Feature 改成 Ready、Validated 或 Released。
- 不得用新文件旁註來修正 canonical 文件；必須回到資訊的唯一來源修改。
- 不得修改與當前 Feature 無關的產品區。
- 若產品與工程契約衝突，列出衝突、影響與選項，等待 Owner；不得自行選答案。

## 機械式驗證

新增唯讀驗證腳本，並由文件交接規則要求每次規格變更後執行。腳本至少檢查：

1. `specs/versions/` 下只有 manifest Markdown，不得出現產品區資料夾。
2. Feature ID 與產品區代碼唯一，產品區名稱不得使用順序數字前綴。
3. 每個 Feature 有唯一且存在的 Target Version。
4. Feature status 使用合法值。
5. `Ready` 以上 Feature 必須有 `validation.md`；`Validated`／`Released` 必須全部核取並記錄不可變 build。
6. Flow 中不得出現 `Open decisions`、`待討論` 或建立新 Q 編號。
7. Flow 引用的 Spec rule IDs 必須存在。
8. Acceptance criteria IDs 必須由 Spec rules 與 validation 覆蓋。
9. 相對 Markdown 連結、Feature IDs、Version IDs 與產品區引用可解析；舊 `[[NN-slug]]` 只允許存在於明確的歷史材料。
10. README 列出的最小閱讀路徑存在。
11. `legacy-unreconciled` 文件不得出現在正式入口或 Version evidence。
12. 產品區 baseline 不得包含尚未 Released 的 Feature 行為。

第一輪驗證允許明確列出既有遷移 blocker，但新增或修改的文件不得增加新的違規。待產品區完成遷移後，逐步把 blocker 清單收斂為零。

## 遷移順序

1. 新增根治理規則、repo-local skills、模板與驗證腳本。
2. 建立 `product-areas/`、`versions/v0.1.0.md` 與 `versions/v0.2.0.md`，移除 Version 包住 Feature 的規則。
3. 依七個產品區邊界遷移 01–10，同步入口、舊 ID 對照和連結。
4. 建立每個產品區 README，標示真實狀態與遷移 blocker。
5. 重構 Task Management 的 decisions 與歷史資料。
6. 建立 TM-FEAT-001 的 Feature、Spec、Flow、Validation。
7. 建立 TM-FEAT-002 Draft，標記工程契約衝突。
8. 封存或退出過時 reading guide 與舊工程 spec 的正式入口。
9. 執行連結、ID、Version、AC、Spec、Flow 與 validation 驗證。
10. 產出 Claude handoff：目標、修改文件、有效決策、未決問題、驗證結果與下一位 Owner。

## 成功條件

- Version 不再包含或搬動產品區資料夾。
- 任何讀者能從根入口在三步內找到負責 Feature 的 canonical 文件。
- Task Management 的自訂欄位規則、流程、決策與未決問題各自只有一個權威位置。
- Task Management 的舊工程契約不再被誤認為現行產品行為。
- Access Control 與 Member Management 的實際 `In delivery` 狀態在 v0.1.0 manifest 可見，但不被誤標成 Released。
- v0.1.0 與 v0.2.0 的範圍、試行語意及升版規則可由 manifest 與版本規範直接判斷。
- Claude 必須遵循 repo-local AGENTS 與 skills，且驗證腳本能攔截結構、連結與角色漂移。
- 未執行實際產品測試時，不得勾選 validation 或宣稱 Ready／Validated／Released。

## 非目標

- 本輪不修改 Backend 或 Frontend 實作。
- 本輪不替 Owner 決定 Task assignment 模型或 Q1–Q11 的產品答案。
- 本輪不宣稱任何 Feature 已完成 runtime 驗證。
- 本輪不為尚未分析的產品區虛構 Feature 切分、Spec rules 或成功指標。
