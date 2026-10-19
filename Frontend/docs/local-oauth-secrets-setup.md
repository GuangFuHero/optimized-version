# 取得本機開發用的 OAuth secret

只有要在本機測試 **Google / LINE 登入**時才需要。
一般 email + 密碼登入不需要這些值，可以跳過整份文件。

> **LINE 登入另有前置條件**：LINE 要求開發環境使用 https，Tester 需要個別申請。若要在本機測試 LINE login，請聯絡 **POPO** 或 **Dan**。

## 1. 安裝 gcloud CLI

https://cloud.google.com/sdk/docs/install

Windows 使用者請在 **WSL** 或 **Git Bash** 執行下面的指令，PowerShell 無法直接執行。

## 2. 登入

用被授權的那個 Google 帳號登入：

```bash
gcloud auth login
```

確認目前使用的帳號正確：

```bash
gcloud auth list
```

## 3. 準備 `Frontend/.env.local`

如果還沒建立，請先照 env 範本的 FRONTEND 段落建立 `Frontend/.env.local`，並確認裡面有這兩行（值可以先留空）：

```
GOOGLE_CLIENT_SECRET=
LINE_CLIENT_SECRET=
```

## 4. 取值並寫入

在 **repo 根目錄**整段貼上執行：

```bash
(
  set -e
  P=wanguard-250923
  F=Frontend/.env.local
  grep -q '^GOOGLE_CLIENT_SECRET=' "$F" && grep -q '^LINE_CLIENT_SECRET=' "$F" \
    || { echo "找不到 $F 或缺少 *_CLIENT_SECRET= 這兩行，請先照範本建立"; exit 1; }
  G=$(gcloud secrets versions access latest --project=$P --secret=staging-frontend-google-client-secret)
  L=$(gcloud secrets versions access latest --project=$P --secret=staging-frontend-line-client-secret)
  [ -n "$G" ] && [ -n "$L" ] || { echo "取到的值是空的"; exit 1; }
  sed -i.bak -e "s|^GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=$G|" \
             -e "s|^LINE_CLIENT_SECRET=.*|LINE_CLIENT_SECRET=$L|" "$F"
  rm "$F.bak"
  echo "完成：已更新 $F"
)
```

看到 `完成：已更新 Frontend/.env.local` 就代表成功。任何一步失敗都會停下並印出原因，**不會改動**原本的檔案。

## 5. 重啟前端

```bash
pnpm dev:demo
```

## 常見問題

| 狀況 | 原因 / 處理方式                                                                                            |
|---|------------------------------------------------------------------------------------------------------|
| `PERMISSION_DENIED` | 登入的帳號不對（用 `gcloud auth list` 確認）；或權限剛加上還沒生效，等幾分鐘再試                                                   |
| 在 GCP 控制台看不到 secret 清單 | 正常。你只有讀取值的權限，請用上面的 gcloud 指令                                                                         |
| 讀取其他 secret 時出現 `PERMISSION_DENIED` | 正常。你只被授權這兩個 secret                                                                                   |
| Google / LINE 登入出現 `redirect_uri_mismatch` | `http://localhost:3000/api/auth/callback/<google\|line>` 還沒登記在 OAuth client 上，請找 POPO or Sucre或其他管理員 |

## 注意事項

- **LINE 登入需要 https 開發環境。** Tester 要個別申請，若需在本機測試 LINE login，請聯絡 **POPO** 或 **Dan**。
- **repo 是公開的。** 不要把 secret 值貼到 Slack、issue、PR 或 commit 裡。`Frontend/.env.local` 已經列在 `.gitignore`。
- **不需要**執行 `gcloud config set project` 或 `gcloud auth application-default login`。這次用不到，而且可能會影響你其他的 GCP 專案。
- 其他 staging secret（JWT key、DB 密碼、tunnel token 等）本機開發都用不到，也不會開放權限。
