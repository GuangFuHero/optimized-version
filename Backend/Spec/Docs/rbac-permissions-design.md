# RBAC 權限系統設計
**版本**: 1.1  
**更新日期**: 2025-12-16   
**目的**: 定義所有系統權限，提供預設角色範本，由部署組織自行決定角色配置  
**更新者**: [zumon, popo]

---

## 設計理念

### 核心原則
1. **權限優先於角色** - 先定義所有權限，角色只是權限的組合
2. **靈活配置** - 組織可以根據自己的需求創建自訂角色
3. **預設範本** - 提供常見的角色配置作為起點
4. **最小權限原則** - 預設給予最少必要權限，需要時再增加

### 系統架構
```
權限 (Permissions)
  ↓ 組合成
角色 (Roles)
  ↓ 指派給
使用者 (Users)
```

---

## 1. 權限清單 (Permissions)

### 1.1 地圖相關 (Feature 002)
| 權限代碼 (Permission ID) | 權限名稱 | 定義與邊界 |
| :--- | :--- | :--- |
| `map:view` | 檢視地圖 | 存取災害地圖介面、切換圖層顯示。 |
| `map:marker:create` | 新增地圖標記 | 在地圖上標註新的資源點、受災點或障礙物。 |
| `map:marker:edit` | 編輯地圖標記 | 修改現有的地圖標記資訊。 |
| `map:marker:delete` | 刪除地圖標記 | 移除地圖標記 (通常僅限建立者或管理員)。 |
| `map:config` | 地圖系統設定 | 修改地圖預設中心點、預設縮放層級、圖層來源設定。 |

### 1.2 需求管理相關 (Feature 003)
包含人力需求 (Human Resource) 與物資需求 (Supply) 的生命週期管理。

| 權限代碼 (Permission ID) | 權限名稱 | 定義與邊界 |
| :--- | :--- | :--- |
| `request:create` | 建立需求 | 提交新的人力或物資需求單。 |
| `request:view:own` | 檢視自身需求 | 僅能讀取 `created_by` 為當前使用者的需求單。 |
| `request:view:all` | 檢視所有需求 | 讀取系統內所有未封存的需求單 (志工/協調員用)。 |
| `request:edit:own` | 編輯自身需求 | 修改自己提交的需求內容 (僅限狀態為 pending 時)。 |
| `request:edit:any` | 編輯任何需求 | 修改任何人提交的需求內容 (用於修正錯誤資訊)。 |
| `request:assign` | 指派需求 | 將需求指派給特定人員 (Volunteer) 或單位。 |
| `request:priority:edit` | 調整優先級 | 修改需求的緊急程度權重 (Low / Nominal / High)。 |
| `request:status:update` | 更新狀態 | 變更需求流轉狀態 (Pending → Assigned → In Progress → Completed)。 |

### 1.3 志工調度相關 (Feature 004)
| 權限代碼 (Permission ID) | 權限名稱 | 定義與邊界 |
| :--- | :--- | :--- |
| `volunteer:register` | 志工註冊 | 提交詳細志工資料與技能專長，申請成為志工。 |
| `volunteer:verify` | 審核志工 | 核准或拒絕志工申請，開通志工權限。 |
| `volunteer:view:list` | 檢視志工名單 | 查看所有志工的列表、狀態 (忙碌/閒置) 與位置。 |
| `volunteer:task:view` | 檢視任務 | 讀取被指派給自己的任務詳情。 |
| `volunteer:task:accept` | 接受任務 | 確認接收指派的任務。 |
| `volunteer:task:update` | 更新任務 | 回報任務進度、上傳任務照片或結案。 |

### 1.4 物資管理相關 (Feature 005)
| 權限代碼 (Permission ID) | 權限名稱 | 定義與邊界 |
| :--- | :--- | :--- |
| `supply:inventory:view` | 檢視庫存 | 查看各倉庫或站點的物資水位。 |
| `supply:transaction:create` | 記錄交易 | 建立進貨 (入庫/捐贈) 或出貨 (配送/消耗) 紀錄。 |
| `supply:transaction:edit` | 編輯交易 | 修改或作廢錯誤的交易紀錄。 |
| `supply:delivery:plan` | 規劃配送 | 建立物資運送路徑與配送單。 |
| `supply:report:generate` | 產生報表 | 匯出物資進銷存統計報表。 |

