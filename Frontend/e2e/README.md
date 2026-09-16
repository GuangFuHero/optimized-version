# Frontend E2E (Playwright)

Browser tests for `apps/demo`. Network is fully mocked (GraphQL, NextAuth
session, reverse geocode, map tiles). No backend, no real credentials.

```bash
pnpm e2e:install   # once: Chromium
pnpm e2e           # reuse or start http://localhost:3000, then run tests
```

Config: `e2e/playwright.config.ts`. Specs: `e2e/tests/`. Report: `.playwright-report/`.
