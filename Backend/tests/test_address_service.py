"""TGOS lookups and the write-path grading, against canned TGOS replies (no network, dummy keys)."""

import asyncio
import html
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from jose import jwt

from app.core.config import settings
from app.core.security import _decode_access_payload
from app.services import address
from app.services.address import apply_address, lookup_address, reverse_geocode, same_address

# Replies as TGOS sent them during a live run, keys never included.
DOOR = {
    "FULL_ADDR": "花蓮縣光復鄉大進村3鄰糖廠街19號",
    "COUNTY": "花蓮縣",
    "TOWN": "光復鄉",
    "VILLAGE": "大進村",
    "NEIGHBORHOOD": "3鄰",
    "ROAD": "糖廠街",
    "SECTION": "",
    "LANE": "",
    "ALLEY": "",
    "NUMBER": "19號",
    "X": 121.420631,
    "Y": 23.658676,
}
NEAR_DOOR = (23.6587, 121.4206)
TWO_KM_AWAY = (23.6767, 121.4206)
REFUSAL = "認證授權失敗:應用程式IP不正確 : 203.0.113.7"


def _wrapped(body) -> str:
    """TGOS's reply shape: JSON (or a plain-text refusal) escaped inside a SOAP `<string>`."""
    text = body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)
    return f'<?xml version="1.0" encoding="utf-8"?>\n<string xmlns="http://tempuri.org/">{html.escape(text)}</string>'


