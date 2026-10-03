# data-access

The site keeps its existing urql client and GraphQL schema snapshot. The checked-out backend does not yet implement every site operation, including role requests, help requests, and my tickets. Admin operations use the schema exported from that backend and The Guild's client preset for typed documents and results. TanStack Query owns the admin cache; urql supplies the GraphQL transport.

From `Frontend/`, run `pnpm schemas:generate` to export the backend OpenAPI and GraphQL schemas and regenerate both clients. `pnpm typecheck` runs this first. The export requires `uv` and Python 3.13, but does not need a running backend or database. Run `pnpm codegen` to regenerate from the checked-in schemas without exporting.

The TypeScript OpenAPI generator is `scripts/generate-openapi.ts` in this package. It runs through `pnpm --filter @rescue-frontend/data-access codegen:openapi`. Generated binary request fields use `Blob` for multipart uploads.

Import query options and hooks from `@rescue-frontend/data-access/admin`, including `useTickets`, `useStations`, `useUsers`, `useTicketHistory`, `useCreateTicket`, and `useCreateStation`. Inputs and results come from generated operation types. Query functions forward cancellation signals, and mutations invalidate related queries. `createAdminQueryClient` reports query and mutation errors through the app's callback, which displays a toast. REST requests use openapi-fetch through `createRestClient`; both clients call same-origin proxies and keep credentials in the browser session.
