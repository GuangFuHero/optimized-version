# data-access

Both clients come from the backend contracts `src/graphql/schema.graphql` and `src/rest/openapi.json`. Codegen reads the `.graphql` operation files under `src/graphql/` and writes typed documents to `src/graphql/__generated__/`. `createGraphqlRequest` sends those documents and throws `GraphqlError`. `createRestClient` wraps openapi-fetch and throws `ApiError`.

From `Frontend/`, run `pnpm schemas:generate` to export the backend OpenAPI and GraphQL schemas and regenerate both clients. CI runs it and fails if the generated files differ from the committed ones. The export requires `uv` and Python 3.13, but does not need a running backend or database. Run `pnpm codegen` to regenerate from the checked-in schemas without exporting.

The TypeScript OpenAPI generator is `scripts/generate-openapi.ts` in this package. It runs through `pnpm --filter @rescue-frontend/data-access codegen:openapi`. Generated binary request fields use `Blob` for multipart uploads.

Import admin query options and hooks from `@rescue-frontend/data-access/admin`. Query functions forward cancellation signals and mutations invalidate related queries. The admin query client reports errors to the app unless the query handles its own error. The browser calls same-origin proxies and keeps credentials in the session.
