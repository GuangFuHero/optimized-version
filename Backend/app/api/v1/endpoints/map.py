from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response
from app.schemas.map import AttributionResponse
from app.services.tile_proxy import (
    fetch_tile,
    get_source_config,
    get_attribution,
)

router = APIRouter()

VALID_SOURCES = {
    "satellite": {"nasa_gibs", "eox", "nlsc", "sinica"},
    "road": {"osm", "carto"},
}


def _validate(type_: str, source: str, z: int) -> None:
    allowed = VALID_SOURCES.get(type_)
    if allowed is None or source not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type/source combination: {type_}/{source}",
        )
    if not (0 <= z <= 19):
        raise HTTPException(
            status_code=400,
            detail=f"Zoom level z={z} is out of range (0-19)",
        )


@router.get("/tile/{type_}/{source}/{z}/{x}/{y}")
async def get_tile(
    type_: str,
    source: str,
    z: int,
    x: int,
    y: int,
    request: Request,
    layer: Optional[str] = None,
):
    """
    Proxy a map tile from an upstream source with 7-day Redis caching.

    **type** — `satellite` or `road`

    **source** — one of:
    - satellite: `nasa_gibs` (image/jpeg), `eox` (image/jpeg), `nlsc` (image/png), `sinica` (image/png)
    - road: `osm` (image/png), `carto` (image/png)

    **z/x/y** — Standard XYZ slippy map tile coordinates (z: 0–19)

    **layer** — Required only for `source=sinica`. Pass the Sinica layer name
    (e.g. `EARTH`, `TAIWAN_MOSAIC`). See https://gis.sinica.edu.tw/worldmap/
    for available layers. Ignored for all other sources.

    Returns the raw tile image bytes with the upstream Content-Type header.
    On upstream error, returns a 1×1 transparent PNG.
    """
    _validate(type_, source, z)

    if source == "sinica" and not layer:
        raise HTTPException(
            status_code=400,
            detail="layer is required for source=sinica",
        )

    query_params = {}
    if layer:
        query_params["layer"] = layer

    redis_client = request.app.state.redis
    tile_bytes, content_type = await fetch_tile(
        redis=redis_client,
        source=source,
        type_=type_,
        z=z,
        x=x,
        y=y,
        query_params=query_params,
    )

    return Response(content=tile_bytes, media_type=content_type)


@router.get("/attribution/{type_}/{source}", response_model=AttributionResponse)
async def get_attribution_info(type_: str, source: str):
    """
    Return attribution metadata for a given tile source.

    The frontend should display `attribution_text` on the map.
    When `requires_logo` is true, also render the logo from `logo_url`.
    """
    _validate(type_, source, z=0)  # z=0 is always valid, just checking type/source
    attr = get_attribution(type_, source)
    if attr is None:
        raise HTTPException(status_code=400, detail=f"No attribution for {type_}/{source}")
    return attr
