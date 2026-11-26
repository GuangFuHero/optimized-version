# 發版說明模板

發版時，在 GitHub 的 **Releases → Draft a new release** 選好 tag 和上一版，按 **Generate release notes**，GitHub 會照 [`release.yml`](release.yml) 產生「這版包含的 PR」與貢獻者名單。把下面「手寫的部分」貼在產生的內容**上面**，填完再發布。

之後新增、修改或拿掉的功能，都寫在發版說明裡。README 只描述目前有哪些功能：功能有變動時，同步更新 README 的功能清單，但不寫日期或階段。

---

## 發版前檢查

- [ ] 這一版第一次貢獻的人，已經用 all-contributors 加進 `CONTRIBUTORS.md`：在任一個 issue 或 PR 留言 `@all-contributors please add @<帳號> for <類型>`（類型見 `CONTRIBUTORS.md`）
- [ ] 這版合併的資安修正 PR 都有 `security` 標籤
- [ ] 有 migration 的話，下面「後端與資料」寫了新的 revision 和要不要停機

---

## 手寫的部分（複製下面這段）

```markdown
<環境>（<網址>）<日期 時間> 部署。管理平台：<網址>

### 前台

- **<功能或畫面>**：<改了什麼，使用者會看到什麼>。#<PR>

### 管理平台

- **<功能或畫面>**：<改了什麼>。#<PR>

### 後端與資料

- **<API 或資料規則>**：<改了什麼>。#<PR>
- Migration：<新的 revision，或「這版沒有 migration（仍是 `<revision>`）」>。

### 資安

- <修了什麼、影響範圍；細節等修正部署後再公開>。#<PR>

### 升級要注意

- <新的環境變數、要重跑的腳本、設定改動；沒有就寫「無」>

### 已知缺口

- <這版還沒處理、使用者可能會遇到的問題>

上一版：`<上一個 tag>`（`<commit>`，<日期>）
```

---

## 產生的部分（Generate release notes 會自動加）

- **這版包含的 PR**：照標籤分成資安、前端、後端、CI 與部署、相依套件、文件、其他，每個 PR 後面標作者。
- **New Contributors**：這一版第一次有 PR 合併的人。
- 最後一行是和上一版的完整比較連結。

這一段不用改，它就是這一版的致謝。
