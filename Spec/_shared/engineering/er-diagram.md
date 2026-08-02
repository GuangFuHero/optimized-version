# ER Diagram

**Status:** pointer only. This file does not hold a copy of the data model.

The maintained ER diagram lives with the backend engineering specifications at [`Backend/Spec/Docs/er-diagram.md`](../../../Backend/Spec/Docs/er-diagram.md). The backend team owns it; product documents read it and never edit it.

**How to use it**

- Treat it as a structural reference for the current implementation, not as approved product behavior.
- It is not runtime validation evidence. A Feature reaches `Validated` or `Released` only through its own `validation.md`.
- When the diagram and an approved product Spec disagree, record the conflict in the owning product area's `README.md` and wait for the Owner.

**Last product-side verification:** 2026-08-02, against code commit `44ce18f5836ee3e0a753240983932a865723cb54`. Identity, policy, geometry, station, task, assignment, suggestion, and property-configuration structures were observed to match. It was not compared with a live migrated database, and constraints may be described more strongly than the ORM enforces.
