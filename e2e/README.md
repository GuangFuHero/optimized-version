# 島嶼守望：Playwright E2E 無障礙測試 ＆ Remotion 教學影片合成器

本目錄（`/e2e`）與根目錄的 `/video` 結合 **Playwright + `@axe-core/playwright` + Remotion**，用同一套劇本同時達成三件事：
1. **全端 E2E 自動化測試**：以真實瀏覽器驗證前台（`:3000`）與管理後台（`:3001`）的 12 條核心操作路徑。
2. **WCAG 2.1 AA 無障礙（a11y）驗證**：強制使用語意化選擇器（`getByRole`、`getByLabel`），並在每個畫面轉場執行 `axe-core` 自動掃描。
3. **自動生成平台教學影片（MP4 + WebVTT 字幕）**：透過 [`e2e/fixtures/tutorial-recorder.ts`](fixtures/tutorial-recorder.ts) 在測試過程中記錄每個步驟的元素座標 `(x, y, width, height)`、時間戳記與 `aria-label`，再由 `/video` 的 Remotion 合成器加上**平滑鏡頭縮放、聚光燈高亮框、WCAG AAA 高對比字幕卡**並同步輸出 `.vtt` 無障礙字幕檔。

---

## 快速開始

```bash
# 1. 在專案根目錄安裝 Playwright 與 Remotion 依賴（首次執行）
pnpm install
npx playwright install chromium

# 2. 確保全端開發環境已啟動（含後端 Docker、前台 :3000、後台 :3001）
pnpm dev

# 3. 執行快速 E2E + WCAG A11y 測試
pnpm e2e

# 4. 執行教學錄製模式（每個步驟自動停留 1.4 秒供觀眾閱讀，並輸出 timeline.json + recording.webm + captions.vtt）
pnpm e2e:record

# 5. 開啟 Remotion Studio 互動預覽 12 支教學影片分集
pnpm video:studio

# 6. 將錄製好的所有分集批次算圖為 MP4 影片與 .vtt 字幕檔（輸出至 video/out/）
pnpm video:render
```

---

## 12 支核心劇本對照表

### 一、民眾與志工前台（`e2e/site/`）
- **S01** [`s01-map-explore-and-share.spec.ts`](site/s01-map-explore-and-share.spec.ts)：災情地圖瀏覽、關鍵字搜尋與「這一頁怎麼用」無障礙導覽
- **S02** [`s02-list-and-building-floors.spec.ts`](site/s02-list-and-building-floors.spec.ts)：列表模式瀏覽與點位詳情檢視
- **S03** [`s03-briefing-and-checklist.spec.ts`](site/s03-briefing-and-checklist.spec.ts)：志工行前資訊檢視與個人裝備勾選清單
- **S04** [`s04-submit-help-request.spec.ts`](site/s04-submit-help-request.spec.ts)：民眾發出「請求協助（報案開單）」與無障礙表單驗證
- **S05** [`s05-volunteer-claim-and-release.spec.ts`](site/s05-volunteer-claim-and-release.spec.ts)：志工瀏覽並承接任務與管理「我的任務」
- **S06** [`s06-station-suggestion-and-role-request.spec.ts`](site/s06-station-suggestion-and-role-request.spec.ts)：回報資源站點修改建議＆申請成為後台管理人員

### 二、機關與團隊管理後台（`e2e/admin/`）
- **A01** [`a01-dashboard-analytics.spec.ts`](admin/a01-dashboard-analytics.spec.ts)：總覽儀表板與災情數據趨勢分析
- **A02** [`a02-mutual-aid-map-and-zones.spec.ts`](admin/a02-mutual-aid-map-and-zones.spec.ts)：互助地圖管理與責任區圖層
- **A03** [`a03-ticket-board-and-spaces.spec.ts`](admin/a03-ticket-board-and-spaces.spec.ts)：任務管理看板與建築空間分區
- **A04** [`a04-dedup-review-and-merge.spec.ts`](admin/a04-dedup-review-and-merge.spec.ts)：疑似重複案件審核與合併
- **A05** [`a05-station-management-and-reviews.spec.ts`](admin/a05-station-management-and-reviews.spec.ts)：資源站點管理與修改建議審查
- **A06** [`a06-teams-announcements-briefings.spec.ts`](admin/a06-teams-announcements-briefings.spec.ts)：團隊成員審核、緊急公告與志工行前資訊發布
