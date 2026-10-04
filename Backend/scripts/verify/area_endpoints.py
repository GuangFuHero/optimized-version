"""End-to-end check of every map-area GraphQL endpoint against a live server (ADR-311).

Unit tests build their schema from Base.metadata and mint tokens by hand. This script logs in
real mock accounts over HTTP against a migrated, seeded database, so the migration, the audit
triggers, the auth flow and the GraphQL layer all run for real.

Setup (from Backend/), against a throwaway database:
    uv run alembic upgrade head
    uv run python scripts/seed_rbac.py
    psql … -f scripts/seed_mock_scenarios.sql
    uv run python scripts/bootstrap_admin.py email avol01@mock.test
    uv run uvicorn app.main:app --port 8000
Run:
    uv run python scripts/verify/area_endpoints.py
"""

import asyncio
import hashlib
import os
import sys

import httpx

BASE = os.getenv("API_BASE", "http://localhost:8000")
# The login form sends PBKDF2(password, salt_frontend), as the mock seed's header documents.
PASSWORD = hashlib.pbkdf2_hmac("sha256", b"Mock1234!", b"mockdata12345678", 100000).hex()
HUALIEN = {"minLng": 121.35, "minLat": 23.48, "maxLng": 121.47, "maxLat": 23.76}
YILAN = {"minLng": 121.70, "minLat": 24.60, "maxLng": 121.82, "maxLat": 24.76}
PASS, FAIL = [], []


def check(label, condition, detail=""):
    """Record and print one assertion."""
    (PASS if condition else FAIL).append(label)
    print(f"  {'✓' if condition else '✗'} {label}" + (f"  — {detail}" if detail and not condition else ""))


