import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { reverseGeocodeResponse } from '../map/reverse-geocode';

const GOOGLE_GEOCODING_ENDPOINT =
  'https://maps.googleapis.com/maps/api/geocode/json';

const addressComponent = z.object({
  long_name: z.string(),
  short_name: z.string(),
  types: z.array(z.string()),
});
const geocodeResult = z.object({
  formatted_address: z.string(),
  address_components: z.array(addressComponent),
  types: z.array(z.string()),
});
const geocodeResponse = z.object({
  error_message: z.string().optional(),
  results: z.array(geocodeResult).optional(),
  status: z.string(),
});
const coordinates = z.object({
  lat: z
    .string()
    .trim()
    .min(1)
    .transform(Number)
    .pipe(z.number().min(-90).max(90)),
  lng: z
    .string()
    .trim()
    .min(1)
    .transform(Number)
    .pipe(z.number().min(-180).max(180)),
});

type GoogleGeocodeAddressComponent = z.infer<typeof addressComponent>;
type GoogleGeocodeResult = z.infer<typeof geocodeResult>;
type ParsedAddressParts = z.infer<typeof reverseGeocodeResponse>;

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

export async function reverseGeocode(request: NextRequest) {
  const parsed = coordinates.safeParse({
    lat: request.nextUrl.searchParams.get('lat'),
    lng: request.nextUrl.searchParams.get('lng'),
  });

  if (!parsed.success) {
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
  geocodingUrl.searchParams.set(
    'latlng',
    `${parsed.data.lat},${parsed.data.lng}`,
  );
  geocodingUrl.searchParams.set('language', 'zh-TW');
  geocodingUrl.searchParams.set('region', 'tw');
  geocodingUrl.searchParams.set('key', apiKey);

  try {
    const response = await fetch(geocodingUrl, {
      cache: 'no-store',
    });
    const data = geocodeResponse.parse(await response.json());

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
