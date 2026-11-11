# data-access

Both clients come from the backend's contracts: `src/graphql/schema.graphql` and `src/rest/openapi.json`. The site's and the admin's GraphQL operations live in `src/graphql/**/*.graphql`, and The Guild's client preset generates one set of typed documents from them in `src/graphql/__generated__/`. `createGraphqlRequest` sends a generated document and throws `GraphqlError`; `createRestClient` wraps openapi-fetch and throws `ApiError`. TanStack Query owns every cache.

From `Frontend/`, run `pnpm schemas:generate` to export the backend OpenAPI and GraphQL schemas and regenerate both clients. CI runs it and fails if the generated files differ from the committed ones. The export requires `uv` and Python 3.13, but does not need a running backend or database. Run `pnpm codegen` to regenerate from the checked-in schemas without exporting.

The TypeScript OpenAPI generator is `scripts/generate-openapi.ts` in this package. It runs through `pnpm --filter @rescue-frontend/data-access codegen:openapi`. Generated binary request fields use `Blob` for multipart uploads.

Import query options and hooks from `@rescue-frontend/data-access/admin`, including `useTickets`, `useStations`, `useUsers`, `useTicketHistory`, `useCreateTicket`, and `useCreateStation`. Inputs and results come from generated operation types. Query functions forward cancellation signals, and mutations invalidate related queries. `createAdminQueryClient` reports query and mutation errors through the app's callback, which displays a toast. REST requests use openapi-fetch through `createRestClient`; both clients call same-origin proxies and keep credentials in the browser session.
