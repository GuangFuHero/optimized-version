# Wanguard

Wanguard is a disaster-response support product. This repository contains the application and its governed product documentation.

## Product documentation

Agents and contributors must read [AGENTS.md](./AGENTS.md) before changing product documentation. The canonical entry point is [specs/README.md](./specs/README.md).

Repository navigation: [documentation map](./DOCS.md) · [product specifications](./specs/README.md) · [agent rules](./AGENTS.md) · [Backend](./Backend/) · [Frontend](./Frontend/)

Minimum path for a scoped change:

```text
README -> AGENTS -> specs/README -> product-area README -> target Version -> owned Feature
```

Product definition lives under `specs/product-areas/`. Product areas are stable capabilities; Features are independently defined, validated, and released. Release aggregation lives under `specs/versions/`, where manifests reference released Features without containing or moving their files.
