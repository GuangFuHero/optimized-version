# modules

This library contains domain-owned frontend modules.

## Ownership

Place reusable UI here when it carries domain language or workflow meaning, even if more than one app surface uses it.

Use surface family as the first ownership boundary.

Current target surface families:

- `auth/login`
- `admin/field-configuration`
- `admin/invite-side-sheet`
- `admin/map`
- `admin/shell/sidebar`
- `admin/station`
- `admin/ticket`
- `admin/shell/top-navbar`
- `admin/user-management`

`site/` is reserved for future reusable site modules and does not need to exist until a real reusable site surface appears.

## Public API

Consume runtime code through `@rescue-frontend/modules`.

Do not export `stories`, fixture-only helpers, or mock data from runtime barrels.

Barrel strategy:

- `src/index.ts` remains the canonical runtime entrypoint for consumers.
- Active surface families may keep `src/<surface>/index.ts` as an internal aggregation barrel.
- Deep imports into `libs/modules/src/**` are not treated as stable API.

## Feature Taxonomy

Use surface family first, then feature root as the ownership boundary.

- Surface-owned shell chrome lives under `src/<surface>/shell/**` until it is proven to be cross-surface and semantics-free.
- Single-surface features keep the main runtime component at `src/<surface>/<feature>/index.tsx`, with feature-local constants beside it.
- Complex features use explicit ownership names such as `assets`, `components`, `types`, `theme`, `preview`, `hooks`, `context`, or purpose-bearing helper files.
- Do not add a generic `shared/` directory as the default landing zone for types, theme values, or generic helpers.

Examples in the current tree:

- Surface barrels: `auth`, `admin`
- Surface-owned shell roots: `admin/shell/sidebar`, `admin/shell/top-navbar`
- Feature roots: `auth/login`, `admin/field-configuration`, `admin/invite-side-sheet`, `admin/map`, `admin/station`, `admin/ticket`, `admin/user-management`

## Naming Guidance

- Use surface ownership to remove redundant path prefixes when possible. For example, keep the public component name `AdminFieldConfigurationPanel`, but place it at `admin/field-configuration` rather than `admin/admin-field-configuration`.
- Keep existing exported component and type names stable unless a rename clearly improves public semantics.
- Prefer the narrowest ownership that fits today; promote later only when a second real consumer proves the need.
