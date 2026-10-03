# Site GraphQL client

This directory is generated from the site's schema snapshot at `libs/data-access/src/graphql/schema.graphql`. Run `pnpm codegen` from `Frontend/` to regenerate it.

The checked-out backend does not implement all site operations yet. Its current GraphQL schema and generated admin client live under `libs/data-access/src/admin/graphql/`. `pnpm schemas:generate` exports that schema and the REST OpenAPI schema, then regenerates both clients. `pnpm typecheck` runs this step automatically.
