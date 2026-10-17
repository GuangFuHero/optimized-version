# Admin app

Run `pnpm dev:admin` from `Frontend/`. The app uses Next.js 16 and listens on port 3001. Pages use root routes such as `/dashboard`, `/map`, `/tickets`, and `/stations`; `/` opens the dashboard. Copy `.env.example` to `.env.local` and set `NEXTAUTH_SECRET`. Use the same secret as the site to share its session on the same hostname. Set `ADMIN_APP_URL` in the demo app to the deployed admin origin. The site's `/admin` entry redirects to that origin's root.

Both apps use shared document layout, UI/session providers, GraphQL and REST proxy handlers, and Google reverse geocoding. The app's route files select the admin audience. Backend requests use the current token identity and omit the site's `X-WG-Realm` header. `API_BASE_URL` includes `/api`.

Authentication, map tiles, and attribution use `/api/v1/*`. The REST proxy forwards bodies and backend error codes, refreshes session cookies, and lets the backend enforce endpoint permissions. Public map GET responses use a seven-day server cache and a one-day browser cache without attaching a session. `/api/graphql` requires an admin session; `/api/auth/*` remains NextAuth's own API. Google reverse geocoding stays under `/api/google/reverse-geocode` because the backend does not provide that endpoint.

Import hooks from `@rescue-frontend/data-access/admin`. For example, `useTickets({ limit: 50 })`, `useUsers({ query: { skip: 0, limit: 50 } })`, and `useCreateStation()` return TanStack Query results with generated request and response types. Mutations take generated GraphQL variables or the REST hook's exported input type, and invalidate the affected queries. REST and GraphQL failures reach the shared toast handler. Multipart upload bodies accept a `Blob` or `File`.

The existing admin placeholder pages and sample map data remain in place. The hooks are ready for screen integration, and the map creation drawers use them.

GraphQL uses the existing urql client factory and The Guild's client preset to generate typed documents. The admin uses urql's fetch exchange without its cache because TanStack Query owns caching. The site's urql provider and normalized cache remain unchanged.

Run `pnpm schemas:generate` to export schemas from the checked-out backend and regenerate clients. It imports the FastAPI app and Strawberry schema without starting a server or connecting to the database. It requires the backend's `uv` environment. `pnpm typecheck` checks every frontend workspace package without regenerating. CI fails if regeneration changes committed files. `pnpm lint` checks all frontend projects.

The admin schema is `libs/data-access/src/admin/graphql/schema.graphql`. The site's existing `libs/data-access/src/graphql/schema.graphql` is a separate snapshot because the checked-out backend does not implement some site operations. Export updates the admin contract and the shared REST OpenAPI contract, and leaves the site snapshot intact.
