# 成員邀請 QR

> 2026-10-20 交付。頁面：`成員管理 Member Management.html` → 團隊 → 某一隊 →「邀請 QR」，或「我的團隊」→「邀請成員」。
> ⚠️ 成員管理這一頁**仍是示範資料**（還沒改成真實頁面），這份文件只講邀請 QR 這個功能。
>
> 記號：🔒 已裁示 · 🚨 設計端先定、尚未經團隊裁示 · ⚠️ 待後端

## 一分鐘看懂

團隊管理員按「邀請成員」→ 直接出現一個 QR 和一條連結 → 傳到 LINE 群組 → 大家掃碼、手機驗證 → 進審核佇列 → 管理員核准才算加入。

- 🔒 **沒有任何設定**：固定 **24 小時後失效，不限人數**。打開視窗就產生，沒有「產生」那一步
- 🔒 **不限人數是安全的**：掃碼不等於入隊，擋人的是審核佇列。QR 被轉傳出去，最壞是佇列多幾筆要拒絕
- 🔒 **沒有「延長」**：要延長就再開一次產生新的；舊的照樣在自己的 24 小時內有效
- 🔒 已經在佇列裡的申請，邀請過期後照常可審
- ❌ 不要加回「單次／多次」「有效期選項」「人數上限」（2026-10-20 PM／Sucre 拿掉的）

## 畫面組成

| 區塊 | 檔案 |
|---|---|
| 邀請視窗 `InviteMemberModal` | `js/admin/member/mm-modals.jsx` |
| QR＋分享按鈕＋連結 `QRBlock` | 同上 |
| 真的 QR `MMQRCode`、下載 PNG `mmDownloadQrPng` | `js/admin/member/mm-shared.jsx` |
| 網址轉 QR 套件 | `js/vendor/qrcode.js`（HTML 要在 `mm-shared.jsx` 之前載入） |

按鈕順序：**分享到 LINE**（主要）→ 其他分享方式（只在支援 `navigator.share` 的裝置出現，桌機多半沒有，不給死鈕）→ **下載 QR 圖片** → 複製連結。

## 網址轉 QR：用哪個套件

- 🔒 **qrcode-generator v2.0.4**（Kazuhiko Arase，MIT）· npm：https://www.npmjs.com/package/qrcode-generator · GitHub：https://github.com/kazuhikoarase/qrcode-generator
- 正式前端**已經在用**：`Frontend/libs/modules/src/point-share/qr-code.ts`（前台分享）。邀請 QR 直接共用 `createQrSvg()`，不用另外裝
- 🔒 **在前端產生，不接 api.qrserver.com 這類線上 QR 服務**：邀請網址就是入隊憑證，送到第三方等於外流；災區網路不穩，外部服務掛了就出不了圖
- 🔒 QR 和連結是**同一個網址**，不得分開產生
- 下載給 **PNG 不給 SVG**：LINE 收不了 SVG，傳到群組會變成檔案而不是圖片。四周留 4 格白邊（QR 規格的靜區，少了有些相機掃不到）
- 容錯等級 `M`：印出來貼在現場髒了一角仍讀得到

## 失效怎麼運作（前端 vs 後端）

QR 圖本身不會過期——它只是網址的另一種樣子。**失效的是網址裡的邀請代碼**，由後端判斷。

1. 管理員打開邀請視窗 → 後端建立一張邀請，回傳網址
2. 前端把網址轉成 QR，顯示「24 小時後失效」（只是提醒文字）
3. 有人打開網址 → 前端先問後端這個代碼還能不能用
   - 能用 → 註冊／手機驗證畫面
   - 不能用 → 失效頁：「這張邀請已過期，請向團隊管理員要新的」 🚨 失效頁尚未設計
4. 完成手機驗證、送出申請 → 進該隊審核佇列

🔒 **到期只在後端判斷**，以後端時間為準。前端顯示的時間不能拿來擋人（使用者手機時間可以亂調）。

## ⚠️ 待後端

`main` 分支（2026-10-20 查）**完全沒有邀請功能**：ERD 沒有邀請表、`Backend/app` 沒有相關 API、`schema.graphql` 沒有相關型別。

🚨 建議的最小形狀（設計端提的，請後端決定）：

| 東西 | 內容 |
|---|---|
| 邀請表 | 代碼（token，不可猜）· `team_uuid` · `created_by` · `created_at`（到期＝建立＋24 小時） |
| 產生邀請 | 限該隊管理員／超級管理員；回傳網址 |
| 查詢邀請代碼 | 掃碼時用，回傳「可用（哪一隊）」或「已過期」，不需登入 |
| 送出申請 | 手機驗證後寫入該隊審核佇列；過期的代碼拒絕 |

仍未決：
- 要不要「作廢」？沒有人數上限後，作廢是唯一能提早關掉一張邀請的方法（QR 傳錯群組時）。規格 MEM-FEAT-002 原本有，Q2 問過後端能不能做
- 「新增團隊」後那張邀請第一位管理員的 QR（一次性、72 小時）是另一條規則，這次沒動

## 現有的 `invite-side-sheet` 元件

`Frontend/libs/modules/src/admin/invite-side-sheet/index.tsx` 目前是畫面殼：QR 是假圖（`InviteQrCodePlaceholder`）、「Link expires in 48 hours.」寫死。接的時候：QR 換成 `createQrSvg(url)`、文字改成 24 小時、加上分享到 LINE 與下載 PNG。

## 實作陷阱

- LINE 分享用官方 web intent：`https://line.me/R/msg/text/?` ＋ `encodeURIComponent(文字 + "\n" + 網址)`，不需 SDK
- 複製要真的寫進剪貼簿（`navigator.clipboard.writeText`），原型舊版只跳提示
- QR 套件沒載入時要顯示錯誤，**不可退回假 QR**——假圖看起來能掃，現場會以為壞的是別人的手機
