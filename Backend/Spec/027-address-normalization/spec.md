# 027 Address normalization with TGOS

## What and why

An address used to be stored as typed, in columns whose names did not match their contents (`city` held
鄉鎮市區, `lane` the road, `alley` 巷弄), and nothing checked it. Now:

- the frontend looks an address up through the backend before saving it, against TGOS, the government
  address service;
- a save splits the address line into the official parts (縣市 鄉鎮市區 村里 鄰 路 段 巷 弄 號) and records
  whether TGOS confirmed it;
- every read returns those parts plus the whole line.

The backend is the only caller of TGOS, because TGOS accepts the keys from the registered staging IP alone.

## Flow

```
Frontend                  Backend (GraphQL)         TGOS QueryAddr   TGOS GeoQueryAddr
    |                         |                         |                 |
-- A  pin first: reverse geocoding ---------------------------------------------
    |-- 1 reverseGeocode ---->|                         |                 |
    |                         |-- 2 PointQueryNearAddrByBuffer ---------->|
    |                         |<- nearest door + distance ----------------|
    |                         |  3 parse, sign token    |                 |
    |<- found + token --------|                         |                 |
-- B  typed address: normalization ---------------------------------------------
    |-- 4 normalizeAddress -->|                         |                 |
    |                         |-- 5 QueryAddr exact --->|                 |
    |                         |<- FULL_ADDR + X/Y ------|                 |
    |                         |  6 parse, pin check,    |                 |
    |                         |    sign token           |                 |
    |<- found + token --------|                         |                 |
-- C  save: no government call -------------------------------------------------
    |-- 7 create / update --->|                         |                 |
    |                         |  8 parse into columns,  |                 |
    |                         |    verify token,        |                 |
    |                         |    set status           |                 |
    |<- saved row ------------|                         |                 |
```

- **Lookups** (`normalizeAddress`, `reverseGeocode`) are read-only queries for signed-in callers, 30 a
  minute per user across both. A found address comes back split by the same parser the save uses, with a signed
  **address token**.
- **Saves** never call TGOS. `fullAddress` is split into the columns; a token that matches the line
  exactly marks it confirmed.

## Stored status (`normalizationStatus`)

| Status | When |
|---|---|
| `verified` | The token is valid for this exact `fullAddress`, and TGOS's point is within 500 m of the pin. |
| `pin_mismatch` | The token is valid, but TGOS's point is over 500 m from the pin. |
| `unverified` | No valid token: typed and kept, not found, TGOS down, a bulk import, or edited after the lookup. Also a station or building moved after it was confirmed. |
| null | A pole, or no address. |

## Decisions

- **Exact matches only.** TGOS's fuzzy matching returns the nearest existing number, which in a live test
  was a different house (9999號 → 19號; 5鄰10號 → 3鄰大全街12號).
- **No address is refused for its content.** Only a part too long for its column is. Unparseable text is
  stored as `fullAddress` with the parts empty and `unverified`, so no report is lost. A line over 255
  characters is refused before it is split, since splitting costs the square of the length.
- **The token is a JWT signed with the backend's key**, typed `address`, holding the line and TGOS's
  point and expiring after a day. It cannot pass as a login token. Without it, any caller could claim
  `verified`.
- **Parts keep their units** (`3鄰`, `一段`, `469巷`, `1弄`, `19號`), so display and search need no rules.
  **臺 is stored as TGOS writes it**; a typed 台 county becomes 臺.
- **A 棟/樓/室 typed into the line** fills `buildingSection`/`floor`/`room` when those are empty and is cut
  from the line.
- **Bulk import parses only**: no TGOS call, no batch service. Rows are `unverified`; nothing re-checks
  them later. The station file has one `address` column in place of the five old ones; the match key is
  name + 縣市 + 鄉鎮市區 read from it.
- **A ticket filed in a building map** copies the building's address already split and graded.
- **Read access is unchanged**: a ticket's address is null without `ticket.view_detail`; a station's is
  public. The new columns follow the row.
- **Station search** covers 縣市 鄉鎮市區 路 段 巷 弄 號 樓 室 and the pole id. 村里 and 鄰 are left out so a
  search such as 光復鄉糖廠街 still matches.

## Schema

`secondary_locations`: `city` → `town` and `lane` → `road` (renamed, values kept); `alley` replaced; new
`full_address`, `village`, `neighborhood`, `section`, `lane` (巷), `alley` (弄), `normalization_status`.
`search_text` rebuilt. See `Docs/er-diagram.md`.

## Keys and deployment

The four values live only in `.env` files: `Backend/.env` locally, `Backend/.env.tgos` on the VM (which
`deploy.sh` never rewrites; compose gives it to the backend container alone). See `DEPLOY.md`, "TGOS
address keys". Empty keys make every lookup `unavailable`; saving still works.

| Variable | TGOS service |
|---|---|
| `TGOS_ADDR_APP_ID`, `TGOS_ADDR_API_KEY` | 全國門牌位置比對服務 |
| `TGOS_GEO_APP_ID`, `TGOS_GEO_API_KEY` | 坐標回傳門牌服務 |

Measured from staging: QueryAddr ≈ 110 ms, PointQueryNearAddrByBuffer ≈ 200 ms; throughput tops out near
5 a second, and the quota is 300,000 lookups a month. The client allows 4 requests at once and waits 3 s.

## Known gaps

- Searching 台 does not find 臺.
- 衖 and 衕 stay only in `fullAddress`.
- The admin drawers still prefill from Google, and the site's help-request form still sends the typed line
  as `landmarkNote`, until the frontend follows `frontend-guide.md`.
