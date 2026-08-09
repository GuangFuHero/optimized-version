import { gql } from 'urql';

// ── Types ────────────────────────────────────────────────────

export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface StationItem {
  uuid: string;
  propertyName: string;
  geometry: GeoJSONPoint | null;
  type: string | null;
  name: string | null;
  description: string | null;
  opHour: string | null;
  level: number;
  source: string | null;
  visibility: string | null;
  verificationStatus: string | null;
  isTemporary: boolean;
  isOfficial: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface GetStationsData {
  stations: {
    items: StationItem[];
    pageInfo: {
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
}

export interface GetStationsVariables {
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  stationType?: string;
  skip?: number;
  limit?: number;
}

// ── Document ─────────────────────────────────────────────────

export const GET_STATIONS = gql`
  query GetStations(
    $bounds: BoundsInput
    $stationType: String
    $skip: Int = 0
    $limit: Int = 200
  ) {
    stations(
      bounds: $bounds
      stationType: $stationType
      skip: $skip
      limit: $limit
    ) {
      items {
        uuid
        propertyName
        geometry
        type
        name
        description
        opHour
        level
        source
        visibility
        verificationStatus
        isTemporary
        isOfficial
        createdAt
        updatedAt
      }
      pageInfo {
        totalCount
        hasNextPage
        hasPreviousPage
      }
    }
  }
`;