### 1.5 資訊發布相關 (Feature 007)
| 權限代碼 | 權限名稱 | 說明 |
|---------|---------|------|
| `content:view` | 檢視內容 | 閱讀公開資訊 |
| `content:create` | 建立內容 | 新增災害更新、公告、指南 |
| `content:edit:own` | 編輯自己的內容 | 修改自己建立的內容 |
| `content:edit:any` | 編輯任何內容 | 修改任何人的內容 |
| `content:publish` | 發布內容 | 將草稿發布為公開 |
| `content:unpublish` | 下架內容 | 將內容下架或移至封存 |
| `content:delete` | 刪除內容 | 永久刪除內容 |

### 1.6 後台管理相關 (Feature 006)
| 權限代碼 | 權限名稱 | 說明 |
|---------|---------|------|
| `admin:dashboard:view` | 檢視儀表板 | 存取營運儀表板 |
| `admin:audit:view` | 檢視稽核記錄 | 查看系統稽核日誌 |
| `admin:audit:export` | 匯出稽核記錄 | 匯出稽核資料 |
| `admin:user:view` | 檢視使用者 | 查看使用者清單 |
| `admin:user:edit` | 編輯使用者 | 修改使用者資料 |
| `admin:user:suspend` | 停權使用者 | 暫停或停用使用者帳號 |
| `admin:role:view` | 檢視角色 | 查看角色和權限配置 |
| `admin:role:edit` | 編輯角色 | 建立、修改、刪除角色 |
| `admin:role:assign` | 指派角色 | 將角色指派給使用者 |
| `admin:config:view` | 檢視系統設定 | 查看系統組態 |
| `admin:config:edit` | 編輯系統設定 | 修改系統組態 |
| `admin:performance:view` | 檢視效能監控 | 查看系統效能指標 |
| `admin:export:data` | 匯出資料 | 匯出各種資料報表 |

### 1.7 通用權限
| 權限代碼 | 權限名稱 | 說明 |
|---------|---------|------|
| `system:access` | 系統存取 | 登入系統的基本權限 |
| `profile:view:own` | 檢視自己資料 | 查看自己的個人資料 |
| `profile:edit:own` | 編輯自己資料 | 修改自己的個人資料 |
| `notification:receive` | 接收通知 | 接收系統通知 |

---

## 2. 預設角色範本 (Default Role Templates)

### 2.1 公眾角色 (Public Roles)

### 👻 訪客 (Guest / Anonymous)
**權限**:
```yaml
permissions:
  - map:view                     # 查看地圖
  - content:view                 # 查看公告
  - reqeust:view                 # 查看物資or人力列表
```

#### 👤 一般民眾 (Login User)
**適用對象**: 受災民眾、關心災情的一般大眾

**權限**:
```yaml
permissions:
  - system:access                # 可以登入
  - profile:view:own             # 查看自己資料
  - profile:edit:own             # 編輯自己資料
  - map:view                     # 查看地圖
  - request:create               # 提交需求
  - request:view                 # 查看需求狀態（限自己的）
  - content:view                 # 閱讀公告資訊
  - notification:receive         # 接收通知
```

**使用情境**:
- 提交救援需求
- 查看自己提交的需求狀態
- 查看地圖上的資源位置
- 閱讀官方公告和指南

---

#### 🙋 註冊志工 (Registered Volunteer)
**適用對象**: 已通過審核的志工

**權限**: 一般民眾的所有權限，加上:
```yaml
additional_permissions:
  - volunteer:task:view          # 查看指派的任務
  - volunteer:task:accept        # 接受任務
  - volunteer:task:update        # 更新任務狀態
  - volunteer:edit:own           # 編輯自己的志工資料
  - volunteer:rating:view        # 查看自己的評價
  - request:view:all             # 查看所有需求（執行任務需要）
```

**使用情境**:
- 接受任務指派
- 更新任務執行進度
- 查看任務詳情和地圖位置
- 完成任務並記錄

