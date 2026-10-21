# Frontend guide: looking up and saving addresses

The backend checks addresses against TGOS, the government address service, but only when the frontend
asks it to, **before** saving. A save itself never calls TGOS: it splits the line it is given into
columns and records whether a lookup confirmed it.

```
Frontend                  Backend (GraphQL)         TGOS QueryAddr   TGOS GeoQueryAddr
    |                         |                         |                 |
-- A  pin first: reverse geocoding ---------------------------------------------
    |-- 1 reverseGeocode ---->|                         |                 |
    |                         |-- 2 PointQueryNearAddrByBuffer ---------->|
    |                         |<- nearest door + distance ----------------|
    |<- found + token --------|                         |                 |
-- B  typed address: normalization ---------------------------------------------
    |-- 4 normalizeAddress -->|                         |                 |
    |                         |-- 5 QueryAddr exact --->|                 |
    |                         |<- FULL_ADDR + X/Y ------|                 |
    |<- found + token --------|                         |                 |
-- C  save: no government call -------------------------------------------------
    |-- 7 create / update --->|                         |                 |
    |<- saved row ------------|                         |                 |
```

## 1. When to call

| User action | Call | Notes |
|---|---|---|
| Drops or moves the pin | `reverseGeocode(lat, lng)` | Once per drop, not while dragging. Prefill the address field. |
| Finishes typing an address | `normalizeAddress(address, lat, lng)` | On blur or a 「確認地址」 button, **never on every keystroke**. Pass the pin if there is one. |
| Saves | create / update mutation | Send `fullAddress` and `addressToken` from the last lookup. |

Each signed-in user gets 30 lookups a minute, and the whole platform shares 300,000 a month. Guests
cannot look up (they cannot file either).

## 2. The two queries

```graphql
fragment AddressLookupFields on AddressLookupType {
  status fullAddress county town village neighborhood road section lane alley no
  floor room lat lng distanceM pinMismatch addressToken
}

query NormalizeAddress($address: String!, $lat: Float, $lng: Float) {
  normalizeAddress(address: $address, lat: $lat, lng: $lng) { ...AddressLookupFields }
}

query ReverseGeocode($lat: Float!, $lng: Float!) {
  reverseGeocode(lat: $lat, lng: $lng) { ...AddressLookupFields }
}
```

Example: `normalizeAddress(address: "花蓮縣光復鄉糖廠街19號3樓", lat: 23.6587, lng: 121.4206)` returns

```json
{
  "status": "found",
  "fullAddress": "花蓮縣光復鄉大進村3鄰糖廠街19號",
  "county": "花蓮縣", "town": "光復鄉", "village": "大進村", "neighborhood": "3鄰",
  "road": "糖廠街", "section": null, "lane": null, "alley": null, "no": "19號",
  "floor": "3樓", "room": null,
  "lat": 23.658676, "lng": 121.420631, "distanceM": 4.1, "pinMismatch": false,
  "addressToken": "eyJhbGciOi…"
}
```

`floor` / `room` are what the user typed after the 號, split off for the floor and room fields. TGOS
itself knows nothing about floors.

## 3. What to show for each `status`

| `status` | Meaning | Suggested UI |
|---|---|---|
| `found` | TGOS has this exact 門牌. | Show `fullAddress` as the confirmed address; keep `addressToken`. Fill floor/room if empty. If `pinMismatch`, warn 「地址與地圖標記相距 N 公尺」 and let the user move the pin or fix the address. If the user has no pin yet, offer to place it at `lat`/`lng`. |
| `not_found` | No such 門牌 (typo, a new building, or no 門牌 near the pin). | Keep what was typed; say 「查無此門牌，仍可送出」. With a pin, offer `reverseGeocode` as a suggestion. |
| `ambiguous` | Several 門牌 match (usually the 鄉鎮市區 is missing). | Ask for the 鄉鎮市區 and look up again. |
| `unavailable` | TGOS did not answer (down, slow, or out of quota). | Say nothing alarming; let the user save as typed. |

Never block a save on a lookup: a report with an unconfirmed address is still a report.

## 4. What to send on save

`SecondaryLocationInput` takes the address as one line:

```graphql
secondaryLocation: {
  fullAddress: "花蓮縣光復鄉大進村3鄰糖廠街19號"  # exactly as the lookup returned it
  addressToken: "eyJhbGciOi…"                      # from the same lookup; omit if there was none
  floor: "3樓"
  room: "302"
  buildingSection: "A棟"
  landmarkNote: "廟旁邊，紅色鐵門"                  # a hint for the way in, no longer the address
}
```

- **Edited after the lookup?** Look up again. A token only counts for the exact line it came with;
  otherwise the address saves as `unverified`.
- **No lookup, or not found?** Send the typed line as `fullAddress` without a token. It is still split
  into parts as far as it goes.
- **Floor and room** go in their own fields. A 樓/室 left at the end of `fullAddress` is moved there
  only if those fields are empty.
- The same input is used by `createTicket`, `updateTicket`, `createHelpRequest`, `createStation` and
  `createBuildingMap`. On `updateTicket` the whole address is replaced, so send every field again.

## 5. Reading it back

`secondaryLocation` returns `fullAddress`, the parts (`county town village neighborhood road section
lane alley no`), `floor`, `room`, and `normalizationStatus`:

| `normalizationStatus` | Badge for admins |
|---|---|
| `verified` | 已確認門牌 |
| `pin_mismatch` | 地址與標記不符 |
| `unverified` | 未確認 |
| null | none (a pole, or no address) |

Display the street as `fullAddress`, then floor and room: `formatTicketAddress` in
`libs/modules/src/ticket/address.ts` already does this. Every part keeps its unit (`3鄰`, `一段`,
`469巷`, `1弄`, `19號`), so parts can be joined without adding characters. A ticket's address is null
for viewers without `ticket.view_detail`.

## 6. Errors

| Error message | Cause |
|---|---|
| `401: Could not validate credentials` | Not signed in. |
| `Too many address lookups; try again in a minute` | Over 30 lookups in a minute. |
| `lat and lng must be provided together` | Only one of the two was sent. |
| `Invalid coordinates` | Outside -90..90 / -180..180. |
| `address must be at most 255 characters` | The typed line is too long. |
| `<part> must be at most N characters` (on save) | A part is too long for its column, e.g. a 20-character 號. |

## 7. Changes needed in existing screens

1. **Site help request** (`ticket/help-request/help-request-form.ts`): call `normalizeAddress` with the
   pin when the address field loses focus, then send the line as `fullAddress` with its `addressToken`
   instead of putting it in `landmarkNote`.
2. **Admin create drawers** (`station-create-drawer.tsx`, `ticket-create-drawer.tsx`): replace the call
   to `/api/google/reverse-geocode` with `reverseGeocode`, show `fullAddress`, and send it with the token.
   The drawers' separate county / city / lane / alley fields can become one address field plus floor
   and room; the parts come back from the backend already split.
3. **Station bulk files**: the five address columns are now one `address` column; `floor` and `room`
   stay.
