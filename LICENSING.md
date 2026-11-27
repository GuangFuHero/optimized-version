# 授權

這份文件說明這個 repo 裡每一類內容用什麼授權，以及用到哪些第三方的字型、圖示、圖片與服務。

## 這個 repo 的內容

| 內容 | 授權 |
|---|---|
| 程式碼與技術文件：`Backend/`、`Frontend/`、`System_Design/`、`Spec/`、`.github/`、腳本與工具；設計分支 `sucrelindesign` 上原型的 HTML、JavaScript、CSS；`Design/` 和設計分支上的文字說明（例如 `Design/GUIDE.md`） | GNU General Public License v3.0 only（`GPL-3.0-only`），全文見 [`LICENSE`](LICENSE) |
| 設計素材（圖和畫面）：介面配置、圖示、插圖（含吉祥物「光復寶寶」）、UI 元件、Figma 原型、畫面設計稿和圖片，包括 `Design/` 和設計分支上的這些圖和畫面 | [創用 CC 姓名標示－相同方式分享 4.0 國際](https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hant)（`CC-BY-SA-4.0`），作者標示「島嶼守望團隊」 |
| 名稱與標誌：「Wan Guard 島嶼守望-光復超人」（也包括單獨使用的「Wan Guard」「島嶼守望」「光復超人」）、「GuangFuHero」，以及 Logo 檔 | 不在 GPL 或 CC 授權範圍內，未經書面同意不得使用 |
| 第三方的套件、字型、圖示、圖片、地圖與服務 | 照各自的授權，見下面的「第三方內容」 |

一個檔案裡同時有程式和設計素材時，程式的部分用 GPL-3.0-only，設計素材的部分用 CC BY-SA 4.0。創用 CC 公告過 CC BY-SA 4.0 可以單向併入 GPL v3 的作品，所以設計素材放進 GPL 的程式裡不會衝突。

### 設計素材為什麼用 CC BY-SA，不用 CC BY-NC-SA

GuangFuHero 組織原本規定設計素材用 CC BY-NC-SA 4.0，2026 年 11 月起整個組織改用 CC BY-SA 4.0，原因有兩個：

- 這個 repo 要讓各界自由修改、加值使用。政府或 NGO 委託廠商部署、維運，通常會被認定為商業使用，帶 NC 的素材就不能用。
- CC BY-NC-SA 不能併入 GPL 的程式。光復寶寶這類插圖已經寫在前端程式裡。

### 光復寶寶

`Frontend/libs/modules/src/brand/guang-fu-mascot.tsx` 同時有兩種內容：元件的程式用 GPL-3.0-only；光復寶寶的圖形（路徑座標與配色）是插圖，用 CC BY-SA 4.0，作者標示「島嶼守望團隊」。改吉祥物的造型時，新的圖形也用 CC BY-SA 4.0。

### 名稱與 Logo

下面這些檔案是 Logo，不在任何開源或創用 CC 授權範圍內：

- `Frontend/apps/admin/public/wan-guard.svg`
- `Frontend/apps/demo/public/wan-guard.svg`
- `Backend/app/messaging/assets/logo.png`（Email 通知用）

GPL 授權的是程式碼，不包含名稱與 Logo 的使用權。部署自己的版本時，請把上面的檔案和畫面上的名稱換成你自己的。

## 第三方內容

### 套件

前端與後端用到的每一個套件，都列在軟體物料清單（SBOM），包含版本、授權、雜湊和相依關係，見 [`SBOM/README.md`](SBOM/README.md)。SBOM 把「執行期」（實際部署會用到的）和「開發、建置、測試才用到的」分開列。

授權不是寬鬆型（MIT、BSD、Apache 這類）、要特別留意的：

| 元件 | 授權 | 說明 |
|---|---|---|
| `redis:7-alpine`（7.4 起） | RSALv2／SSPLv1，不是 OSI 認可的授權 | 以獨立服務執行，不跟本專案的程式一起散布 |
| `postgis/postgis` | PostGIS 是 GPL-2.0-or-later；PostgreSQL 是 PostgreSQL License | 以獨立服務執行 |
| `@img/sharp-libvips-*`（`next` 處理圖片時用到） | LGPL-3.0-or-later | |
| `certifi`（後端，驗證 HTTPS 憑證用的憑證清單） | MPL-2.0 | 沒有修改，照原樣使用 |
| `caniuse-lite`（前端，判斷瀏覽器支援度的資料） | CC-BY-4.0 | 沒有修改，照原樣使用 |
| `shapely`（後端，處理地理圖形）的 Linux 安裝檔 | 內含 GEOS 函式庫，LGPL-2.1 | 沒有修改，照原樣使用 |
| `numpy`（後端）的 Linux 安裝檔 | 內含 libgfortran（GPL-3.0-or-later WITH GCC-exception-3.1）與 libquadmath（LGPL-2.1-or-later） | 沒有修改，照原樣使用 |

### 字型

| 字型 | 授權 | 在哪裡 |
|---|---|---|
| Noto Sans TC | SIL Open Font License 1.1 | 前台與管理平台用 `next/font` 在建置時從 Google Fonts 下載，跟網站一起提供（`Frontend/libs/modules/src/document-layout.tsx`）。分享圖卡另有兩個子集字型檔在 `Frontend/apps/demo/assets/share-card/`，授權全文 `OFL.txt` 放在同一個資料夾 |
| Nunito | SIL Open Font License 1.1 | 同上，`next/font` |
| Inter | SIL Open Font License 1.1 | 同上，`next/font` |

### 圖示

| 圖示 | 授權 | 說明 |
|---|---|---|
| Lucide（`lucide-react`） | ISC | 前台與管理平台的介面圖示 |
| Google、LINE、Facebook、X 的標誌（`Frontend/libs/ui/src/components/Icon/`） | 各公司的商標，不在本 repo 的授權範圍內 | 只用在登入按鈕和分享按鈕，要照各品牌的使用規範 |
| 搜尋、頭像標記（同一個資料夾的 `search.svg`、`user-avatar-mark.svg`） | CC BY-SA 4.0 | 設計素材 |

### 圖片

| 圖片 | 授權 | 說明 |
|---|---|---|
| 登入頁的地球圖 `Frontend/libs/modules/src/auth/login/assets/login-hero-from-figma.png` | AI 產生 | 用 Google 的生成式 AI 產生 |

### 地圖與地址服務

底圖與門牌查詢都即時向外部服務取得，各有使用條款，見 [`MAP_TERMS.md`](MAP_TERMS.md)。

## 送進來的貢獻

送進這個 repo 的程式碼與技術文件用 GPL-3.0-only 釋出，設計素材用 CC BY-SA 4.0 釋出。

## 有問題

授權或名稱、Logo 使用的問題，請寄信到 wanguard25@gmail.com，或在 GitHub 開 issue。資安問題請不要開公開的 issue。