---

### 2.2 協調角色 (Coordination Roles)

#### 👔 現場協調員 (Field Coordinator)
**適用對象**: 負責協調救援行動的現場人員

**權限**: 註冊志工的所有權限，加上:
```yaml
additional_permissions:
  # 需求管理
  - request:view:all             # 查看所有需求
  - request:assign               # 分配需求給志工
  - request:status:update        # 更新需求狀態
  - request:priority:edit        # 調整需求優先度
  - request:edit:any             # 編輯任何需求（修正資訊）

  # 志工管理
  - volunteer:view:list          # 查看志工名單
  - volunteer:view:profile       # 查看志工詳細資料
  - volunteer:rating:give        # 評價志工表現

  # 地圖管理
  - map:marker:create            # 新增地圖標記
  - map:marker:edit              # 編輯標記

  # 物資相關
  - supply:inventory:view        # 查看庫存
  - supply:delivery:plan         # 規劃配送（如果負責物資）
```

**使用情境**:
- 檢視待處理需求
- 根據志工技能和位置分配任務
- 調整需求優先度
- 追蹤任務執行進度
- 新增或更新地圖上的資源位置

---


**使用情境**:
- 記錄捐贈入庫
- 管理庫存水位
- 規劃配送路線
- 追蹤配送進度
- 產生捐贈收據和報表

---

### 2.3 管理角色 (Administrative Roles)

#### 🛡️ 系統管理員 (System Administrator)
**適用對象**: 負責系統維運和技術管理的人員

**權限**: 幾乎所有權限（除了敏感的內容發布）
```yaml
permissions:
  # 管理功能
  - admin:*                      # 所有後台管理權限

  # 使用者和權限管理
  - admin:user:view
  - admin:user:edit
  - admin:user:suspend
  - admin:role:view
  - admin:role:edit
  - admin:role:assign

  # 系統設定
  - admin:config:view
  - admin:config:edit
  - admin:performance:view

  # 所有功能的檢視和管理
  - request:*                    # 所有需求相關權限
  - volunteer:*                  # 所有志工相關權限
  - supply:*                     # 所有物資相關權限
  - map:*                        # 所有地圖相關權限

  # 稽核
  - admin:audit:view
  - admin:audit:export
```

**排除權限**:
```yaml
excluded_permissions:
  - content:publish              # 不能發布官方公告（由內容管理員負責）
  - content:delete               # 不能刪除公告內容
```

**使用情境**:
- 管理使用者帳號和權限
- 配置系統參數
- 監控系統效能
- 處理資料品質問題（合併重複、刪除垃圾）
- 查看稽核記錄調查問題

---

#### 📢 內容管理員 (Content Manager)
**適用對象**: 負責發布官方資訊的政府或組織人員

**權限**: 一般民眾的基本權限，加上:
```yaml
additional_permissions:
  - content:create               # 建立內容
  - content:edit:any             # 編輯任何內容
  - content:publish              # 發布內容
  - content:unpublish            # 下架內容
  - content:timeline:manage      # 管理時間軸
  - content:donation:manage      # 管理捐款資訊
  - map:view                     # 查看地圖（連結地理位置）
  - request:view:all             # 查看需求（了解災情）
  - admin:dashboard:view         # 查看統計儀表板
```

**使用情境**:
- 發布緊急災害更新
- 發布政府公告和援助計畫
- 管理捐款管道和透明度報告
- 編輯時間軸事件
- 發布防災教育內容

---

#### 👑 超級管理員 (Super Admin)
**適用對象**: 組織最高權限負責人（通常只有 1-2 人）

**權限**: **所有權限**
```yaml
permissions:
  - *:*                          # 通配符：所有權限
```

**使用情境**:
- 指派其他管理員
- 修改關鍵系統設定
- 處理緊急權限變更
- 完全的系統控制權

**⚠️ 安全建議**:
- 此角色應該只指派給 1-2 名最高負責人
- 所有操作都會被完整記錄在稽核日誌
- 建議啟用額外的安全驗證（如 2FA）

---

### 2.4 特殊角色 (Special Roles)

