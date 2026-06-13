# Authentication

## Overview

Frontend 的認證分成兩層：

1. `next-auth`
   負責瀏覽器 session、provider callback、server-side cookie 管理。
2. Backend auth API
   負責真正的帳號驗證、簽發本系統的 `access_token` / `refresh_token`、refresh rotation、密碼與聯絡方式管理。

目前實作的原則是：

- 瀏覽器不直接持有 backend token。
- 瀏覽器只和 frontend domain 溝通。
- frontend server 透過 `next-auth` 的 JWT session cookie 保存 backend token，並在 server-side 代替 client 呼叫 backend。

## Token Model

### Browser side

- Client 只知道 `next-auth` session 是否存在。
- `session` 物件不暴露 backend `access_token` / `refresh_token`。
- Client GraphQL 一律打 `/api/graphql`。
- Client auth action 一律打 `/api/bff/auth/*`。

### Server side

- backend `access_token` / `refresh_token` 存在 `next-auth` 的 JWT cookie。
- 每次 server 取 session 或 proxy request 時，會檢查 backend access token 是否快過期。
- 若快過期，frontend server 會先呼叫 backend `/auth/refresh`，再把新的 token pair 寫回 `next-auth` cookie。

關鍵實作：

- `Frontend/apps/demo/src/lib/auth-options.ts`
- `Frontend/apps/demo/src/lib/server-backend-auth.ts`
- `Frontend/apps/demo/src/app/api/graphql/route.ts`
- `Frontend/apps/demo/src/app/api/bff/auth/[[...segments]]/route.ts`

## Supported Sign-in Methods

### 1. Credentials login

流程：

1. Client 先呼叫 `/api/bff/auth/salt/:value`
2. Browser 使用 `salt_frontend` 做 PBKDF2 雜湊
3. Client 呼叫 `signIn("credentials")`
4. `CredentialsProvider.authorize()` 在 server 端呼叫 backend `/auth/login`
5. backend 回本系統 token pair
6. `next-auth` JWT cookie 保存 backend token

備註：

- 明文密碼不會送到 backend。
- backend 收到的是前端已經 PBKDF2 處理過的字串。

### 2. Register + verify

流程：

1. Browser 產生新的 `salt_frontend`
2. Browser 先把密碼 PBKDF2 雜湊
3. Client 呼叫 `/api/bff/auth/register`
4. 使用者收到驗證碼後，Client 呼叫 `/api/bff/auth/verify`
5. backend 回 token pair
6. Client 再用 `signIn("credentials")` 的 token passthrough 方式建立 `next-auth` session

### 3. Google SSO

流程：

1. Client 呼叫 `signIn("google")`
2. NextAuth Google Provider 在 server 端完成 OAuth / OIDC callback
3. NextAuth 從 provider account 取得 `account.id_token`
4. `jwt` callback 在 server 端呼叫 backend `/auth/sso/google`
5. backend 驗證 Google `id_token`，回本系統 token pair
6. `next-auth` JWT cookie 保存 backend token

重要：

- 不是前端拿 Google `id_token` 再送 backend
- 是 NextAuth server 端拿到 `account.id_token` 後，server-to-server 傳給 backend

### 4. LINE SSO

流程和 Google 相同：

1. Client 呼叫 `signIn("line")`
2. NextAuth LINE Provider 在 server 端完成 OAuth / OIDC callback
3. NextAuth 從 provider account 取得 `account.id_token`
4. `jwt` callback 在 server 端呼叫 backend `/auth/sso/line`
5. backend 驗證 LINE `id_token`，回本系統 token pair
6. `next-auth` JWT cookie 保存 backend token

## SSO Implementation Notes

### Google

- 使用 `next-auth/providers/google`
- Google Cloud Console 的 `Authorized redirect URI` 必須和 `NEXTAUTH_URL` 完全一致，只是後面多 `/api/auth/callback/google`
- callback URL:
  - dev: `http://localhost:3000/api/auth/callback/google`
  - prod: `https://<your-domain>/api/auth/callback/google`

### LINE

