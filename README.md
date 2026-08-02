# Wanguard

Wanguard is a disaster-response support product. This repository contains the application and its governed product documentation.

## Product documentation

All product documentation lives in [`specs/`](./specs/README.md). Agents and contributors must read [`specs/AGENTS.md`](./specs/AGENTS.md) before changing any of it.

Repository navigation: [product specifications](./specs/README.md) · [agent rules](./specs/AGENTS.md) · [Backend](./Backend/) · [Frontend](./Frontend/)

Minimum path for a scoped change:

```text
README -> specs/AGENTS.md -> specs/README.md -> product-area README -> target Version -> owned Feature
```

Product definition lives under `specs/product-areas/`. Product areas are stable capabilities; Features are independently defined, validated, and released. Release aggregation lives under `specs/versions/`, where manifests reference released Features without containing or moving their files.