#### 🔍 稽核員 (Auditor)
**適用對象**: 負責監督和查核的人員（可能是外部單位）

**權限**:
```yaml
permissions:
  - system:access                # 登入系統
  - admin:dashboard:view         # 查看儀表板
  - admin:audit:view             # 查看稽核記錄
  - admin:audit:export           # 匯出稽核資料
  - request:view:all             # 查看所有需求
  - volunteer:view:list          # 查看志工清單
  - volunteer:view:profile       # 查看志工資料
  - supply:inventory:view        # 查看庫存
  - supply:report:generate       # 產生報表
  - content:view                 # 查看內容

  # 注意：只有檢視權限，沒有任何編輯權限
```

**使用情境**:
- 產生稽核報告
- 檢視系統操作記錄
- 監督資源分配是否合理
- 驗證捐款使用透明度

---

#### ⚙️ 唯讀管理員 (Read-Only Admin)
**適用對象**: 需要全面了解系統狀態但不應修改資料的人員（如高層主管、外部顧問）

**權限**:
```yaml
permissions:
  - system:access
  - *:view                       # 所有「檢視」類型的權限
  - admin:dashboard:view
  - admin:performance:view
  - admin:audit:view

  # 排除所有編輯、刪除、建立權限
```

**使用情境**:
- 高層主管監督整體運作
- 外部顧問評估系統使用情況
- 媒體或公眾監督（限定範圍）

---

## 3. 角色配置指南

### 3.1 典型組織配置範例

#### 小型組織 (< 50 人)
```yaml
角色配置:
  - 超級管理員: 1 人（組織負責人）
  - 系統管理員: 1 人（技術人員）
  - 現場協調員: 3-5 人
  - 物資管理員: 1-2 人
  - 內容管理員: 1-2 人
  - 註冊志工: 20-40 人
  - 一般民眾: 不限
```

#### 中型組織 (50-200 人)
```yaml
角色配置:
  - 超級管理員: 1-2 人
  - 系統管理員: 2-3 人
  - 現場協調員: 10-15 人（可能分區負責）
  - 物資管理員: 3-5 人（可能多個倉庫）
  - 內容管理員: 2-3 人（可能分工負責不同類型內容）
  - 稽核員: 1 人（如有需要）
  - 註冊志工: 50-150 人
  - 一般民眾: 不限
```

#### 大型組織或政府單位
```yaml
角色配置:
  - 超級管理員: 2 人
  - 系統管理員: 5+ 人（分班輪值）
  - 現場協調員: 20+ 人（分區、分類別）
  - 物資管理員: 10+ 人（多個倉庫和配送中心）
  - 內容管理員: 5+ 人（政府機關、NGO 等）
  - 稽核員: 2-3 人（內部稽核、外部監督）
  - 唯讀管理員: 5+ 人（高層、顧問）
  - 註冊志工: 200+ 人
  - 一般民眾: 不限
```

---

### 3.2 自訂角色建議

組織可以根據自己的需求建立自訂角色，建議步驟：

#### Step 1: 識別角色需求
```
問題：
1. 這個角色需要做什麼？（列出具體任務）
2. 這個角色需要看到什麼資料？
3. 這個角色需要修改什麼資料？
4. 這個角色不應該能做什麼？（限制）
```

#### Step 2: 選擇基礎範本
```
選擇最接近的預設角色作為起點：
- 如果主要是查看資料 → 從「唯讀管理員」開始
- 如果需要協調救援 → 從「現場協調員」開始
- 如果需要管理物資 → 從「物資管理員」開始
- 如果需要發布資訊 → 從「內容管理員」開始
```

#### Step 3: 調整權限
```
添加或移除權限：
- 只給予完成任務所需的最小權限
- 如果不確定，先不給權限，需要時再增加
- 記錄為什麼給予每個權限（便於未來審查）
```

#### Step 4: 測試和調整
```
1. 建立測試帳號指派新角色
2. 測試常見操作流程
3. 記錄遇到的權限問題
4. 調整權限配置
5. 記錄最終的權限清單和理由
```

---

### 3.3 權限管理最佳實踐