- 使用 `next-auth/providers/line`
- LINE Console 的 callback URL 也必須和 `NEXTAUTH_URL` 完全一致，只是後面多 `/api/auth/callback/line`
- callback URL:
  - dev: `http://localhost:3000/api/auth/callback/line`
  - prod: `https://<your-domain>/api/auth/callback/line`
- 目前實作沿用 provider 預設 OIDC scope
- 若未來要拿到 `profile.email`，需要另外加上 email scope，並在 LINE Login channel 先申請 Email permission

即使沒有 email permission，backend 仍可用 `id_token` 完成第三方登入驗證；只是 frontend 無法從 provider profile 直接取得 email，使用者之後可能需要自行補綁聯絡方式。

## Frontend Pages

### Public auth pages

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`

### Authenticated account page

- `/account/security`

目前已接好的功能：

- credentials login
- Google login
- LINE login
- register
- verify
- resend verification
- forgot password
- reset password
- change password
- set password
- add contact
- verify contact
- resend contact
- logout current device
- logout all devices

## Frontend BFF Routes

### Public

- `GET /api/bff/auth/salt/:value`
- `POST /api/bff/auth/register`
- `POST /api/bff/auth/verify`
- `POST /api/bff/auth/resend-verification`
- `POST /api/bff/auth/forgot-password`
- `POST /api/bff/auth/reset-password`

### Protected

- `POST /api/bff/auth/logout`
- `POST /api/bff/auth/logout-all`
- `POST /api/bff/auth/change-password`
- `POST /api/bff/auth/set-password`
- `POST /api/bff/auth/contacts`
- `POST /api/bff/auth/contacts/verify`
- `POST /api/bff/auth/contacts/resend`
- `POST /api/bff/auth/link/google`
- `POST /api/bff/auth/link/line`

備註：

- `link/google`、`link/line` 的 BFF 已存在
- 目前前端尚未提供 account linking UI

## GraphQL Auth Model

Client 不直接把 backend bearer token 放進 GraphQL request header。

現在的模式是：

1. Client 打 frontend `/api/graphql`
2. frontend server 從 `next-auth` JWT cookie 取出 backend access token
3. frontend server 代替 client 把 bearer token 帶去 backend GraphQL

這樣做的好處：

- backend token 不會出現在 client session payload
- browser 不需要知道 refresh token
- token refresh 可以完全在 server 端處理

## Required Environment Variables

### NextAuth

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

### Backend API

- `NEXT_PUBLIC_API_BASE_URL`

### Google

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### LINE

- `LINE_CLIENT_ID`
- `LINE_CLIENT_SECRET`

## Error Handling

登入頁目前會處理常見的 NextAuth error code：

- `CredentialsSignin`
- `OAuthSignin`
- `OAuthCallback`
- `Callback`
- `AccessDenied`
- `OAuthAccountNotLinked`
- `SessionRequired`

第三方登入若在 backend exchange 階段失敗，最終會回到 `/login?error=...`，並顯示對應訊息。

## Current Constraints

### 1. Password change still depends on a login identity

變更密碼流程需要一個可用的登入識別來先取 salt，再驗證舊密碼。

因此：

- credentials user 可直接變更密碼
- Google / LINE user 如果 provider 沒有提供 email，可能需要先補綁 email 或 phone

### 2. Account linking UI is not built yet

backend API 與 frontend BFF 已有：

- `link/google`
- `link/line`

但目前還沒有對應畫面。

## Recommended Backend / Frontend Boundary

建議維持目前模式，不要把 backend token 下放到 browser：

- credentials / OAuth provider 驗證交給 NextAuth
- 系統自己的 access / refresh token 只存 server-side session cookie
- client 一律打 frontend domain

這是目前實作已經採用的方式，也是和 `next-auth` 最一致、風險最低的做法。

## References

- NextAuth Google Provider
  https://next-auth.js.org/providers/google
- NextAuth LINE Provider
  https://next-auth.js.org/providers/line
- NextAuth Callbacks
  https://next-auth.js.org/configuration/callbacks
- NextAuth Pages
  https://next-auth.js.org/configuration/pages
