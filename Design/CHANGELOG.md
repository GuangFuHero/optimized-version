# Design 變更紀錄

工程師接工作的**簡短清單**。每次合併進 `main` 在**最上面**加一筆；詳細說明照舊寫在各側的 `更新說明.md` 或 `docs/`，這裡只連過去。
工程師從「Frontend 待辦」接工作，做完把 `[ ]` 改成 `[x]` 並寫上 PR。

## 格式

```markdown
## <合併日期> <一句話說這次改了什麼>

**影響畫面**：`後台/任務管理 Ticket Management.html`、…
**詳細說明**：`後台/更新說明.md` 的這次那一節、`後台/docs/….md`

### 變更
- 一句話一件事；細節在上面的詳細說明

### Token 異動（沒有就寫「無」）
- `--color-xxx`：`#舊值` → `#新值`

### 路徑異動（沒有就省略）
- `舊路徑` → `新路徑`

### Frontend 待辦（沒有就寫「無」）
- [ ] 要做的事（對應的原型畫面或 handoff 檔案）
```

---

## 範例：按鈕新增工具鈕樣式（格式示範，不是真的變更）

**影響畫面**：`後台/元件 Components.html`
**詳細說明**：`後台/更新說明.md`（這次那一節）

### 變更
- 新增工具鈕 `neutral` variant：白底灰框，篩選、審查、匯出用；橘色留給「新增」。

### Token 異動
- 無

### Frontend 待辦
- [ ] 把 `handoff/Button/index.tsx` 搬進 `Frontend/libs/ui/src/components/Button/`，補 story 與測試
