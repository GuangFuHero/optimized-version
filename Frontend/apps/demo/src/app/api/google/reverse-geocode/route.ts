import { NextResponse, type NextRequest } from 'next/server';

const GOOGLE_GEOCODING_ENDPOINT =
  'https://maps.googleapis.com/maps/api/geocode/json';

interface GoogleGeocodeAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  formatted_address: string;
  address_components: GoogleGeocodeAddressComponent[];
  types: string[];
}

interface GoogleGeocodeResponse {
  error_message?: string;
  results?: GoogleGeocodeResult[];
  status?: string;
}

interface ParsedAddressParts {
  address: string;
  county: string;
  city: string;
  lane: string;
  alley: string;
  no: string;
  floor: string;
  room: string;
}

function normalizeAddress(value: string | undefined) {
  return (value ?? '').replace(/^\d{3,6}\s*/, '').trim();
}

function findAddressComponent(
  components: readonly GoogleGeocodeAddressComponent[],
  types: readonly string[],
) {
  return (
    components.find((component) =>
      types.every((type) => component.types.includes(type)),
    )?.long_name ?? ''
  );
}

function extractAddressPartsFromText(input: string): ParsedAddressParts {
  const address = normalizeAddress(input);
  const countyMatch = address.match(/^(.+?[縣市])/);
  const afterCounty = countyMatch
    ? address.slice(countyMatch[0].length)
    : address;
  const cityMatch = afterCounty.match(/^(.+?(?:區|鄉|鎮|市))/);

  return {
    address,
    county: countyMatch?.[1] ?? '',
    city: cityMatch?.[1] ?? '',
    lane: address.match(/(\d+(?:之\d+)?巷)/)?.[1] ?? '',
    alley: address.match(/(\d+(?:之\d+)?弄)/)?.[1] ?? '',
    no: address.match(/(\d+(?:-\d+)?(?:之\d+)?號)/)?.[1] ?? '',
    floor: address.match(/(\d+(?:之\d+)?樓)/)?.[1] ?? '',
    room: address.match(/(\d+(?:之\d+)?室)/)?.[1] ?? '',
  };
}

function selectPrimaryResult(results: readonly GoogleGeocodeResult[]) {
  return (
    results.find((result) => result.types.includes('street_address')) ??
    results.find((result) => result.types.includes('premise')) ??
    results.find((result) => result.types.includes('route')) ??
    results[0] ??
    null
  );
}

function buildResponsePayload(
  result: GoogleGeocodeResult | null,
): ParsedAddressParts {
  if (!result) {
    return {
      address: '',
      county: '',
      city: '',
      lane: '',
      alley: '',
      no: '',
      floor: '',
      room: '',
    };
  }

  const parsed = extractAddressPartsFromText(result.formatted_address);
  const components = result.address_components;
  const county =
    findAddressComponent(components, ['administrative_area_level_1']) ||
    parsed.county;
  const city =
    findAddressComponent(components, ['administrative_area_level_3']) ||
    findAddressComponent(components, ['locality']) ||
    findAddressComponent(components, ['sublocality_level_1']) ||
    findAddressComponent(components, ['administrative_area_level_2']) ||
    parsed.city;

  return {
    address: parsed.address,
    county,
    city: city === county ? parsed.city : city,
    lane: parsed.lane,
    alley: parsed.alley,
    no: parsed.no,
    floor: parsed.floor,
    room: parsed.room,
  };
}

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get('lat'));
  const lng = Number(request.nextUrl.searchParams.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      {
        error: 'Invalid lat/lng query parameters.',
      },
      { status: 400 },
    );
  }

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'Google Maps API key is not configured.',
      },
      { status: 500 },
    );
  }

  const geocodingUrl = new URL(GOOGLE_GEOCODING_ENDPOINT);
  geocodingUrl.searchParams.set('latlng', `${lat},${lng}`);
  geocodingUrl.searchParams.set('language', 'zh-TW');
  geocodingUrl.searchParams.set('region', 'tw');
  geocodingUrl.searchParams.set('key', apiKey);

  try {
    const response = await fetch(geocodingUrl, {
      cache: 'no-store',
    });
    const data = (await response.json()) as GoogleGeocodeResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data.error_message || 'Google Geocoding API request failed.',
        },
        { status: 502 },
      );
    }

    if (data.status === 'ZERO_RESULTS') {
      return NextResponse.json(buildResponsePayload(null), {
        headers: {
          'cache-control': 'no-store',
        },
      });
    }

    if (data.status !== 'OK') {
      return NextResponse.json(
        {
          error:
            data.error_message ||
            `Google Geocoding API returned ${data.status}.`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      buildResponsePayload(selectPrimaryResult(data.results ?? [])),
      {
        headers: {
          'cache-control': 'no-store',
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error: 'Reverse geocoding request failed.',
      },
      { status: 502 },
    );
  }
}
