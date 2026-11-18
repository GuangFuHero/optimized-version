# modules

This library contains domain-owned frontend UI and workflows. Use capability roots such as `auth`, `map`, `route`, `shell`, `station` and `ticket`. Surface-specific code stays inside its capability, such as `shell/admin` and `station/admin`.

Use TanStack Query for server data, Zustand for shared client state, TanStack Form for form drafts, TanStack Table for data tables, and nuqs for search params. Keep local UI switches in React state. See [working principles](../../docs/frontend-working-principles.md) for ownership and behavior rules, and [data access](../../docs/data-access.md) for generated clients and codegen.

Consume public modules through `@rescue-frontend/modules`. Runtime barrels must not export stories, fixtures or mock data. Keep helpers with their owning feature; promote them when another consumer needs them. Keep generic UI in `libs/ui` and API contracts in `libs/data-access`.