#### ✅ 推薦做法
1. **最小權限原則**: 只給必要權限，不要「以防萬一」給過多權限
2. **定期審查**: 每 3-6 個月審查角色權限是否仍然合適
3. **權限申請流程**: 建立正式的權限申請和核准流程
4. **文件記錄**: 記錄每個自訂角色的用途和權限理由
5. **測試帳號**: 使用測試帳號驗證權限配置是否正確
6. **漸進式開放**: 先給較少權限，確認需要後再增加

#### ❌ 避免做法
1. **不要給所有人 admin 權限**: 即使是內部同仁也應該按需分配
2. **不要長期使用超級管理員帳號**: 日常操作應該用權限較少的帳號
3. **不要共用帳號**: 每個人都應該有自己的帳號（便於稽核）
4. **不要忽略離職人員**: 及時撤銷離職人員的權限
5. **不要跳過測試**: 權限配置錯誤可能導致資料外洩或操作失誤


### 3.4 權限判定邏輯 (Enforcement Logic)

#### 範圍判定 (Scope Logic)
針對 `Own` vs `Any` 的衝突處理：
1.  **優先檢查**: 使用者是否擁有 `resource:action:any` (如 `request:edit:any`)。若有，直接放行。
2.  **次要檢查**: 使用者是否擁有 `resource:action:own` (如 `request:edit:own`)。
    *   若有，系統需查詢目標資源的 `created_by` 欄位。
    *   若 `resource.created_by == current_user.id`，放行。
    *   否則，回傳 **403 Forbidden**。

#### 混合 API 回應 (Hybrid Response)
針對同時服務訪客與會員的 API (如地圖)：
*   **Input**: Request Context (Token 有無)。
*   **Logic**:
    *   No Token: 回傳 `PublicDTO` (去識別化資料)。
    *   Valid Token + `map:view`: 回傳 `DetailedDTO` (完整資料)。
---

## 4. 技術實作指引

### 4.1 資料庫 Schema 建議

```sql
-- 權限表
CREATE TABLE permissions (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),  -- map, request, volunteer, supply, content, admin
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 角色表
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_default BOOLEAN DEFAULT FALSE,  -- 是否為預設角色
    organization_id INTEGER,  -- 如果是自訂角色，屬於哪個組織
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 角色權限關聯表
CREATE TABLE role_permissions (
    role_id INTEGER REFERENCES roles(id),
    permission_id VARCHAR(50) REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

-- 使用者角色關聯表
CREATE TABLE user_roles (
    user_id INTEGER REFERENCES users(id),
    role_id INTEGER REFERENCES roles(id),
    assigned_by INTEGER REFERENCES users(id),  -- 誰指派的
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);
```

### 4.2 API 檢查範例

```javascript
// 檢查使用者是否有特定權限
async function checkPermission(userId, permissionId) {
    const query = `
        SELECT COUNT(*) as count
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        WHERE ur.user_id = $1 AND rp.permission_id = $2
    `;
    const result = await db.query(query, [userId, permissionId]);
    return result.rows[0].count > 0;
}

// 使用範例
app.delete('/api/requests/:id', async (req, res) => {
    const hasPermission = await checkPermission(
        req.user.id,
        'request:delete'
    );

    if (!hasPermission) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'You do not have permission to delete requests'
        });
    }

    // 執行刪除操作...
});
```

### 4.3 前端 UI 適配

```javascript
// 根據權限顯示/隱藏 UI 元素
function FeatureButton({ permission, children }) {
    const userPermissions = useUserPermissions();

    if (!userPermissions.includes(permission)) {
        return null;  // 沒有權限就不顯示按鈕
    }

    return <button>{children}</button>;
}

// 使用範例
<FeatureButton permission="request:delete">
    刪除需求
</FeatureButton>
```

---

## 5. 部署檢查清單

### 首次部署前
- [ ] 決定組織規模（小型/中型/大型）
- [ ] 選擇要使用的預設角色
- [ ] 確認是否需要自訂角色
- [ ] 規劃初始帳號和角色分配
- [ ] 建立超級管理員帳號（1-2 個）
- [ ] 測試權限配置是否正確

