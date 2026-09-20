# ui

This library is the foundation-only UI layer.

## Development

From `Frontend/`, run `pnpm dev:ui` to start Storybook on port 6006. From this package directory, run `pnpm dev`.

Stories live beside components as `*.stories.tsx`. The preview applies the shared MUI theme. The icon gallery and pagination stories provide controls for exploring component props; pagination clicks also update the page control.

- `pnpm typecheck` checks the library, stories, and Storybook configuration.
- `pnpm build:storybook` creates a static Storybook in `Frontend/dist/storybook/ui`.

## Ownership

Keep only business-neutral UI building blocks here:

- theme and tokens
- icons
- primitives
- layouts
- other reusable visual foundations with no domain-specific meaning

Domain-owned reusable UI belongs in `@rescue-frontend/modules`, not this package.