def _tgos_replies(monkeypatch, reply):
    """Point the TGOS client at a canned reply (or an exception) and record each request."""
    sent = []

    class _Response:
        text = _wrapped(reply) if not isinstance(reply, Exception) else ""

        def raise_for_status(self):
            return None

    class _Client:
        def __init__(self, *_args, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def post(self, url, data=None):
            sent.append({"url": url, "data": data})
            if isinstance(reply, Exception):
                raise reply
            return _Response()

    monkeypatch.setattr("app.services.address.httpx.AsyncClient", _Client)
    return sent


@pytest.fixture
def tgos_keys(monkeypatch):
    """Dummy keys, so the client gets past its unconfigured check."""
    for name in ("TGOS_ADDR_APP_ID", "TGOS_ADDR_API_KEY", "TGOS_GEO_APP_ID", "TGOS_GEO_API_KEY"):
        monkeypatch.setattr(settings, name, f"test-{name.lower()}")


# --- lookups ---


@pytest.mark.asyncio
async def test_an_exact_match_is_found_with_the_official_line_and_a_token(monkeypatch, tgos_keys):
    """A found door comes back official, split, with a token; the floor is never sent."""
    sent = _tgos_replies(monkeypatch, {"AddressList": [DOOR]})

    found = await lookup_address("花蓮縣光復鄉糖廠街19號3樓之1", NEAR_DOOR)

    assert found.status == address.FOUND
    assert (found.parts.full_address, found.parts.village, found.parts.floor) == (
        "花蓮縣光復鄉大進村3鄰糖廠街19號",
        "大進村",
        "3樓之1",
    )
    assert (found.lat, found.lng) == (DOOR["Y"], DOOR["X"])
    assert found.distance_m < 50 and found.pin_mismatch is False
    assert found.token
    # The floor is not sent, and only exact matches are asked for.
    assert sent[0]["url"].endswith("/QueryAddr.asmx/QueryAddr")
    assert sent[0]["data"]["oAddress"] == "花蓮縣光復鄉糖廠街19號"
    assert sent[0]["data"]["oIsOnlyFullMatch"] == "true"


@pytest.mark.asyncio
async def test_a_door_over_500_m_from_the_pin_is_flagged(monkeypatch, tgos_keys):
    """A pin 2 km from the door is reported as a mismatch."""
    _tgos_replies(monkeypatch, {"AddressList": [DOOR]})

    found = await lookup_address("花蓮縣光復鄉糖廠街19號", TWO_KM_AWAY)

    assert found.status == address.FOUND and found.pin_mismatch is True
    assert 1900 < found.distance_m < 2100


@pytest.mark.asyncio
@pytest.mark.parametrize(("rows", "status"), [([], "not_found"), ([DOOR, DOOR], "ambiguous")])
async def test_no_match_or_several_is_not_a_found_address(monkeypatch, tgos_keys, rows, status):
    """Nothing found, or several doors, gives no line and no token."""
    _tgos_replies(monkeypatch, {"Info": [{"OutTotal": str(len(rows))}], "AddressList": rows})

    result = await lookup_address("花蓮縣光復鄉糖廠街9999號")

    assert result.status == status
    assert (result.parts.full_address, result.token) == (None, None)


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", [REFUSAL, httpx.ReadTimeout("slow"), httpx.ConnectError("down")])
async def test_a_refusal_or_failure_is_unavailable(monkeypatch, tgos_keys, reply):
    """A refused key, a timeout or a dead connection all read as unavailable."""
    _tgos_replies(monkeypatch, reply)

    assert (await lookup_address("花蓮縣光復鄉糖廠街19號")).status == address.UNAVAILABLE


@pytest.mark.asyncio
async def test_a_slow_tgos_is_unavailable_within_the_timeout(monkeypatch, tgos_keys):
    """A request that outlasts the timeout, counting the wait for a slot, reads as unavailable."""

    class _SlowClient:
        def __init__(self, *_args, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def post(self, url, data=None):
            await asyncio.sleep(5)

    monkeypatch.setattr("app.services.address.httpx.AsyncClient", _SlowClient)
    monkeypatch.setattr(address, "_TIMEOUT_S", 0.05)

    assert (await lookup_address("花蓮縣光復鄉糖廠街19號")).status == address.UNAVAILABLE


@pytest.mark.asyncio
async def test_without_keys_nothing_is_sent(monkeypatch):
    """With no keys configured, TGOS is never called."""
    sent = _tgos_replies(monkeypatch, {"AddressList": [DOOR]})
    monkeypatch.setattr(settings, "TGOS_ADDR_APP_ID", "")

    assert (await lookup_address("花蓮縣光復鄉糖廠街19號")).status == address.UNAVAILABLE
    assert sent == []


@pytest.mark.asyncio
async def test_an_over_long_address_is_refused_before_any_request(monkeypatch, tgos_keys):
    """An address too long to store is refused before a lookup is spent on it."""
    sent = _tgos_replies(monkeypatch, {"AddressList": [DOOR]})

    with pytest.raises(ValueError, match="at most 255"):
        await lookup_address("花" * 256)
    assert sent == []


@pytest.mark.asyncio
async def test_reverse_geocoding_returns_the_nearest_door(monkeypatch, tgos_keys):
    """A pin is looked up within 500 m and answered with the nearest door."""
    sent = _tgos_replies(monkeypatch, {"AddressList": [{**DOOR, "DIS": 0.04}]})

    found = await reverse_geocode(*NEAR_DOOR)

    assert found.status == address.FOUND
    assert found.parts.full_address == DOOR["FULL_ADDR"] and found.token
    assert sent[0]["url"].endswith("/GeoQueryAddr.asmx/PointQueryNearAddrByBuffer")
    assert (sent[0]["data"]["oPY"], sent[0]["data"]["oPX"], sent[0]["data"]["oBuffer"]) == (*NEAR_DOOR, 500)


@pytest.mark.asyncio
async def test_reverse_geocoding_with_no_door_nearby_is_not_found(monkeypatch, tgos_keys):
    """A pin in the mountains, with no door within 500 m, is not found."""
    _tgos_replies(monkeypatch, {"Info": [{"Total": "0"}], "AddressList": []})

    assert (await reverse_geocode(23.55, 121.25)).status == address.NOT_FOUND


# --- the write path ---


def _token(full_address=DOOR["FULL_ADDR"], lat=DOOR["Y"], lng=DOOR["X"]) -> str:
    return address._sign(full_address, lat, lng)


def test_a_confirmed_address_near_the_pin_is_verified_and_split():
    """A valid token near the pin stores the address verified and split, without the token."""
    stored = apply_address(
        {"location_type": "address", "full_address": DOOR["FULL_ADDR"], "address_token": _token()},
        point=NEAR_DOOR,
    )

    assert "address_token" not in stored
    assert stored["normalization_status"] == "verified"
    assert (stored["town"], stored["village"], stored["neighborhood"], stored["road"], stored["no"]) == (
        "光復鄉",
        "大進村",
        "3鄰",
        "糖廠街",
        "19號",
    )


def test_a_confirmed_address_far_from_the_pin_is_a_mismatch():
    """A valid token far from the pin stores a pin mismatch."""
    stored = apply_address({"full_address": DOOR["FULL_ADDR"], "address_token": _token()}, point=TWO_KM_AWAY)
    assert stored["normalization_status"] == "pin_mismatch"


@pytest.mark.parametrize(
    "sent",
    [
        {"full_address": DOOR["FULL_ADDR"]},  # no token
        {"full_address": "花蓮縣光復鄉大進村3鄰糖廠街21號", "address_token": _token()},  # edited after lookup
        {"full_address": DOOR["FULL_ADDR"], "address_token": _token()[:-4] + "AAAA"},  # tampered
        {"full_address": DOOR["FULL_ADDR"], "address_token": "not-a-token"},
    ],
)
def test_an_address_without_a_matching_token_is_unverified(sent):
    """No token, an edited line or a forged token all store the address unverified."""
    assert apply_address(sent, point=NEAR_DOOR)["normalization_status"] == "unverified"


def test_an_expired_token_is_unverified():
    """A token past its lifetime no longer vouches for the line."""
    claims = {
        "type": "address",
        "addr": DOOR["FULL_ADDR"],
        "lat": DOOR["Y"],
        "lng": DOOR["X"],
        "exp": datetime.now(UTC) - timedelta(seconds=1),
    }
    stale = jwt.encode(claims, settings.JWT_SIGNING_KEY, algorithm=settings.ALGORITHM)

    stored = apply_address({"full_address": DOOR["FULL_ADDR"], "address_token": stale}, point=NEAR_DOOR)

    assert stored["normalization_status"] == "unverified"


def test_a_typed_building_fills_an_empty_building_section():
    """A 棟 in the line fills an empty building section, as a typed floor fills the floor."""
    stored = apply_address({"full_address": "花蓮縣光復鄉糖廠街19號A棟3樓"}, point=None)
    assert (stored["user_input_address"], stored["no"], stored["building_section"], stored["floor"]) == (
        "花蓮縣光復鄉糖廠街19號A棟3樓",
        "19號",
        "A棟",
        "3樓",
    )


def test_a_typed_floor_fills_an_empty_floor_but_never_overrides_one():
    """A 樓 in the line fills an empty floor field but never replaces one."""
    assert apply_address({"full_address": "花蓮縣光復鄉糖廠街19號3樓"}, point=None)["floor"] == "3樓"
    assert (
        apply_address({"full_address": "花蓮縣光復鄉糖廠街19號3樓", "floor": "B1"}, point=None)["floor"]
        == "B1"
    )


def test_a_pole_has_no_address_status():
    """A pole carries no address, so it has no status."""
    stored = apply_address({"location_type": "pole", "pole_id": "光復幹123"}, point=NEAR_DOOR)
    assert stored["normalization_status"] is None and stored["county"] is None


def test_unparseable_text_is_kept_not_refused():
    """Unparseable text is stored as typed and unverified, never refused."""
    stored = apply_address({"full_address": "我家在糖廠附近"}, point=NEAR_DOOR)
    assert (stored["remainder"], stored["road"], stored["normalization_status"]) == (
        "我家在糖廠附近",
        None,
        "unverified",
    )


def test_a_part_too_long_for_its_column_is_refused():
    """A part too long for its column is refused with a readable message."""
    with pytest.raises(ValueError, match="no must be at most 20 characters"):
        apply_address({"full_address": f"花蓮縣光復鄉中正路{'1' * 21}號"}, point=None)


def test_a_line_too_long_to_store_is_refused():
    """A line longer than its column is refused whole."""
    with pytest.raises(ValueError, match="full_address must be at most 255 characters"):
        apply_address({"full_address": "花蓮縣光復鄉糖廠街19號" + "糖" * 250}, point=None)


def test_a_line_padded_with_whitespace_is_checked_by_its_folded_length():
    """Outer whitespace is neither stored nor counted: 250 characters and 10 spaces is still a line."""
    door = "花蓮縣光復鄉糖廠街19號"
    for sent in (door + "糖" * 240 + " " * 10, door + " " * 250, " " * 10 + door + "\n" * 250):
        stored = apply_address({"full_address": sent}, point=None)
        assert stored["user_input_address"] == sent.strip()


def test_a_line_that_widens_past_the_limit_is_refused_as_full_address():
    """Compatibility folding can lengthen a line; the message names `full_address`, never `remainder`."""
    with pytest.raises(ValueError, match="full_address must be at most 255 characters"):
        apply_address({"full_address": "㎞" * 200}, point=None)


def test_a_line_whose_folded_form_fits_but_whose_raw_form_is_too_long_is_refused():
    """Interior whitespace is kept in the raw line, which has its own limit of 500."""
    with pytest.raises(ValueError, match="full_address must be at most 500 characters"):
        apply_address({"full_address": "花蓮縣" + " " * 600 + "光復鄉糖廠街19號"}, point=None)


def test_a_blank_line_stores_nothing():
    """Only whitespace was sent: no line, no parts."""
    stored = apply_address({"full_address": " \n "}, point=None)
    assert stored["user_input_address"] is None and stored["county"] is None


def test_an_address_token_is_not_a_login():
    """An address token cannot pass as an access token."""
    with pytest.raises(Exception, match="401"):
        _decode_access_payload(_token())


def test_the_line_is_kept_as_received_and_full_address_is_never_written():
    """`user_input_address` holds the line as sent, outer whitespace trimmed; the parser gives the rest."""
    sent = "  花蓮縣 光復鄉糖廠街19號後面的鐵皮屋 \n"
    stored = apply_address({"location_type": "address", "full_address": sent}, point=None)
    assert stored["user_input_address"] == "花蓮縣 光復鄉糖廠街19號後面的鐵皮屋"
    assert "full_address" not in stored
    assert (stored["county"], stored["road"], stored["no"], stored["remainder"]) == (
        "花蓮縣",
        "糖廠街",
        "19號",
        "後面的鐵皮屋",
    )


def test_an_address_edit_overwrites_the_line_and_a_missing_line_clears_it():
    """No line, no parts: the same as before, now for the received line too."""
    stored = apply_address({"location_type": "address"}, point=None)
    assert stored["user_input_address"] is None
    assert all(stored[k] is None for k in ("county", "town", "road", "no", "remainder"))


def test_a_sub_alley_is_graded_by_the_line_the_database_will_build():
    """The token covers the rebuilt line, which keeps the 衖 the parts now hold."""
    line = "臺北市中山區民生東路一段1巷2弄3衖4號"
    token = _token(line)
    stored = apply_address({"full_address": line, "address_token": token}, point=NEAR_DOOR)
    assert stored["alley"] == "2弄3衖" and stored["normalization_status"] == "verified"


def test_a_line_that_splits_into_the_stored_parts_is_the_same_address():
    """A unit cut from the line or a blank part changes nothing; another part or a remainder does."""
    stored = SimpleNamespace(**apply_address({"full_address": "花蓮縣光復鄉糖廠街19號3樓"}, point=None))
    assert same_address(stored, apply_address({"full_address": "花蓮縣光復鄉糖廠街19號"}, point=None))
    stored.section = ""
    assert same_address(stored, apply_address({"full_address": "花蓮縣光復鄉糖廠街19號"}, point=None))
    assert not same_address(stored, apply_address({"full_address": "花蓮縣光復鄉糖廠街21號"}, point=None))
    assert not same_address(stored, apply_address({"full_address": "花蓮縣光復鄉糖廠街19號後面"}, point=None))