### 災害發生前的準備
- [ ] 預先審核並批准足夠數量的志工
- [ ] 確認協調員和管理員都已經訓練完成
- [ ] 測試緊急權限提升流程（如果需要）
- [ ] 確認所有關鍵角色都有備援人員

### 災害發生時的管理
- [ ] 可能需要快速審核更多志工（放寬審核流程）
- [ ] 監控權限使用情況（異常操作）
- [ ] 準備好緊急權限撤銷流程（如果發現濫用）

### 災後檢討
- [ ] 檢視稽核記錄
- [ ] 評估權限配置是否合適
- [ ] 收集使用者回饋調整權限
- [ ] 撤銷臨時提升的權限

---

## 6. 常見問題 (FAQ)

### Q1: 我應該使用多少個角色？
**A**: 取決於組織規模和複雜度：
- 小型組織：4-6 個角色通常足夠
- 中型組織：6-10 個角色
- 大型組織：10+ 個角色，可能需要更細分

原則：角色數量應該反映實際的職責劃分，太少會不夠精確，太多會難以管理。

---

### Q2: 可以一個人有多個角色嗎？
**A**: 可以！系統支援多角色。例如：
- 某人同時是「現場協調員」和「物資管理員」
- 某人同時是「註冊志工」和「內容管理員」（政府人員也參與志工）

使用者的實際權限是所有角色權限的**聯集**。

---

### Q3: 如何處理「暫時性」的權限提升？
**A**: 建議做法：
1. **短期需求**（< 1 週）：暫時指派角色，事後撤銷
2. **中期需求**（1 週 - 1 個月）：建立臨時角色，標註到期日
3. **長期需求**：考慮調整角色定義或創建新角色

所有權限變更都會記錄在稽核日誌中。

---

### Q4: 如何處理「特殊情況」的權限需求？
**A**: 建立「緊急權限提升」流程：
1. 需求者提出申請，說明原因和期限
2. 超級管理員批准
3. 暫時指派更高權限角色
4. 記錄在稽核日誌
5. 期限到後自動或手動撤銷

---

### Q5: 志工審核到底應該由誰負責？
**A**: 這取決於組織的信任模型：

**選項 A - 由現場協調員審核** (推薦中小型組織)
- 優點：分散工作量，協調員更了解需求
- 做法：給予協調員 `volunteer:verify` 權限

**選項 B - 由系統管理員審核** (推薦大型組織)
- 優點：更嚴格的品質控管
- 做法：只有管理員有 `volunteer:verify` 權限

**選項 C - 兩階段審核**
- 協調員初審 → 管理員複審
- 適合需要高度驗證的情境

---

### Q6: 如何防止權限濫用？
**A**: 多層防護：
1. **最小權限原則**: 不給不必要的權限
2. **稽核日誌**: 所有操作都被記錄
3. **定期審查**: 每季度檢視權限分配
4. **異常檢測**: 監控異常大量操作
5. **權限分離**: 關鍵操作需要多人參與

---

### Q7: 可以動態調整角色權限嗎？
**A**: 可以！有兩種做法：

**做法 1 - 修改角色定義** (影響所有使用該角色的人)
- 適合：發現角色定義需要調整
- 影響範圍：大
- 需要：仔細測試

**做法 2 - 創建新角色** (不影響現有使用者)
- 適合：需求變化，但舊角色仍然有效
- 影響範圍：小
- 需要：管理更多角色

---

## 7. 文件維護

本文件應該：
- 由系統管理員或超級管理員維護
- 當增加新功能時，更新權限清單
- 當組織結構變化時，更新角色範本
- 至少每 6 個月檢視一次

**版本記錄**:
- v1.0 (2025-11-30): 初始版本，定義核心權限和 8 個預設角色
- v1.1 (2025-12-16): 公開存取策略 (Public Access)
  - **補充權限命名哲學**：解釋 `content`、`request` 等領域驅動命名原則
  - **優化角色定義**：區分「未登入訪客」與「已登入民眾」。

---

**提醒**: 這份文件是指引，不是硬性規定。每個組織應該根據自己的需求調整權限和角色配置。
