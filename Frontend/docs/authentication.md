# Authentication

## Overview

目前 `Frontend/apps/demo` 的認證模型分成兩層：

1. `next-auth`
   管理 browser session、OAuth callback 與 session cookie。
2. backend auth API
   真正驗證帳號、簽發本系統 `access_token` / `refresh_token`，並提供密碼、聯絡方式與 session 管理。

核心原則：

- browser 不直接保存 backend token。
- client 端只呼叫 frontend domain：
  - auth 類請求走 `/api/bff/auth/*`
  - GraphQL 請求走 `/api/graphql`
- backend token 保存在 `next-auth` JWT session cookie，由 frontend server 代替 browser 呼叫 backend。

關鍵實作：

- `apps/demo/src/lib/auth-options.ts`
- `apps/demo/src/lib/server-backend-auth.ts`
- `apps/demo/src/app/api/auth/[...nextauth]/route.ts`
- `apps/demo/src/app/api/bff/auth/[[...segments]]/route.ts`
- `apps/demo/src/app/api/graphql/route.ts`

## Session And Token Flow

### Browser side

- client 只知道 `next-auth` session 是否存在。
- `session` 只暴露：
  - `session.user.id`
  - `session.user.name`
  - `session.user.email`
  - `session.loginIdentity`
  - `session.authProvider`
- 不暴露 backend `access_token` / `refresh_token`。

### Server side

- backend token pair 保存在 `next-auth` JWT cookie。
- `resolveBackendAuthTokenAsync()` 會在 server 端檢查 token 是否將在 30 秒內過期。
- 若 access token 即將過期，會先呼叫 backend `/auth/refresh`，再把新的 token pair 寫回 session cookie。
- refresh 失敗時會清掉 session cookie。

## Supported Sign-in Methods

### Credentials

流程：

1. client 先呼叫 `GET /api/bff/auth/salt/:value`
2. browser 用回傳的 `salt_frontend` 做 PBKDF2
3. client 呼叫 `signIn('credentials')`
4. `CredentialsProvider.authorize()` 在 server 端呼叫 backend `/v1/auth/login`
5. backend 回 token pair
6. `next-auth` JWT cookie 保存 backend token

補充：

- 註冊完成後，前端會用 `verify` 回傳的 token pair 直接走 `signIn('credentials')` token passthrough 建 session。
- backend 不會收到明文密碼，只會收到前端先雜湊過的字串。

### Google SSO

流程：

1. client 呼叫 `signIn('google')`
2. NextAuth Google provider 完成 callback
3. `jwt` callback 取 `account.id_token`
4. server 端呼叫 backend `/v1/auth/sso/google`
5. backend 驗證後回 token pair
6. `next-auth` JWT cookie 保存 backend token

### LINE SSO

流程與 Google 相同，差別是 backend exchange endpoint 為 `/v1/auth/sso/line`。

## Current Frontend Pages

公開頁面：

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`

需登入頁面：

- `/account/security`

補充：

- `/account/security` 已實作並可用。
- 前台使用者選單目前還沒有把「帳號安全」入口打開；頁面存在，但 UI 導航尚未串接。

## Current BFF Auth Routes

公開：

- `GET /api/bff/auth/salt/:value`
- `POST /api/bff/auth/register`
- `POST /api/bff/auth/verify`
- `POST /api/bff/auth/resend-verification`
- `POST /api/bff/auth/forgot-password`
- `POST /api/bff/auth/reset-password`
- `POST /api/bff/auth/sso/google`
- `POST /api/bff/auth/sso/line`

需登入：

- `POST /api/bff/auth/logout`
- `POST /api/bff/auth/logout-all`
- `POST /api/bff/auth/change-password`
- `POST /api/bff/auth/set-password`
- `POST /api/bff/auth/contacts`
- `POST /api/bff/auth/contacts/verify`
- `POST /api/bff/auth/contacts/resend`
- `POST /api/bff/auth/link/google`
- `POST /api/bff/auth/link/line`

補充：

- `sso/google`、`sso/line` BFF route 已存在，但目前登入頁的 Google / LINE 按鈕走的是 NextAuth provider flow，不是直接呼叫這兩支 route。
- `link/google`、`link/line` API 已接到 BFF，但目前沒有 account linking UI。

## Account Security Features

`apps/demo/src/modules/auth/session/account-security.client.tsx` 目前已實作：

- change password
- set password
- add contact
- verify contact
- resend contact
- logout all devices

change password 仍依賴目前登入識別，因為前端需要先以該 identity 取得 salt 再驗證舊密碼。

## GraphQL Auth Model

GraphQL 一律由 frontend server 代理：

1. client 打 `/api/graphql`
2. route handler 從 session cookie 解析 backend access token
3. frontend server 代 client 帶 `Authorization: Bearer <token>` 呼叫 backend GraphQL

這樣的好處是：

- backend token 不會出現在 client payload
- browser 不需要知道 refresh token
- token refresh 完全留在 server 端

## Required Environment Variables

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `LINE_CLIENT_ID`
- `LINE_CLIENT_SECRET`

`AUTH_SECRET` 目前作為 `NEXTAUTH_SECRET` 的 fallback，一般情況仍應直接設定 `NEXTAUTH_SECRET`。

## Error Handling Notes

- credentials login 失敗時，`authorize()` 會回 `null`，NextAuth 最終會回到 `/login?error=CredentialsSignin`
- OAuth provider 或 backend token exchange 失敗時，登入頁會收到對應 `error` query string
- 忘記密碼 / 重設密碼 / contact 驗證的錯誤訊息，現在由 app-local client modules 直接顯示
