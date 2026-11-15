# Admin app

Run `pnpm dev:admin` from `Frontend/`. The app uses Next.js 16 and listens on port 3001. Pages use root routes such as `/dashboard`, `/map`, `/tickets`, and `/stations`; `/` opens the dashboard. Copy `.env.example` to `.env.local`. Both apps sign in with the backend's cookies, so a sign-in on one carries over to the other. Set `ADMIN_APP_URL` in the demo app to the deployed admin origin. The site's `/admin` entry redirects to that origin's root. Set `SITE_APP_URL` in this app to the site's origin.

Both apps use shared document layout, UI/session providers, and GraphQL and REST proxy handlers. The app's route files select the admin audience. Backend requests carry `X-WG-Realm: admin`, so they act as the identity switched to in the back office, or else the account's first back-office identity (ADR-329). An account without a back-office identity sees a page with a link to the site's map and a sign-out button, without the shell. `API_BASE_URL` includes `/api`.

Authentication, map tiles, and attribution use `/api/v1/*`. The REST proxy forwards bodies and backend error codes, refreshes session cookies, and lets the backend enforce endpoint permissions. Public map GET responses use a seven-day server cache and a one-day browser cache without attaching a session.

Import hooks from `@rescue-frontend/data-access/admin`. For example, `useTickets({ limit: 50 })`, `useUsers({ query: { skip: 0, limit: 50 } })`, and `useCreateStation()` return TanStack Query results with generated request and response types. Mutations take generated GraphQL variables or the REST hook's exported input type, and invalidate the affected queries. REST and GraphQL failures reach the shared toast handler. Multipart upload bodies accept a `Blob` or `File`.

The existing admin placeholder pages and sample map data remain in place. The hooks are ready for screen integration, and the map creation drawers use them.

GraphQL uses The Guild's client preset to generate typed documents, sent by `createGraphqlRequest`. TanStack Query owns caching, in the admin and on the site.

Run `pnpm schemas:generate` to export schemas from the checked-out backend and regenerate clients. It imports the FastAPI app and Strawberry schema without starting a server or connecting to the database. It requires the backend's `uv` environment. `pnpm typecheck` checks every frontend workspace package without regenerating. CI fails if regeneration changes committed files. `pnpm lint` checks all frontend projects.

The site and the admin share one GraphQL schema, `libs/data-access/src/graphql/schema.graphql`. Export updates it and the REST OpenAPI contract.
