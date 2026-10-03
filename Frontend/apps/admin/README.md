# Admin app

Run `pnpm dev:admin` from `Frontend/`. The app uses Next.js 16 and listens on port 3001. Pages use root routes such as `/dashboard`, `/map`, `/tickets`, and `/stations`; `/` opens the dashboard. Copy `.env.example` to `.env.local` and set `NEXTAUTH_SECRET`. Use the same secret as the site to share its session on the same hostname. Set `ADMIN_APP_URL` in the demo app to the deployed admin origin. The site's `/admin` entry redirects to that origin's root.

Both apps use shared document layout, UI/session providers, GraphQL and REST proxy handlers, and Google reverse geocoding. The app's route files select the admin audience. Backend requests use the current token identity and omit the site's `X-WG-Realm` header. `API_BASE_URL` includes `/api`.

Authentication, map tiles, and attribution use `/api/v1/*`. The REST proxy forwards bodies and backend error codes, refreshes session cookies, and lets the backend enforce endpoint permissions. Public map GET responses use a seven-day server cache and a one-day browser cache without attaching a session. `/api/graphql` requires an admin session; `/api/auth/*` remains NextAuth's own API. Google reverse geocoding stays under `/api/google/reverse-geocode` because the backend does not provide that endpoint.

TanStack Query uses a shared QueryClient configuration with toast error handling. The existing urql provider and generated GraphQL documents serve the map creation drawers. Query clients reset when the signed-in user changes.

The existing admin placeholder pages and sample map data remain in place.

GraphQL uses the existing urql client factory and The Guild's client preset to generate typed documents. The site's urql provider and normalized cache remain unchanged.

Run `pnpm typecheck` to check every frontend workspace package and `pnpm lint` to check all frontend projects. Run `pnpm codegen` to regenerate the existing GraphQL documents.
