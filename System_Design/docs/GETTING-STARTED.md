# 詳細安裝指南 - 互動編輯器

> 這份指南是給想跑「互動編輯器」的人 (｡･ω･｡)
>
> 如果你只是想看設計或編輯文字檔，**不需要看這份指南**！
> 直接打開 `exports/mindmap.html` 或編輯 `mindmap/` 裡的檔案就好。

---

## 你需要什麼？

1. **一台電腦**（Mac、Windows 或 Linux 都可以）
2. **網路連線**（下載安裝程式用）
3. **大約 10-15 分鐘的時間**

---

## 步驟一：安裝 Python

Python 是一種程式語言，我們的編輯器需要它才能跑。

### Mac 用戶

1. 打開「終端機」應用程式
   - 方法：按 `Cmd + 空白鍵`，輸入「終端機」或「Terminal」，按 Enter

2. 檢查是否已經有 Python：
   ```
   python3 --version
   ```
   - 如果顯示 `Python 3.11` 或更高版本 → 太棒了，跳到步驟二！
   - 如果顯示錯誤或版本太舊 → 繼續往下看

3. 安裝 Python：
   - 到 [python.org/downloads](https://www.python.org/downloads/)
   - 下載「Download Python 3.12」（或最新版）
   - 打開下載的 `.pkg` 檔案，按照指示安裝

### Windows 用戶

1. 打開「命令提示字元」或「PowerShell」
   - 方法：按 `Win + R`，輸入 `cmd`，按 Enter

2. 檢查是否已經有 Python：
   ```
   python --version
   ```

3. 如果沒有，到 [python.org/downloads](https://www.python.org/downloads/) 下載安裝
   - **重要**：安裝時記得勾選「Add Python to PATH」！

---

## 步驟二：安裝 uv（套件管理器）

uv 是一個幫我們管理程式套件的工具，比傳統方式快很多。

### Mac / Linux

在終端機輸入：
```
curl -LsSf https://astral.sh/uv/install.sh | sh
```

安裝完成後，**關閉終端機再重新打開**（這樣新指令才會生效）。

### Windows

在 PowerShell 輸入：
```
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

安裝完成後，**關閉視窗再重新打開**。

### 確認安裝成功

輸入：
```
uv --version
```

如果顯示版本號（例如 `uv 0.5.x`），就代表成功了！ヽ(✿ﾟ▽ﾟ)ノ

---

## 步驟三：下載專案

### 方法 A：用 Git（推薦，方便之後更新）

如果你有 Git：
```
git clone https://github.com/ChiTienHsieh/spec-md-mindmaps.git
cd spec-md-mindmaps
```

### 方法 B：直接下載 ZIP

1. 到專案頁面：https://github.com/ChiTienHsieh/spec-md-mindmaps
2. 點綠色的「Code」按鈕 → 「Download ZIP」
3. 解壓縮到你喜歡的位置
4. 用終端機進入那個資料夾：
   ```
   cd /你放檔案的路徑/spec-md-mindmaps
   ```

---

## 步驟四：安裝專案套件

在專案資料夾裡執行：
```
uv sync
```

這會自動下載所有需要的套件。第一次可能要等 1-2 分鐘。

看到類似這樣的訊息就代表成功：
```
Resolved X packages in Xs
Installed X packages in Xs
```

---

## 步驟五：啟動編輯器！

```
cd editor
uv run python server.py
```

如果看到：
```
INFO:     Uvicorn running on http://0.0.0.0:3000
```

恭喜！打開瀏覽器，輸入 `http://localhost:3000`，你應該會看到編輯器了！ ٩(｡•́‿•̀｡)۶

---

## 常見問題

### Q: 「command not found: uv」？

**A:** uv 還沒被加到系統路徑。試試：
- Mac/Linux：執行 `source ~/.bashrc` 或 `source ~/.zshrc`
- 或者直接重新開機

### Q: 瀏覽器開不了 localhost:3000？

**A:** 確認終端機裡 server.py 還在跑。如果不小心關掉了，再執行一次 `uv run python server.py`

### Q: 「Address already in use」（埠號被佔用）？

**A:** 有其他程式在用 3000 埠。執行這個指令關掉它：
```
# Mac/Linux
lsof -ti :3000 | xargs kill -9

# 然後再啟動 server
uv run python server.py
```

### Q: 我改了 Markdown 但心智圖沒更新？

**A:** 編輯器會自動同步。如果沒有：
1. 確認你存檔了
2. 按一下編輯器右上角的重新整理按鈕
3. 如果還是沒反應，重新整理瀏覽器頁面（Cmd+R 或 F5）

### Q: AI 助手功能怎麼用？

**A:** AI 功能是選配的，需要 Anthropic 的 API 金鑰。如果你沒有，編輯器的其他功能還是可以正常使用。

要啟用 AI 功能：
1. 到 [console.anthropic.com](https://console.anthropic.com/) 申請帳號
2. 取得 API 金鑰
3. 在專案根目錄建立 `.env` 檔案，寫入：
   ```
   ANTHROPIC_API_KEY=sk-ant-你的金鑰
   ```
4. 重新啟動 server

---

## 關閉編輯器

在終端機按 `Ctrl + C` 就可以停止伺服器。

---

## 需要幫忙？

如果遇到這份指南沒提到的問題，歡迎：
1. 開 GitHub Issue 描述你的問題
2. 或聯絡團隊成員

祝你使用愉快！ (ﾉ´ヮ`)ﾉ*: ・゚✧
