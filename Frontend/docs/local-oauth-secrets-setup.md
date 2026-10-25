# 取得本機開發用的 OAuth secret

只有要在本機測試 **Google / LINE 登入**時才需要。
一般 email + 密碼登入不需要這些值，可以跳過整份文件。

Google / LINE 登入由後端自己完成，所以 secret 只放在 `Backend/.env`，前端不需要任何 Google / LINE 的設定。
管理平台（`http://localhost:3001`）的 Google / LINE 登入也會回到前台的 callback（`http://localhost:3000`），所以要同時開著前台。

> LINE 登入在本機直接用 `http://localhost:3000` 就可以，不需要 https。
> `http://localhost:3000/api/v1/auth/oauth/line/callback` 已經登記在 LINE channel 上，channel 也已經 publish，
> 不用另外申請成 tester。

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

## 3. 準備 `Backend/.env`

如果還沒建立，先複製 `Backend/.env.example` 成 `Backend/.env`。範本裡已經填好兩個 client ID（本來就是公開的，
跟 staging 用同一組，見 `Backend/scripts/deploy-config.staging.env`），secret 兩行先留空：

```
GOOGLE_CLIENT_ID=717563375943-pibc1j3tdeb6oq4tn7hp3tt78otlgrsj.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=
LINE_CHANNEL_ID=2010287145
LINE_CHANNEL_SECRET=
```

已經有 `Backend/.env` 的話，確認這四行都在，少了就從範本補上。

## 4. 取值並寫入

需要 `staging-backend-google-client-secret` 和 `staging-backend-line-channel-secret` 這兩個 secret 的讀取權限。
以前為前端拿到的 `staging-frontend-*` 權限不會沿用，還沒有的話請先找管理員授權。

在 **repo 根目錄**整段貼上執行：

```bash
(
  set -e
  P=wanguard-250923
  F=Backend/.env
  grep -q '^GOOGLE_CLIENT_SECRET=' "$F" && grep -q '^LINE_CHANNEL_SECRET=' "$F" \
    || { echo "找不到 $F 或缺少 GOOGLE_CLIENT_SECRET= / LINE_CHANNEL_SECRET= 這兩行，請先照範本建立"; exit 1; }
  G=$(gcloud secrets versions access latest --project=$P --secret=staging-backend-google-client-secret)
  L=$(gcloud secrets versions access latest --project=$P --secret=staging-backend-line-channel-secret)
  [ -n "$G" ] && [ -n "$L" ] || { echo "取到的值是空的"; exit 1; }
  sed -i.bak -e "s|^GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=$G|" \
             -e "s|^LINE_CHANNEL_SECRET=.*|LINE_CHANNEL_SECRET=$L|" "$F"
  rm "$F.bak"
  echo "完成：已更新 $F"
)
```

看到 `完成：已更新 Backend/.env` 就代表成功。任何一步失敗都會停下並印出原因，**不會改動**原本的檔案。

## 5. 重啟後端

後端只在啟動時讀 `Backend/.env`，改完要重啟後端才會生效。前端不用重啟。

## 常見問題

| 狀況                                                        | 原因 / 處理方式                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `PERMISSION_DENIED`                                         | 登入的帳號不對（用 `gcloud auth list` 確認）；還沒被授權這兩個 `staging-backend-*` secret；或權限剛加上還沒生效，等幾分鐘再試 |
| 在 GCP 控制台看不到 secret 清單                             | 正常。你只有讀取值的權限，請用上面的 gcloud 指令                                                                              |
| 讀取其他 secret 時出現 `PERMISSION_DENIED`                  | 正常。你只被授權這兩個 secret                                                                                                 |
| 按 Google / LINE 登入後回到登入頁，顯示「登入連結有誤」     | `Backend/.env` 的 client ID 或 secret 是空的，或改完還沒重啟後端                                                              |
| Google / LINE 登入出現 `redirect_uri_mismatch` 或類似的錯誤 | `http://localhost:3000/api/v1/auth/oauth/<google\|line>/callback` 還沒登記在 OAuth client 上，請找 POPO、Sucre 或其他管理員   |

## 注意事項

- **LINE 登入不需要 https。** 本機用 `http://localhost:3000` 即可，callback 已登記、channel 已 publish，不用個別申請 tester。
- **repo 是公開的。** 不要把 secret 值貼到 Slack、issue、PR 或 commit 裡。`Backend/.env` 已經列在 `.gitignore`。
- **不需要**執行 `gcloud config set project` 或 `gcloud auth application-default login`。這次用不到，而且可能會影響你其他的
  GCP 專案。
- 其他 staging secret（JWT key、DB 密碼、tunnel token 等）本機開發都用不到，也不會開放權限。
