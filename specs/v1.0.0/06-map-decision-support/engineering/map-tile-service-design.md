# Map Tile Service Design

**Date:** 2026-04-08  
**Status:** Approved  
**Feature:** Satellite & Road Map Tile Proxy with Redis Cache

---

## Overview

A public tile proxy service that fetches map tiles from upstream sources (satellite and road), caches them in Redis for 7 days, and returns them to the frontend. An attribution endpoint returns structured metadata so the frontend can render correct attribution per source.

---

## Routes

```
GET /api/v1/map/tile/{type}/{source}/{z}/{x}/{y}?layer=<layer>
GET /api/v1/map/attribution/{type}/{source}
```

Both endpoints are **public** (no JWT required).

---

## Parameters

### Path Parameters

| Param | Type | Values | Notes |
|---|---|---|---|
| `type` | path | `satellite`, `road` | Validated via enum |
| `source` | path | `nasa_gibs`, `eox`, `nlsc`, `sinica`, `osm`, `carto` | Must be valid for the given `type` |
| `z` | path | int 0–19 | Standard XYZ zoom level |
| `x` | path | int | Tile column |
| `y` | path | int | Tile row |

### Query Parameters

| Param | Type | Required | Notes |
|---|---|---|---|
| `layer` | string | Required when `source=sinica`, ignored otherwise | Sinica layer name passed directly to upstream URL (e.g. `EARTH`, `TAIWAN_MOSAIC`). See [Sinica tileserver](https://gis.sinica.edu.tw/worldmap/) for available layer names. |

**Valid type/source combinations:**

| type | allowed sources |
|---|---|
| `satellite` | `nasa_gibs`, `eox`, `nlsc`, `sinica` |
| `road` | `osm`, `carto` |

**Validation rules:**
- Invalid `type`/`source` combo → HTTP 400
- `z` outside 0–19 → HTTP 400
- `source=sinica` with no `layer` query param → HTTP 400 with message: `"layer is required for source=sinica"`

---

## Upstream Source Registry

Static config mapping `(type, source)` to upstream URL template:

| source | URL template | Image format | Special headers |
|---|---|---|---|
| `nasa_gibs` | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` | `image/jpeg` | none |
| `eox` | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg` | `image/jpeg` | none |
| `nlsc` | `https://wmts.nlsc.gov.tw/wmts/PHOTO_MIX/default/EPSG:3857/{z}/{y}/{x}` | `image/png` | `Referer: https://maps.nlsc.gov.tw/` |
| `sinica` | `https://gis.sinica.edu.tw/tileserver/file-exists.php?img={layer}/{z}/{x}/{y}` | `image/png` | none |
| `osm` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | `image/png` | none |
| `carto` | `https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` | `image/png` | none |

> Note: `nlsc` requires a `Referer` header — set this in `tile_proxy.py` per-source config, not in the route handler.  
> Note: `sinica` ToS is unconfirmed — confirm before production use.  
> Note: `{layer}` in the `sinica` URL template is substituted from the `?layer=` query param at request time.

---

## Tile Endpoint Behaviour

### Cache Key

All sources use a single unified key format:

```
tile:{source}:{type}:{sorted_params}:{z}:{x}:{y}
```

`{sorted_params}` is a comma-separated string of `key=value` pairs sorted alphabetically by key. When no query params are provided, `{sorted_params}` is `_`.

Examples:
```
tile:nasa_gibs:satellite:_:10:123:456
tile:eox:satellite:_:10:123:456
tile:sinica:satellite:layer=EARTH:10:123:456
tile:sinica:satellite:layer=EARTH,style=default:10:123:456
```

Sorting params before building the key ensures `layer=EARTH,style=default` and `style=default,layer=EARTH` resolve to the same cache entry.

### Cache Hit
1. Build Redis key
2. Read hash fields `data` (bytes) and `ct` (Content-Type string) from Redis
3. Return bytes with correct `Content-Type` header

### Cache Miss
1. Look up upstream URL template, substitute `{z}`, `{x}`, `{y}` (and `{layer}` for sinica)
2. Fetch upstream with `httpx` (async), timeout 10s, include any required headers
3. On success: store in Redis hash, set TTL 604800s (7 days), return tile
4. On error (timeout, 4xx, 5xx): return **blank tile** (1×1 transparent PNG)

### Redis Down
- Bypass cache entirely, fetch upstream directly
- Degrade gracefully — do not raise 500

### Blank Tile
A hardcoded 1×1 transparent PNG constant (67 bytes) in `tile_proxy.py`. No filesystem read required.

---

## Redis Cache Structure

Each tile is stored as a Redis hash using the unified key format:

```
HSET tile:{source}:{type}:{sorted_params}:{z}:{x}:{y}  data <bytes>  ct "image/jpeg"
EXPIRE tile:{source}:{type}:{sorted_params}:{z}:{x}:{y}  604800
```

`{sorted_params}` is `_` when no query params are provided.

TTL: **7 days (604800 seconds)**  
Eviction policy: `allkeys-lru` (least-recently-used tiles evicted when memory cap reached)

---

## Attribution Endpoint

Returns structured metadata for a given `type`/`source` combination. Used by the frontend to render map attribution correctly.

### Response Schema

```json
{
  "source": "string",
  "type": "string",
  "name": "string",
  "license": "string",
  "attribution_text": "string",
  "attribution_url": "string",
  "image_format": "string",
  "commercial_use": true,
  "requires_logo": false,
  "logo_url": "string | null",
  "notes": "string | null"
}
```

`logo_url` is `null` when `requires_logo` is `false`.

### Attribution Data per Source

| source | name | attribution_text | license | commercial_use | requires_logo | logo_url |
|---|---|---|---|---|---|---|
| `nasa_gibs` | NASA GIBS | `Imagery provided by NASA's Global Imagery Browse Services (GIBS), part of NASA's ESDIS` | US Gov Open Data | true | false | null |
| `eox` | Sentinel-2 Cloudless by EOX | `Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)` | CC BY-NC-SA 4.0 | false | false | null |
| `nlsc` | 內政部國土測繪中心 | `© 內政部國土測繪中心` | Taiwan Gov | false | false | null |
| `sinica` | 中央研究院 | `© 中央研究院` | Academic (unconfirmed) | false | false | null |
| `osm` | OpenStreetMap | `© OpenStreetMap contributors` | ODbL | true | false | null |
| `carto` | CARTO | `© OpenStreetMap contributors, © CARTO` | OSM ODbL + CARTO ToS | true | false | null |

---

## File Structure

```
app/
├── api/v1/
│   ├── api.py                  # register map router
│   └── endpoints/
│       └── map.py              # tile + attribution route handlers
├── core/
│   └── config.py               # add REDIS_URL setting
├── services/
│   └── tile_proxy.py           # upstream fetch + Redis cache logic + blank tile constant
└── schemas/
    └── map.py                  # AttributionResponse Pydantic model
```

---

## Docker Compose

Add Redis service to `docker-compose.yml`:

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
  ports:
    - "6379:6379"
```

Add `REDIS_URL` to the app service environment:

```yaml
environment:
  REDIS_URL: redis://redis:6379
```

---

## Error Handling Summary

| Scenario | Response |
|---|---|
| Invalid `type`/`source` combo | HTTP 400 |
| `z` outside 0–19 | HTTP 400 |
| `source=sinica` without `?layer=` | HTTP 400: `"layer is required for source=sinica"` |
| Upstream timeout / 5xx | 1×1 transparent PNG, `Content-Type: image/png` |
| Upstream 404 | 1×1 transparent PNG, `Content-Type: image/png` |
| Redis unavailable | Bypass cache, fetch upstream directly |

---

## Testing

- **Unit:** `tile_proxy.py` with mocked Redis + mocked `httpx` — test cache hit, cache miss, upstream error → blank tile, Redis down → passthrough, sinica layer substitution in URL and cache key
- **Integration:** endpoint tests for valid tile request, sinica with/without `?layer=`, invalid params → 400, upstream error → blank PNG response, attribution response shape
