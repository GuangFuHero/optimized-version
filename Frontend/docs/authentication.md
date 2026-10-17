# Authentication

## Overview

前台（`apps/demo`）的登入由後端負責：密碼、Google、LINE 都由後端驗證，後端把 token 放進 `HttpOnly` cookie。
前端不保存、也讀不到 token。後台（`apps/admin`）在搬到後端登入之前還是用 NextAuth，見最後一節。

核心原則：

- browser 只打前端自己的網址：REST 走 `/api/v1/*`，GraphQL 走 `/api/graphql`，由 proxy 轉給後端。
- token 只存在 cookie 裡，頁面的 script 讀不到。前端程式只知道「誰登入了」：`/users/me` 回的 `uuid`、`name`。
- 前台沒有自己的登入 secret。Google、LINE 的設定只放在後端。

關鍵實作：

| 檔案                                                                                        | 做什麼                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `libs/modules/src/server/backend-proxy.ts`                                                  | REST、GraphQL proxy：轉送 cookie、過期時 refresh 再重送、標記登入已結束 |
| `libs/modules/src/server/auth-cookies.ts`                                                   | cookie 名稱、要轉送哪些 cookie                                          |
| `libs/modules/src/server/session-refresh.ts`                                                | 向後端 refresh；同一個 refresh token 只換一次                           |
| `apps/demo/src/proxy.ts`、`libs/modules/src/server/refresh-before-render.ts`                | 頁面 render 前先 refresh                                                |
| `libs/modules/src/server/current-user.ts`                                                   | Server Component 讀目前登入的人                                         |
| `libs/modules/src/session/*`                                                                | `useAuthSession`、跨分頁通知、登入失效的處理                            |
| `libs/modules/src/auth/login/*`、`libs/modules/src/auth/session/*`                          | 登入、註冊、登出、帳號安全頁                                            |
| `apps/demo/src/app/api/v1/[...segments]/route.ts`、`apps/demo/src/app/api/graphql/route.ts` | 把 proxy 掛上前台的路徑                                                 |

## Cookie

後端設三個 cookie，名稱都以 `AUTH_COOKIE_PREFIX`（下面寫成 `{p}`）開頭：本機 `wgdev`、staging `wgstg`、正式站 `wg`。
前端的 `AUTH_COOKIE_PREFIX` 必須跟後端一樣，proxy 和 middleware 只認這個前綴的 cookie。

| cookie      | 內容                              | `Path`               | 壽命                                          |
| ----------- | --------------------------------- | -------------------- | --------------------------------------------- |
| `{p}_at`    | access token（JWT 15 分鐘就過期） | `/`                  | 跟 session 一樣長（14 天），每次 refresh 更新 |
| `{p}_rt`    | refresh token                     | `/`                  | 14 天，每次 refresh 更新                      |
| `{p}_oauth` | Google／LINE 登入進行中的 state   | `/api/v1/auth/oauth` | 10 分鐘                                       |

- 三個都是 `HttpOnly`、`SameSite=Lax`、`Secure`。本機是純 http，後端要設 `AUTH_COOKIE_SECURE=false`。
- staging 和正式站的 cookie 掛在上層網域，前台和後台共用同一次登入。本機不設 `Domain`。
- `{p}_at` 的 cookie 比裡面的 JWT 活得久，是故意的：過期的 token 還會送到後端，後端才能回 `access_token_expired`
  讓 proxy 去 refresh。cookie 如果跟著 15 分鐘過期，瀏覽器會直接丟掉它，使用者就不知不覺變成訪客。

## Proxy（`/api/v1/*`、`/api/graphql`）

轉送給後端的 header：

- `cookie`：只轉送 `{p}_` 開頭的 cookie。別的環境的 cookie（例如正式站的 `wg_*` 也會送到 staging 的子網域）不會送進來。
  `{p}_rt` 只送給 `/api/v1/auth/session*`，其他路徑用不到它。
- `origin`、`referer`：後端對「用 cookie 驗證、而且會寫入」的請求檢查 Origin（ADR-327），要看到瀏覽器原本的 header。
- `content-type`、`accept`。
- `x-forwarded-for`：只取 Cloudflare 的 `cf-connecting-ip`。後端的 rate limit 是照 IP 算的。
- `X-WG-Realm: site`（ADR-289）。
- 前台不送 `Authorization`。

帶回瀏覽器的 header：`set-cookie`（一條一條轉）、`location`（OAuth 的導向；proxy 不自己跟著 redirect 走）、
`content-type`、`content-disposition`、`retry-after`。`cache-control` 一律 `no-store`，只有公開的地圖圖磚例外：
圖磚不帶 cookie，所有人共用同一份快取。