def square(lng: float, lat: float, size: float = 0.01) -> dict:
    """A small GeoJSON square with its south-west corner at (lng, lat)."""
    ring = [[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]
    return {"type": "Polygon", "coordinates": [ring]}


def box(lng: float, lat: float, size: float = 0.05) -> dict:
    """A BoundsInput around (lng, lat)."""
    return {"minLng": lng - size, "minLat": lat - size, "maxLng": lng + size, "maxLat": lat + size}


def errors(body: dict) -> str:
    """All error messages of a GraphQL response, joined for substring checks."""
    return " | ".join(e["message"] for e in body.get("errors") or [])


async def login(client: httpx.AsyncClient, email: str, role: str, team: str | None = None) -> str:
    """Log in a mock account and return a token acting as `role` (in `team`, when given)."""
    resp = await client.post(f"{BASE}/api/v1/auth/login", data={"username": email, "password": PASSWORD})
    resp.raise_for_status()
    token = resp.json()["access_token"]
    me = (await client.get(f"{BASE}/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})).json()
    target = next(
        i for i in me["identities"] if i["role"] == role and (team is None or i.get("team") == team)
    )
    resp = await client.post(
        f"{BASE}/api/v1/auth/switch-identity",
        json={"role_uuid": target["role_uuid"], "team_uuid": target.get("team_uuid")},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


async def main() -> int:
    """Run every check and return the process exit code."""
    async with httpx.AsyncClient(timeout=30) as client:

        async def gql(query: str, variables: dict | None = None, token: str | None = None) -> dict:
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            resp = await client.post(
                f"{BASE}/graphql", json={"query": query, "variables": variables or {}}, headers=headers
            )
            return resp.json()

        create = "mutation($i: CreateAreaInput!) { createArea(input: $i) { uuid type name note isPublic } }"
        update = """mutation($u: UUID!, $i: UpdateAreaInput!) {
            updateArea(uuid: $u, input: $i) { uuid name note isPublic } }"""
        areas = """query($b: BoundsInput, $p: Boolean! = false) {
            areas(bounds: $b, includePrivate: $p) {
                items { uuid type name note isPublic } pageInfo { totalCount } } }"""

        print("Logging in")
        admin = await login(client, "avol01@mock.test", "super_admin")
        gov = await login(client, "agov01@mock.test", "admin", "光復鄉公所-災防課")
        ngo = await login(client, "ango01@mock.test", "admin", "慈濟基金會-花蓮聯絡處")
        ngo_team = "10000000-0000-4000-8000-000000000001"
        other_team = "10000000-0000-4000-8000-000000000008"

        print("1. createArea, one of each kind (gov team admin)")
        hazard = await gql(
            create,
            {
                "i": {
                    "type": "hazardous_zone",
                    "geometry": square(120.0, 22.0),
                    "name": "落石區",
                    "status": "dangerous",
                    "informationSource": "e2e",
                    "note": "勿進入",
                }
            },
            gov,
        )
        team_zone = await gql(
            create,
            {
                "i": {
                    "type": "team_zone",
                    "geometry": square(120.01, 22.01),
                    "name": "責任區",
                    "teamUuid": ngo_team,
                }
            },
            gov,
        )
        mark = await gql(
            create,
            {"i": {"type": "mark_zone", "geometry": square(120.02, 22.02), "name": "休息區", "note": "有水"}},
            gov,
        )
        far = await gql(
            create,
            {
                "i": {
                    "type": "team_zone",
                    "geometry": square(120.5, 22.5),
                    "name": "遠方",
                    "teamUuid": ngo_team,
                }
            },
            gov,
        )
        for label, body in (
            ("hazard", hazard),
            ("team zone", team_zone),
            ("mark", mark),
            ("far team zone", far),
        ):
            check(f"{label} created", "errors" not in body, errors(body))
        hz, tz, mz, fz = (b["data"]["createArea"] for b in (hazard, team_zone, mark, far))
        check("hazard is public on creation", hz["isPublic"] is True)
        check("team zone and mark start hidden", tz["isPublic"] is False and mz["isPublic"] is False)
        zone = await gql(
            "query($u: UUID!) { teamZone(uuid: $u) { assignedTeams { uuid } } }", {"u": tz["uuid"]}, gov
        )
        check(
            "team zone got its team in the same step",
            [t["uuid"] for t in zone["data"]["teamZone"]["assignedTeams"]] == [ngo_team],
            zone,
        )

        print("2. createArea refusals")
        body = await gql(create, {"i": {"type": "team_zone", "geometry": square(120.0, 22.0)}}, gov)
        check("team zone without a team", "A team zone needs a team" in errors(body), body)
        body = await gql(
            create,
            {
                "i": {
                    "type": "hazardous_zone",
                    "geometry": square(120.0, 22.0),
                    "status": "x",
                    "isPublic": False,
                }
            },
            gov,
        )
        check("hidden hazard", "always public" in errors(body), body)
        body = await gql(
            create, {"i": {"type": "mark_zone", "geometry": square(120.0, 22.0), "status": "x"}}, gov
        )
        check("mark with a status", "Only a hazardous zone has a status" in errors(body), body)
        body = await gql(
            create, {"i": {"type": "mark_zone", "geometry": {"type": "Point", "coordinates": [120, 22]}}}, gov
        )
        check("point geometry", "Polygon or MultiPolygon" in errors(body), body)
        body = await gql(create, {"i": {"type": "mark_zone", "geometry": square(120.0, 22.0)}}, ngo)
        check(
            "NGO team admin is refused", "Only gov teams may draw or assign map areas." in errors(body), body
        )
        body = await gql(create, {"i": {"type": "mark_zone", "geometry": square(120.0, 22.0)}})
        check("guest is refused", bool(errors(body)), body)

        print("3/5. areas(bounds) for a guest, and the visibility switch")
        seen = await gql(areas, {"b": box(120.0, 22.0)})
        uuids = {i["uuid"] for i in seen["data"]["areas"]["items"]}
        check("guest sees the hazard", hz["uuid"] in uuids)
        check("guest does not see hidden mark / team zone", not {tz["uuid"], mz["uuid"]} & uuids)
        for area in (tz, mz):
            body = await gql(update, {"u": area["uuid"], "i": {"isPublic": True}}, gov)
            check(
                f"{area['type']} switched on alone",
                body.get("data", {}).get("updateArea", {}).get("isPublic") is True,
                body,
            )
        seen = await gql(areas, {"b": box(120.0, 22.0)})
        items = {i["uuid"]: i for i in seen["data"]["areas"]["items"]}
        check("guest now sees hazard + team zone + mark", {hz["uuid"], tz["uuid"], mz["uuid"]} <= set(items))
        check("public layer carries the type", items[tz["uuid"]]["type"] == "team_zone")
        check("area outside the box is left out", fz["uuid"] not in items)
        body = await gql("query { areas { items { uuid assignedTeams { uuid } } } }")
        check("AreaType has no team field", "Cannot query field" in errors(body), body)
        body = await gql(update, {"u": hz["uuid"], "i": {"isPublic": False}}, gov)
        check("hazard cannot be switched off", "always public" in errors(body), body)
        body = await gql(
            update,
            {
                "u": mz["uuid"],
                "i": {"name": "休息站", "note": "有水有電", "geometry": square(120.02, 22.02, 0.02)},
            },
            gov,
        )
        check(
            "name / note / geometry edit persisted",
            body.get("data", {}).get("updateArea", {}).get("name") == "休息站",
            body,
        )

        print("4. areas(includePrivate)")
        body = await gql(areas, {"b": box(120.0, 22.0), "p": True})
        check("guest is refused", "Permission Denied." in errors(body), body)
        await gql(update, {"u": tz["uuid"], "i": {"isPublic": False}}, gov)
        body = await gql(areas, {"b": box(120.0, 22.0), "p": True}, gov)
        check(
            "gov sees hidden areas too",
            tz["uuid"] in {i["uuid"] for i in body["data"]["areas"]["items"]},
            body,
        )

        print("6. hazardousZones / hazardousZone (guest)")
        body = await gql(
            "query($b: BoundsInput) { hazardousZones(bounds: $b) { items { uuid name note status } } }",
            {"b": box(120.0, 22.0)},
        )
        listed = {i["uuid"]: i for i in body["data"]["hazardousZones"]["items"]}
        check(
            "hazard listed with name / note / status",
            listed.get(hz["uuid"], {})
            == {"uuid": hz["uuid"], "name": "落石區", "note": "勿進入", "status": "dangerous"},
            body,
        )
        body = await gql(
            "query($u: UUID!) { hazardousZone(uuid: $u) { informationSource } }", {"u": hz["uuid"]}
        )
        check("hazard detail", body["data"]["hazardousZone"]["informationSource"] == "e2e", body)

        print("7. teamZones / teamZone / zonesByTeam")
        body = await gql("query { teamZones { items { uuid } } }")
        check("guest is refused", "Permission Denied." in errors(body), body)
        body = await gql(
            "query($b: BoundsInput) { teamZones(bounds: $b) { items { uuid isPublic note } } }",
            {"b": box(120.0, 22.0)},
            gov,
        )
        listed = {i["uuid"] for i in body["data"]["teamZones"]["items"]}
        check(
            "viewport keeps the inside zone, drops the far one",
            tz["uuid"] in listed and fz["uuid"] not in listed,
            body,
        )
        body = await gql(
            "query($t: UUID!) { zonesByTeam(teamUuid: $t) { items { uuid } } }", {"t": ngo_team}, gov
        )
        listed = {i["uuid"] for i in body["data"]["zonesByTeam"]["items"]}
        check("zonesByTeam lists both zones", {tz["uuid"], fz["uuid"]} <= listed, body)

        print("8. assignZoneToTeam / removeZoneFromTeam")
        link = (
            "mutation($i: ZoneTeamAssignmentInput!) { assignZoneToTeam(input: $i) { teamUuid assignedBy } }"
        )
        unlink = "mutation($i: ZoneTeamAssignmentInput!) { removeZoneFromTeam(input: $i) }"
        body = await gql(link, {"i": {"zoneUuid": tz["uuid"], "teamUuid": other_team}}, gov)
        check(
            "second team assigned",
            body.get("data", {}).get("assignZoneToTeam", {}).get("teamUuid") == other_team,
            body,
        )
        body = await gql(unlink, {"i": {"zoneUuid": tz["uuid"], "teamUuid": other_team}}, gov)
        check("second team removed", body.get("data", {}).get("removeZoneFromTeam") is True, body)
        body = await gql(unlink, {"i": {"zoneUuid": tz["uuid"], "teamUuid": ngo_team}}, gov)
        check("last team cannot be removed", "at least one team" in errors(body), body)
        body = await gql(link, {"i": {"zoneUuid": mz["uuid"], "teamUuid": ngo_team}}, gov)
        check("a mark cannot be assigned", "Team zone not found" in errors(body), body)

        print("9. promoteMarkZone")
        promote = """mutation($u: UUID!, $i: PromoteMarkZoneInput!) {
            promoteMarkZone(uuid: $u, input: $i) { uuid propertyName name note status } }"""
        body = await gql(promote, {"u": mz["uuid"], "i": {"status": "dangerous"}}, gov)
        promoted = body.get("data", {}).get("promoteMarkZone") or {}
        check(
            "mark promoted, keeping uuid / name / note",
            promoted
            == {
                "uuid": mz["uuid"],
                "propertyName": "hazardous_zone",
                "name": "休息站",
                "note": "有水有電",
                "status": "dangerous",
            },
            body,
        )
        seen = await gql(areas, {"b": box(120.0, 22.0)})
        items = {i["uuid"]: i for i in seen["data"]["areas"]["items"]}
        check(
            "promoted zone is public and a hazard", items.get(mz["uuid"], {}).get("type") == "hazardous_zone"
        )
        for label, area in (("hazard", hz), ("team zone", tz)):
            body = await gql(promote, {"u": area["uuid"], "i": {"status": "x"}}, gov)
            check(f"{label} cannot be promoted", "Only a mark zone can be promoted" in errors(body), body)

        print("10. zone scope comes only from team zones")
        tickets = "query($b: BoundsInput) { tickets(bounds: $b, limit: 100) { items { contactName } } }"

        async def names(bounds: dict) -> list[str]:
            body = await gql(tickets, {"b": bounds}, ngo)
            return [i["contactName"] for i in body["data"]["tickets"]["items"] if i["contactName"]]

        inside = await names(HUALIEN)
        check(
            "NGO admin sees raw contact names inside its team zone",
            any("◯" not in n for n in inside),
            inside[:3],
        )
        cover = await gql(
            create,
            {
                "i": {
                    "type": "mark_zone",
                    "name": "覆蓋宜蘭",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [121.69, 24.59],
                                [121.83, 24.59],
                                [121.83, 24.77],
                                [121.69, 24.77],
                                [121.69, 24.59],
                            ]
                        ],
                    },
                }
            },
            admin,
        )
        check("super admin draws a mark over the other team's area", "errors" not in cover, cover)
        outside = await names(YILAN)
        check(
            "a mark over tickets grants no access",
            outside and all("◯" in n or n.endswith(".") for n in outside),
            outside[:3],
        )

        print("11. deleteArea, each kind")
        for label, area in (
            ("hazard", hz),
            ("team zone", tz),
            ("promoted mark", mz),
            ("far zone", fz),
            ("cover mark", cover["data"]["createArea"]),
        ):
            body = await gql("mutation($u: UUID!) { deleteArea(uuid: $u) }", {"u": area["uuid"]}, admin)
            check(f"{label} deleted", body.get("data", {}).get("deleteArea") is True, body)
        seen = await gql(areas, {"b": box(120.0, 22.0)})
        check(
            "deleted areas leave the public layer",
            not {hz["uuid"], tz["uuid"], mz["uuid"]} & {i["uuid"] for i in seen["data"]["areas"]["items"]},
        )
        body = await gql("query($u: UUID!) { teamZone(uuid: $u) { uuid } }", {"u": tz["uuid"]}, gov)
        check("deleted team zone no longer resolves", body["data"]["teamZone"] is None, body)

        print("12. removed names")
        for query in (
            "query { closureAreas { items { uuid } } }",
            "query { workZones { items { uuid } } }",
            "mutation { createClosureArea(input: {}) { uuid } }",
            "mutation { createWorkZone(input: {}) { uuid } }",
        ):
            body = await gql(query, token=admin)
            check(query.split("{")[1].split("(")[0].strip(), "Cannot query field" in errors(body), body)

        print("13. unchanged neighbours")
        body = await gql(
            "query($b: BoundsInput) { stations(bounds: $b) { pageInfo { totalCount } } }", {"b": HUALIEN}
        )
        check("stations(bounds) for a guest", body["data"]["stations"]["pageInfo"]["totalCount"] > 0, body)
        body = await gql(
            "query($b: BoundsInput) { tickets(bounds: $b) { pageInfo { totalCount } } }", {"b": HUALIEN}
        )
        check("tickets(bounds) for a guest", body["data"]["tickets"]["pageInfo"]["totalCount"] > 0, body)

    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    for label in FAIL:
        print(f"  ✗ {label}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
