# 設計分支的授權

這個分支（`sucrelindesign`）的內容分成三類，授權不同。整個專案的授權說明在 `main` 分支根目錄的 `LICENSING.md`。

| 內容 | 授權 |
|---|---|
| 原型的程式：`前台/`、`後台/` 底下的 `.html`、`js/`、`_ds/` 的 `tokens/*.css`，以及 `components/`、`handoff/` 的 TSX；文字說明：`docs/`、`更新說明.md`、`CHANGELOG.md`、`README.md` 這些文件的文字 | GNU GPL v3.0 only（`GPL-3.0-only`），全文見根目錄 `LICENSE` |
| 設計素材（圖和畫面）：介面配置、圖示、插圖（`assets/mascot/` 的光復寶寶，含動畫）、UI 元件、設計稿、畫面截圖 | [創用 CC 姓名標示－相同方式分享 4.0 國際](https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hant)（`CC-BY-SA-4.0`），作者標示「光復超人設計團隊」 |
| 名稱與標誌：「Wan Guard 島嶼守望-光復超人」（也包括單獨使用的「Wan Guard」「島嶼守望」「光復超人」）、「GuangFuHero」，`assets/logo/`、根目錄 `logo/` 的檔案 | 不在 GPL 或 CC 授權範圍內，未經書面同意不得使用 |

一個檔案裡同時有程式和插圖時（例如 `js/shared/wg-mascot.jsx` 裡的光復寶寶），程式的部分用 GPL-3.0-only，插圖的部分用 CC BY-SA 4.0。CC BY-SA 4.0 可以單向併入 GPL v3 的作品，所以工程師把原型或插圖搬進正式版的程式不會有授權衝突。

GuangFuHero 組織原本規定設計素材用 CC BY-NC-SA 4.0，2026 年 11 月起整個組織改用 CC BY-SA 4.0：委託廠商部署、維運通常算商業使用，帶 NC 的素材就不能用，也不能併入 GPL 的程式。

授權或名稱、Logo 使用的問題，請寄信到 wanguard25@gmail.com。

## 第三方內容

| 內容 | 授權 | 在哪裡 |
|---|---|---|
| Noto Sans TC 字型 | SIL Open Font License 1.1 | `前台/_ds/…/fonts/`、`後台/_ds/…/fonts/`，授權全文是同一個資料夾的 `OFL.txt` |
| qrcode-generator | MIT | `前台/js/vendor/qrcode.js`、`後台/js/vendor/qrcode.js`，原作者的版權聲明在檔案裡 |
| React、Babel、Lucide、Leaflet | 各自的開源授權（MIT、ISC、BSD-2-Clause） | 原型打開時從 unpkg 載入，不放在這個分支裡 |
| 地圖底圖 | 各服務的使用條款 | 見 `main` 分支根目錄的 `MAP_TERMS.md` |