### 401 的處理（ADR-328）

後端的 401 一律是 `{ "detail": …, "code": … }`。proxy 只處理**有帶 `{p}_at`** 的請求：

| code                                         | proxy 做什麼                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `access_token_expired`、`access_token_stale` | refresh 一次，用新的 cookie 重送原本的請求，把新的 cookie 連同重送的回應一起交給瀏覽器 |
| `session_expired`、`credentials_invalid`     | 回應加上 `x-wg-session: expired`。後端在同一個回應裡已經清掉 cookie                    |
| 其他                                         | 原樣轉回                                                                               |

- 沒帶 `{p}_at` 的請求是訪客。後端對訪客也回 `credentials_invalid`，但沒有 session 可以 refresh 或結束，proxy 原樣轉回。
- 例外：`POST /api/v1/auth/session`（密碼登入）打錯密碼也回 `credentials_invalid`，可是跟目前登入的 session 無關
  （後端也不會清 cookie），所以 proxy 原樣轉回、不標記。已登入的人在登入頁打錯密碼，還是登入狀態。
- refresh 的結果：
  - 成功：用新的 cookie 重送。
  - 被拒（refresh token 已失效）：後端清掉 cookie，回應標上 `x-wg-session: expired`。
  - 後端沒回答、rate limit、5xx：proxy 回 503，session 不動，下一個請求再試。
- 同一個 refresh token 只換一次：一個頁面同時發出的請求一起等同一次 refresh。換好之後的 30 秒內，還帶著舊 token
  的請求會拿到同一組新 cookie；後端的寬限期也是 30 秒（ADR-330）。

browser 端的 `sessionExpiryFetch`（urql client、auth API client、登入狀態的 store 都用它）看到 `x-wg-session: expired`
時：記下「登入已失效」的提示、通知其他分頁、把這個分頁重新整理成訪客。一個分頁只做一次，同時回來好幾個標記也一樣。

## 頁面 render 前先 refresh（`apps/demo/src/proxy.ts`）

Server Component 不能設 cookie，所以 access token 快過期的那一分鐘內，頁面在 server 端讀登入狀態會拿到 401。
Next 的 proxy（middleware）在 render 前先看 `{p}_at` 裡 JWT 的 `exp`（不驗簽名，只用來決定要不要先 refresh；
簽名由後端在每個請求驗）：

- 剩不到 60 秒，而且有 `{p}_rt`：先 refresh，把新的 cookie 寫進這次的 request（讓 render 讀到）和 response
  （讓瀏覽器存起來）。refresh 被拒時，request 改寫成訪客的樣子。
- matcher 排除 `/api/*`、`/_next/*` 和靜態檔。

Server Component 要讀目前登入的人時，用 `currentUserFromBackendAsync(cookieHeader)`（`@rescue-frontend/modules/server`）：
回傳使用者，訪客回 `null`。token 過期或其他錯誤會丟例外，不會把登入的人當成訪客。

## browser 的登入狀態（`useAuthSession`）

`AuthSessionProvider` 讀 `/api/v1/users/me`，兩個 app 的 providers 都有掛。`useAuthSession()` 回傳
`{ status, user, refetch }`：`status` 是 `loading`、`authenticated` 或 `unauthenticated`；`user` 只有 `uuid`、`name`。

重新讀的時機：頁面載入、視窗取得焦點、分頁回到前景、其他分頁通知登入或登出、呼叫 `refetch()`（登入成功之後）。

跨分頁通知用 `BroadcastChannel('wg-auth')`，訊息是 `signed-in` 或 `signed-out`（`session/auth-broadcast.ts`）。

前台的分頁什麼時候重新整理（`shouldReloadForSignOut`）：

- 原本是登入狀態的分頁，讀到「已登出」或「換成另一個帳號」（`uuid` 不同）：重新整理。
- 訪客的分頁看到別的分頁登入：不重新整理，只更新畫面。
- 這個分頁自己正在登出：交給登出流程自己重新整理，不重複。

用整頁重新整理而不是 `router.refresh()`，是因為登入時抓的資料（列表的認領、地圖的精確位置、urql 的快取）存在
browser 裡，`router.refresh()` 只會重畫 server 那部分，訪客會繼續看到登入的人才看得到的東西。

## 登入方式

登入、註冊表單（`LoginFormClient`、`RegisterFormClient`）前後台共用，參數 `signInWith` 預設是 NextAuth；前台的
`/login`、`/register` 傳 `signInWith="backend"`（登入表單還要傳 `app="site"`）。

### 密碼

1. `GET /api/v1/auth/salt/:value` 取 `salt_frontend`。
2. browser 用 PBKDF2 雜湊密碼，後端不會收到明文密碼。
3. `POST /api/v1/auth/session`，body `{ username, password }`。後端設好 cookie，回 `{ user, identity }`。
4. 通知其他分頁、`refetch()`、回到 `callbackUrl`。`safeReturnPath` 只接受本站的路徑，其他一律換成預設頁。

錯誤文案：`passwordSignInErrorMessage`。`credentials_invalid` 顯示「帳號或密碼不正確」，其他 code 照
`libs/modules/src/auth/api/error-messages.ts`。

### 註冊

1. `POST /api/v1/auth/register`，後端寄出驗證碼。
2. `POST /api/v1/auth/session/verify`，body `{ type, value, code }`：驗證成功的同一個請求就登入了，不會有
   「帳號建好了、但沒登入」的情況。
3. 接著跟密碼登入的第 4 步一樣。

### Google、LINE

1. 按鈕整頁導到 `/api/v1/auth/oauth/{google|line}/start?app=site&return_to=<本站路徑>`（`oauthStartHref`）。
2. 後端設 `{p}_oauth`，把瀏覽器導到 Google 或 LINE。
3. Google、LINE 導回 `/api/v1/auth/oauth/{provider}/callback`，由 proxy 原樣轉給後端。
4. 成功：後端設好 cookie，導到 `return_to`。失敗：導回 `/login?error=<code>`，登入頁用 `loginErrorMessage` 顯示文案。

本機要在 Google、LINE 的 console 登記的 redirect URI：`http://localhost:3000/api/v1/auth/oauth/<google|line>/callback`。

### 登出

`signOutHereAsync`（`libs/modules/src/auth/session/sign-out.ts`）：

1. 先清掉「請求協助」的草稿：使用者選擇離開，可能是在共用的裝置上。
2. `DELETE /api/v1/auth/session`。
3. 成功：通知其他分頁，重新整理成訪客。
4. 失敗（後端的 session store 連不上回 503，或沒有回應）：cookie 還在，人還是登入狀態。不重新整理，
   顯示「登出失敗，你目前仍在登入狀態，請稍後再試一次。」

## 頁面

公開：`/login`、`/register`、`/forgot-password`、`/reset-password`。

需登入：`/account/security`。

- server 端用 `currentUserFromBackendAsync` 讀目前登入的人，訪客導回 `/login`。
- 改密碼、建立密碼、登出所有裝置之後，頁面導回 `/login` 重新登入，並通知其他分頁。
- 前台使用者選單還沒打開「帳號安全」的入口：頁面可以用，但選單裡沒有連過去。

## 前台會呼叫的 auth API

- `GET /api/v1/auth/salt/:value`
- `POST /api/v1/auth/session`、`DELETE /api/v1/auth/session`、`POST /api/v1/auth/session/verify`
- `POST /api/v1/auth/session/refresh`（只有 proxy 和 middleware 在 server 端呼叫）
- `GET /api/v1/auth/oauth/{provider}/start`、`GET /api/v1/auth/oauth/{provider}/callback`（整頁導覽）
- `POST /api/v1/auth/register`、`POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/forgot-password`、`POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/change-password`、`POST /api/v1/auth/set-password`、`POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/contacts`、`POST /api/v1/auth/contacts/verify`、`POST /api/v1/auth/contacts/resend`
- `GET /api/v1/users/me`

完整的 API 和型別見 `libs/data-access/src/rest/openapi.d.ts`（`pnpm schemas:generate` 從後端產生）。

## 環境變數

- `AUTH_COOKIE_PREFIX`：要跟後端一樣（本機 `wgdev`）。
- `NEXT_PUBLIC_API_BASE_URL`、`API_BASE_URL`、`GRAPHQL_URL`：後端的網址。

前台沒有登入相關的 secret。範例見 `Frontend/.env.example`。

## 後台（`apps/admin`）

後台搬到後端登入之前，還是用 NextAuth：

- `apps/admin/src/app/api/auth/[...nextauth]/route.ts`、`libs/modules/src/server/auth-options.ts`、
  `libs/modules/src/server/server-backend-auth.ts`。
- 後台的 proxy 用 NextAuth session 裡的 backend token 帶 `Authorization: Bearer`，不轉送瀏覽器的 cookie，也不替前台
  的 session refresh。
- 在那之前，後台要自己登入，前台的登入帶不過去。

後台搬過去時要做的：登入、註冊頁改傳 `signInWith="backend"`（登入頁加 `app="admin"`），照 `apps/demo/src/proxy.ts`
加上 render 前的 refresh，proxy 改成跟前台一樣轉送 cookie，然後拿掉 NextAuth。
