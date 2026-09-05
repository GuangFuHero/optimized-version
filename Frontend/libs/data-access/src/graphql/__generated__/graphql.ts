/* eslint-disable */
import { Geometry } from 'geojson';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** Date with time (isoformat) */
  DateTime: { input: any; output: any; }
  /** GeoJSON geometry object (RFC 7946) */
  GeoJSON: { input: Geometry; output: Geometry; }
  UUID: { input: string; output: string; }
};

export type AddressSuggestionType = {
  __typename?: 'AddressSuggestionType';
  alley?: Maybe<Scalars['String']['output']>;
  county?: Maybe<Scalars['String']['output']>;
  /** Metres from the supplied coordinate */
  distanceM?: Maybe<Scalars['Float']['output']>;
  formatted: Scalars['String']['output'];
  lane?: Maybe<Scalars['String']['output']>;
  no?: Maybe<Scalars['String']['output']>;
  road?: Maybe<Scalars['String']['output']>;
  section?: Maybe<Scalars['String']['output']>;
  town?: Maybe<Scalars['String']['output']>;
  village?: Maybe<Scalars['String']['output']>;
};

export const AnnouncementFilter = {
  Active: 'ACTIVE',
  All: 'ALL'
} as const;

export type AnnouncementFilter = typeof AnnouncementFilter[keyof typeof AnnouncementFilter];
export const AnnouncementMoveDirection = {
  Down: 'DOWN',
  Up: 'UP'
} as const;

export type AnnouncementMoveDirection = typeof AnnouncementMoveDirection[keyof typeof AnnouncementMoveDirection];
export type AnnouncementType = {
  __typename?: 'AnnouncementType';
  active: Scalars['Boolean']['output'];
  content: Scalars['String']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who created this announcement */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** Display position (1 = top) among active announcements; null when inactive */
  order?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type AssignedTeamType = {
  __typename?: 'AssignedTeamType';
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
};

export type BoundsInput = {
  /** North boundary latitude */
  maxLat: Scalars['Float']['input'];
  /** East boundary longitude */
  maxLng: Scalars['Float']['input'];
  /** South boundary latitude */
  minLat: Scalars['Float']['input'];
  /** West boundary longitude */
  minLng: Scalars['Float']['input'];
};

export type ClosureAreaConnection = {
  __typename?: 'ClosureAreaConnection';
  items: Array<ClosureAreaType>;
  pageInfo: PageInfo;
};

export type ClosureAreaType = {
  __typename?: 'ClosureAreaType';
  /** Additional notes about this closure */
  comment?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who reported this closure */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** GeoJSON Polygon or MultiPolygon marking the closed area */
  geometry?: Maybe<Scalars['GeoJSON']['output']>;
  /** Source of the closure report, e.g. agency name or URL */
  informationSource?: Maybe<Scalars['String']['output']>;
  /** Internal polymorphic discriminator — always 'closure_area' */
  propertyName: Scalars['String']['output'];
  /** Current closure status: 'dangerous', 'block' */
  status: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type CreateAnnouncementInput = {
  /** The announcement body text */
  content: Scalars['String']['input'];
};

export type CreateClosureAreaInput = {
  comment?: InputMaybe<Scalars['String']['input']>;
  /** GeoJSON Polygon or MultiPolygon — must not be a Point */
  geometry: Scalars['GeoJSON']['input'];
  /** Source of the closure report, e.g. agency name or URL */
  informationSource?: InputMaybe<Scalars['String']['input']>;
  /** Initial closure status: 'active', 'cleared', or 'unknown' */
  status: Scalars['String']['input'];
};

export type CreateCrowdSourcingInput = {
  /** Distance in meters from the user to the station at time of submission */
  distanceFromGeometry?: InputMaybe<Scalars['Float']['input']>;
  /** UUID of the StationProperty being rated — null for a general station rating */
  itemUuid?: InputMaybe<Scalars['String']['input']>;
  /** Rating value: 'up', 'neutral', or 'down' */
  rating: Scalars['String']['input'];
  /** UUID of the station being rated */
  stationUuid: Scalars['String']['input'];
};

export type CreateStationInput = {
  comment?: InputMaybe<Scalars['String']['input']>;
  /** Optional station contact email */
  contactEmail?: InputMaybe<Scalars['String']['input']>;
  /** Optional station contact name */
  contactName?: InputMaybe<Scalars['String']['input']>;
  /** Optional station contact phone */
  contactPhone?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  /** GeoJSON Point — must be a valid Point within lon/lat bounds */
  geometry: Scalars['GeoJSON']['input'];
  /** Importance level for map rendering (0 = default) */
  level?: Scalars['Int']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  /** Operating hours in free-text format */
  opHour?: InputMaybe<Scalars['String']['input']>;
  /** Optional secondary address or pole location to attach to this station */
  secondaryLocation?: InputMaybe<SecondaryLocationInput>;
  /** Data origin: 'user' (default) or 'official' */
  source?: Scalars['String']['input'];
  /** Station category, e.g. 'shelter', 'supply', 'medical' */
  type?: InputMaybe<Scalars['String']['input']>;
  /** Visibility: 'public' (default), 'restricted', or 'internal' */
  visibility?: Visibility;
};

export type CreateStationPropertyInput = {
  /** Specific item name matching the property config schema */
  propertyName: Scalars['String']['input'];
  /** Category: 'supply', 'service', or 'equipment' */
  propertyType: Scalars['String']['input'];
  quantity?: InputMaybe<Scalars['Int']['input']>;
  /** UUID of the station to attach this property to */
  stationUuid: Scalars['String']['input'];
  /** Initial credibility weight [0.0–2.0], default 1.0 */
  weightings?: Scalars['Float']['input'];
};

export type CreateStationSuggestionInput = {
  /** Why the change is suggested */
  comment?: InputMaybe<Scalars['String']['input']>;
  /** Which field to change (see suggestableFields) */
  fieldName: Scalars['String']['input'];
  /** Proposed new value as text */
  newValue: Scalars['String']['input'];
  /** 'station' or 'station_property' */
  targetType: Scalars['String']['input'];
  /** UUID of the station/property to change */
  targetUuid: Scalars['UUID']['input'];
};

export type CreateTaskPropertyInput = {
  comment?: InputMaybe<Scalars['String']['input']>;
  /** Attribute key matching the task property config schema */
  propertyName: Scalars['String']['input'];
  /** Value for the attribute */
  propertyValue: Scalars['String']['input'];
  /** Number of units — null if not applicable */
  quantity?: InputMaybe<Scalars['Int']['input']>;
  /** UUID of the task to attach this property to */
  taskUuid: Scalars['String']['input'];
};

export type CreateTicketInput = {
  /** Optional email for follow-up */
  contactEmail?: InputMaybe<Scalars['String']['input']>;
  /** Full name of the requester */
  contactName: Scalars['String']['input'];
  /** Optional phone number for follow-up */
  contactPhone?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  /** Type of disaster, e.g. 'earthquake', 'flood' */
  disasterType?: InputMaybe<Scalars['String']['input']>;
  /** GeoJSON Point for the location where help is needed — [longitude, latitude] */
  geometry: Scalars['GeoJSON']['input'];
  /** Urgency: 'low' (default), 'medium', 'high', or 'critical' */
  priority?: Scalars['String']['input'];
  /** Optional street address for the request, normalized and validated on write. Needs no table of its own: secondary_locations keys on base_geometries.uuid, and a ticket IS a base_geometry. */
  secondaryLocation?: InputMaybe<SecondaryLocationInput>;
  /** Type of help: 'rescue', 'supply', 'medical', or 'hr' */
  taskType?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  /** Visibility: 'public' (default), 'restricted', or 'internal' */
  visibility?: Visibility;
};

export type CreateTicketTaskInput = {
  /** Number of people or units needed */
  quantity?: InputMaybe<Scalars['Int']['input']>;
  /** Optional UUID of an associated route */
  routeUuid?: InputMaybe<Scalars['String']['input']>;
  /** Origin: 'user' (default) or 'official' */
  source?: Scalars['String']['input'];
  taskDescription?: InputMaybe<Scalars['String']['input']>;
  taskName: Scalars['String']['input'];
  /** Category: 'rescue', 'supply', 'medical', or 'hr' */
  taskType: Scalars['String']['input'];
  /** UUID of the ticket this task belongs to */
  ticketUuid: Scalars['String']['input'];
  /** Visibility: 'public' (default), 'restricted', or 'internal' */
  visibility?: Visibility;
};

export type CreateWorkZoneInput = {
  /** GeoJSON Polygon or MultiPolygon — must not be a Point */
  geometry: Scalars['GeoJSON']['input'];
  name: Scalars['String']['input'];
};

export type CrowdSourcingType = {
  __typename?: 'CrowdSourcingType';
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** Distance in meters between the user's location and the station at submission time */
  distanceFromGeometry?: Maybe<Scalars['Float']['output']>;
  /** UUID of the specific StationProperty being rated */
  itemUuid?: Maybe<Scalars['String']['output']>;
  /** User-submitted rating: 'up', 'neutral', or 'down' */
  rating: Scalars['String']['output'];
  /** UUID of the station being rated */
  stationUuid: Scalars['String']['output'];
  /** Credibility score of the submitter at the time of submission */
  userCredibilityScore: Scalars['Float']['output'];
  /** UUID of the user who submitted this rating */
  userUuid: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  assignTaskActor: TaskAssignmentType;
  assignZoneToTeam: ZoneAssignmentType;
  attachStationPhoto: PhotoType;
  createAnnouncement: AnnouncementType;
  createClosureArea: ClosureAreaType;
  createCrowdSourcing: CrowdSourcingType;
  createStation: StationType;
  createStationProperty: StationPropertyType;
  createStationSuggestion: StationSuggestionType;
  createTaskProperty: TaskPropertyType;
  createTicket: TicketType;
  createTicketTask: TicketTaskType;
  createWorkZone: WorkZoneType;
  deleteAnnouncement: Scalars['Boolean']['output'];
  deleteClosureArea: Scalars['Boolean']['output'];
  deleteStation: Scalars['Boolean']['output'];
  deleteTicket: Scalars['Boolean']['output'];
  deleteWorkZone: Scalars['Boolean']['output'];
  detachStationPhoto: Scalars['Boolean']['output'];
  moveAnnouncement: AnnouncementType;
  removeZoneFromTeam: Scalars['Boolean']['output'];
  reviewStationSuggestion: StationSuggestionType;
  reviewTicket: TicketType;
  setAnnouncementActive: AnnouncementType;
  unassignTaskActor: Scalars['Boolean']['output'];
  updateAnnouncement: AnnouncementType;
  updateClosureArea: ClosureAreaType;
  updateStation: StationType;
  updateStationProperty: StationPropertyType;
  updateTaskAssignment: TaskAssignmentType;
  updateTaskProperty: TaskPropertyType;
  updateTicket: TicketType;
  updateTicketTask: TicketTaskType;
  updateWorkZone: WorkZoneType;
  upsertStationPropertyConfig: StationPropertyConfigType;
  upsertTaskPropertyConfig: TaskPropertyConfigType;
};


export type MutationAssignTaskActorArgs = {
  actorUuid?: InputMaybe<Scalars['UUID']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  taskUuid: Scalars['UUID']['input'];
};


export type MutationAssignZoneToTeamArgs = {
  input: ZoneTeamAssignmentInput;
};


export type MutationAttachStationPhotoArgs = {
  stationUuid: Scalars['UUID']['input'];
  url: Scalars['String']['input'];
};


export type MutationCreateAnnouncementArgs = {
  input: CreateAnnouncementInput;
};


export type MutationCreateClosureAreaArgs = {
  input: CreateClosureAreaInput;
};


export type MutationCreateCrowdSourcingArgs = {
  input: CreateCrowdSourcingInput;
};


export type MutationCreateStationArgs = {
  input: CreateStationInput;
};


export type MutationCreateStationPropertyArgs = {
  input: CreateStationPropertyInput;
};


export type MutationCreateStationSuggestionArgs = {
  input: CreateStationSuggestionInput;
};


export type MutationCreateTaskPropertyArgs = {
  input: CreateTaskPropertyInput;
};


export type MutationCreateTicketArgs = {
  input: CreateTicketInput;
};


export type MutationCreateTicketTaskArgs = {
  input: CreateTicketTaskInput;
};


export type MutationCreateWorkZoneArgs = {
  input: CreateWorkZoneInput;
};


export type MutationDeleteAnnouncementArgs = {
  uuid: Scalars['UUID']['input'];
};


export type MutationDeleteClosureAreaArgs = {
  uuid: Scalars['UUID']['input'];
};


export type MutationDeleteStationArgs = {
  uuid: Scalars['UUID']['input'];
};


export type MutationDeleteTicketArgs = {
  uuid: Scalars['UUID']['input'];
};


export type MutationDeleteWorkZoneArgs = {
  uuid: Scalars['UUID']['input'];
};


export type MutationDetachStationPhotoArgs = {
  uuid: Scalars['UUID']['input'];
};


export type MutationMoveAnnouncementArgs = {
  direction: AnnouncementMoveDirection;
  uuid: Scalars['UUID']['input'];
};


export type MutationRemoveZoneFromTeamArgs = {
  input: ZoneTeamAssignmentInput;
};


export type MutationReviewStationSuggestionArgs = {
  approve: Scalars['Boolean']['input'];
  reviewNote?: InputMaybe<Scalars['String']['input']>;
  uuid: Scalars['UUID']['input'];
};


export type MutationReviewTicketArgs = {
  reviewNote?: InputMaybe<Scalars['String']['input']>;
  uuid: Scalars['UUID']['input'];
  verificationStatus: Scalars['String']['input'];
};


export type MutationSetAnnouncementActiveArgs = {
  active: Scalars['Boolean']['input'];
  uuid: Scalars['UUID']['input'];
};


export type MutationUnassignTaskActorArgs = {
  uuid: Scalars['UUID']['input'];
};


export type MutationUpdateAnnouncementArgs = {
  input: UpdateAnnouncementInput;
  uuid: Scalars['UUID']['input'];
};


export type MutationUpdateClosureAreaArgs = {
  input: UpdateClosureAreaInput;
  uuid: Scalars['UUID']['input'];
};


export type MutationUpdateStationArgs = {
  input: UpdateStationInput;
  uuid: Scalars['UUID']['input'];
};


export type MutationUpdateStationPropertyArgs = {
  input: UpdateStationPropertyInput;
  uuid: Scalars['UUID']['input'];
};


export type MutationUpdateTaskAssignmentArgs = {
  input: UpdateTaskAssignmentInput;
  uuid: Scalars['UUID']['input'];
};


export type MutationUpdateTaskPropertyArgs = {
  input: UpdateTaskPropertyInput;
  uuid: Scalars['UUID']['input'];
};


export type MutationUpdateTicketArgs = {
  input: UpdateTicketInput;
  uuid: Scalars['UUID']['input'];
};


export type MutationUpdateTicketTaskArgs = {
  input: UpdateTicketTaskInput;
  uuid: Scalars['UUID']['input'];
};


export type MutationUpdateWorkZoneArgs = {
  input: UpdateWorkZoneInput;
  uuid: Scalars['UUID']['input'];
};


export type MutationUpsertStationPropertyConfigArgs = {
  input: UpsertPropertyConfigInput;
  stationType: Scalars['String']['input'];
};


export type MutationUpsertTaskPropertyConfigArgs = {
  input: UpsertPropertyConfigInput;
  taskType: Scalars['String']['input'];
};

export type NormalizeAddressInput = {
  /** Latitude (WGS84) */
  lat?: InputMaybe<Scalars['Float']['input']>;
  /** Max suggestions when resolving from a coordinate (clamped to 1–50) */
  limit?: Scalars['Int']['input'];
  /** Longitude (WGS84) */
  lng?: InputMaybe<Scalars['Float']['input']>;
  /** Full address as typed, e.g. '花蓮縣光復鄉中興路10號' */
  raw?: InputMaybe<Scalars['String']['input']>;
};

export type NormalizedAddressType = {
  __typename?: 'NormalizedAddressType';
  /** 弄 */
  alley?: Maybe<Scalars['String']['output']>;
  county?: Maybe<Scalars['String']['output']>;
  /** Metres between the supplied pin and the matched address point */
  distanceM?: Maybe<Scalars['Float']['output']>;
  /** 樓 */
  floor?: Maybe<Scalars['String']['output']>;
  /** Canonical single-line address, e.g. '花蓮縣光復鄉大全村中興路10號' */
  formatted?: Maybe<Scalars['String']['output']>;
  /** Human-readable reasons the status is not 'verified'; empty when it is */
  issues: Array<Scalars['String']['output']>;
  /** 巷 */
  lane?: Maybe<Scalars['String']['output']>;
  lat?: Maybe<Scalars['Float']['output']>;
  lng?: Maybe<Scalars['Float']['output']>;
  /** 號 */
  no?: Maybe<Scalars['String']['output']>;
  /** False when the input could not be resolved at all — NOT an error; read `issues` */
  normalizable: Scalars['Boolean']['output'];
  road?: Maybe<Scalars['String']['output']>;
  /** 室 */
  room?: Maybe<Scalars['String']['output']>;
  /** 段 */
  section?: Maybe<Scalars['String']['output']>;
  /** 'verified' | 'corrected' | 'unverified' | 'pin_mismatch' */
  status: Scalars['String']['output'];
  suggestions: Array<AddressSuggestionType>;
  /** 鄉鎮市區 */
  town?: Maybe<Scalars['String']['output']>;
  /** 村里 */
  village?: Maybe<Scalars['String']['output']>;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  /** True if there are more records after the current page */
  hasNextPage: Scalars['Boolean']['output'];
  /** True if there are records before the current page */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** Total number of matching records across all pages */
  totalCount: Scalars['Int']['output'];
};

export type PhotoType = {
  __typename?: 'PhotoType';
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who uploaded this photo */
  createdBy: Scalars['String']['output'];
  /** 'geometry' (attached to a ticket or station) or 'pole' (attached to a secondary_location) */
  refType: Scalars['String']['output'];
  /** UUID of the parent entity this photo is attached to */
  refUuid: Scalars['String']['output'];
  /** Public URL of the uploaded photo */
  url: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
};

export type Query = {
  __typename?: 'Query';
  announcement?: Maybe<AnnouncementType>;
  announcements: Array<AnnouncementType>;
  closureArea?: Maybe<ClosureAreaType>;
  closureAreas: ClosureAreaConnection;
  normalizeAddress: NormalizedAddressType;
  referenceData: Array<ReferenceDatasetType>;
  station?: Maybe<StationType>;
  stationPropertyConfigs: Array<StationPropertyConfigType>;
  stationSuggestions: Array<StationSuggestionType>;
  stations: StationConnection;
  suggestableFields: Array<SuggestableFieldType>;
  taskProperties: Array<TaskPropertyType>;
  taskPropertyConfigs: Array<TaskPropertyConfigType>;
  ticket?: Maybe<TicketType>;
  ticketTasks: Array<TicketTaskType>;
  tickets: TicketConnection;
  workZone?: Maybe<WorkZoneType>;
  workZones: WorkZoneConnection;
  zonesByTeam: WorkZoneConnection;
};


export type QueryAnnouncementArgs = {
  uuid: Scalars['UUID']['input'];
};


export type QueryAnnouncementsArgs = {
  filter?: AnnouncementFilter;
};


export type QueryClosureAreaArgs = {
  uuid: Scalars['UUID']['input'];
};


export type QueryClosureAreasArgs = {
  bounds?: InputMaybe<BoundsInput>;
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
};


export type QueryNormalizeAddressArgs = {
  input: NormalizeAddressInput;
};


export type QueryStationArgs = {
  uuid: Scalars['UUID']['input'];
};


export type QueryStationPropertyConfigsArgs = {
  stationType: Scalars['String']['input'];
};


export type QueryStationSuggestionsArgs = {
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  targetUuid?: InputMaybe<Scalars['String']['input']>;
};


export type QueryStationsArgs = {
  bounds?: InputMaybe<BoundsInput>;
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
  stationType?: InputMaybe<Scalars['String']['input']>;
};


export type QuerySuggestableFieldsArgs = {
  targetType: Scalars['String']['input'];
};


export type QueryTaskPropertiesArgs = {
  taskUuid: Scalars['String']['input'];
};


export type QueryTaskPropertyConfigsArgs = {
  taskType: Scalars['String']['input'];
};


export type QueryTicketArgs = {
  uuid: Scalars['UUID']['input'];
};


export type QueryTicketTasksArgs = {
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  ticketUuid: Scalars['String']['input'];
};


export type QueryTicketsArgs = {
  bounds?: InputMaybe<BoundsInput>;
  limit?: Scalars['Int']['input'];
  priority?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryWorkZoneArgs = {
  uuid: Scalars['UUID']['input'];
};


export type QueryWorkZonesArgs = {
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
};


export type QueryZonesByTeamArgs = {
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
  teamUuid: Scalars['UUID']['input'];
};

export type ReferenceDatasetType = {
  __typename?: 'ReferenceDatasetType';
  error?: Maybe<Scalars['String']['output']>;
  finishedAt?: Maybe<Scalars['DateTime']['output']>;
  /** 'ref_roads' | 'ref_villages' | 'osm_address_points' */
  name: Scalars['String']['output'];
  rowCount?: Maybe<Scalars['Int']['output']>;
  sourceVersion?: Maybe<Scalars['String']['output']>;
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  /** 'pending' | 'downloading' | 'importing' | 'ready' | 'failed' */
  status: Scalars['String']['output'];
};

export type SecondaryLocationInput = {
  alley?: InputMaybe<Scalars['String']['input']>;
  county?: InputMaybe<Scalars['String']['input']>;
  floor?: InputMaybe<Scalars['String']['input']>;
  lane?: InputMaybe<Scalars['String']['input']>;
  /** Type of secondary location: 'address' (default) or 'pole' */
  locationType?: Scalars['String']['input'];
  no?: InputMaybe<Scalars['String']['input']>;
  poleId?: InputMaybe<Scalars['String']['input']>;
  poleNote?: InputMaybe<Scalars['String']['input']>;
  poleType?: InputMaybe<Scalars['String']['input']>;
  /** Full address as typed, e.g. '花蓮縣光復鄉中興路10號'. Wins over the fields below. */
  raw?: InputMaybe<Scalars['String']['input']>;
  road?: InputMaybe<Scalars['String']['input']>;
  room?: InputMaybe<Scalars['String']['input']>;
  /** 段 */
  section?: InputMaybe<Scalars['String']['input']>;
  /** 鄉鎮市區 */
  town?: InputMaybe<Scalars['String']['input']>;
  /** 村里 */
  village?: InputMaybe<Scalars['String']['input']>;
};

export type SecondaryLocationType = {
  __typename?: 'SecondaryLocationType';
  alley?: Maybe<Scalars['String']['output']>;
  county?: Maybe<Scalars['String']['output']>;
  floor?: Maybe<Scalars['String']['output']>;
  /** Canonical single-line address, masked from 巷 onward without the parent's view_pii */
  formatted?: Maybe<Scalars['String']['output']>;
  /** UUID of the parent station this location belongs to */
  geometryUuid: Scalars['String']['output'];
  lane?: Maybe<Scalars['String']['output']>;
  /** Type of secondary location: 'address' or 'pole' */
  locationType: Scalars['String']['output'];
  no?: Maybe<Scalars['String']['output']>;
  /** How far validation got: 'verified' | 'corrected' | 'unverified' | 'pin_mismatch' */
  normalizationStatus?: Maybe<Scalars['String']['output']>;
  /** Utility pole identifier (only set when location_type is 'pole') */
  poleId?: Maybe<Scalars['String']['output']>;
  /** Additional notes about the pole location */
  poleNote?: Maybe<Scalars['String']['output']>;
  /** Type of utility pole, e.g. '電線桿' (electricity pole), '電話線桿' (telephone pole) */
  poleType?: Maybe<Scalars['String']['output']>;
  road?: Maybe<Scalars['String']['output']>;
  room?: Maybe<Scalars['String']['output']>;
  /** 段 */
  section?: Maybe<Scalars['String']['output']>;
  /** 鄉鎮市區 (replaced the old `city`) */
  town?: Maybe<Scalars['String']['output']>;
  uuid: Scalars['UUID']['output'];
  /** 村里 */
  village?: Maybe<Scalars['String']['output']>;
};

export type StationConnection = {
  __typename?: 'StationConnection';
  items: Array<StationType>;
  pageInfo: PageInfo;
};

export type StationPropertyConfigType = {
  __typename?: 'StationPropertyConfigType';
  /** Expected data type: 'string', 'integer', 'float', or 'enum' */
  dataType: Scalars['String']['output'];
  /** Allowed values when data_type is 'enum', e.g. ['available', 'depleted'] */
  enumOptions?: Maybe<Array<Scalars['String']['output']>>;
  /** The property key this config defines, e.g. 'water', 'food_ration' */
  propertyName: Scalars['String']['output'];
  /** The station type this config applies to, or 'all' for universal properties */
  stationType: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
};

export type StationPropertyType = {
  __typename?: 'StationPropertyType';
  comment?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who added this property */
  createdBy?: Maybe<Scalars['String']['output']>;
  crowdSourcings: Array<CrowdSourcingType>;
  /** Specific item name, e.g. 'water', 'food_ration', 'medical_kit' */
  propertyName: Scalars['String']['output'];
  /** Category of this property, e.g. 'supply', 'service', 'equipment' */
  propertyType: Scalars['String']['output'];
  /** Available quantity — null means unknown */
  quantity?: Maybe<Scalars['Int']['output']>;
  /** UUID of the parent station this property belongs to */
  stationUuid: Scalars['String']['output'];
  /** Review state: 'pending', 'verified', or 'rejected' */
  status: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
  /** Credibility weight applied during score aggregation [0.0–2.0], default 1.0 */
  weightings: Scalars['Float']['output'];
};

export type StationSuggestionType = {
  __typename?: 'StationSuggestionType';
  /** Why the user suggests this change */
  comment?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who made the suggestion */
  createdBy?: Maybe<Scalars['String']['output']>;
  fieldName: Scalars['String']['output'];
  /** Proposed value, stored as text */
  newValue: Scalars['String']['output'];
  /** Admin's note recorded when approving/rejecting */
  reviewNote?: Maybe<Scalars['String']['output']>;
  /** UUID of the admin who decided */
  reviewedBy?: Maybe<Scalars['String']['output']>;
  /** 'pending', 'approved', or 'rejected' */
  status: Scalars['String']['output'];
  /** What the suggestion targets: 'station' or 'station_property' */
  targetType: Scalars['String']['output'];
  /** UUID of the targeted station/property */
  targetUuid: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type StationType = {
  __typename?: 'StationType';
  /** Internal admin comment, not shown to the public */
  comment?: Maybe<Scalars['String']['output']>;
  /** Aggregate credibility score based on crowd-sourced ratings [0.0–1.0] */
  confidenceScore?: Maybe<Scalars['Float']['output']>;
  /** Station contact email — masked unless the caller holds station.view_pii here */
  contactEmail?: Maybe<Scalars['String']['output']>;
  /** Station contact name — masked unless the caller holds station.view_pii here */
  contactName?: Maybe<Scalars['String']['output']>;
  /** Station contact phone — masked unless the caller holds station.view_pii here */
  contactPhone?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who created this station */
  createdBy?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  /** GeoJSON geometry — Point for a station location, Polygon/MultiPolygon for an area */
  geometry?: Maybe<Scalars['GeoJSON']['output']>;
  /** True if this station has been flagged as a duplicate entry */
  isDuplicate: Scalars['Boolean']['output'];
  /** True if this station is operated by a government or official body */
  isOfficial: Scalars['Boolean']['output'];
  /** True if this is a temporary station (e.g. emergency shelter) */
  isTemporary: Scalars['Boolean']['output'];
  /** Importance level used for map rendering priority (0 = default) */
  level: Scalars['Int']['output'];
  name?: Maybe<Scalars['String']['output']>;
  /** Operating hours in free-text format, e.g. '09:00–18:00' or '24h' */
  opHour?: Maybe<Scalars['String']['output']>;
  photos: Array<PhotoType>;
  /** Computed urgency score used for display ordering — higher is more urgent */
  priorityScore?: Maybe<Scalars['Float']['output']>;
  properties: Array<StationPropertyType>;
  /** Internal polymorphic discriminator — always 'station' */
  propertyName: Scalars['String']['output'];
  /** Address or pole location — the address is masked without station.view_pii here */
  secondaryLocation?: Maybe<SecondaryLocationType>;
  /** Data source of this record: 'user' or 'official' */
  source?: Maybe<Scalars['String']['output']>;
  /** Station category, e.g. 'shelter', 'supply', 'medical' */
  type?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
  /** Review state: 'unverified', 'ai_verified', or 'human_verified' */
  verificationStatus?: Maybe<Scalars['String']['output']>;
  /** Who can see this station: 'public' or 'restricted' */
  visibility?: Maybe<Scalars['String']['output']>;
};

export type SuggestableFieldType = {
  __typename?: 'SuggestableFieldType';
  /** Input widget hint: 'string', 'integer', or 'enum' */
  dataType: Scalars['String']['output'];
  /** Allowed values when data_type is 'enum', else null */
  enumOptions?: Maybe<Array<Scalars['String']['output']>>;
  fieldName: Scalars['String']['output'];
};

export const TaskAssignmentStatus = {
  Accepted: 'accepted',
  Completed: 'completed',
  EnRoute: 'en_route'
} as const;

export type TaskAssignmentStatus = typeof TaskAssignmentStatus[keyof typeof TaskAssignmentStatus];
export type TaskAssignmentType = {
  __typename?: 'TaskAssignmentType';
  /** UUID of the assigned user or group */
  actorUuid: Scalars['String']['output'];
  /** Timestamp when the assignment was created */
  assignedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Role in the task, e.g. 'lead', 'support' */
  role?: Maybe<Scalars['String']['output']>;
  /** Work-completion state: 'accepted', 'en_route', or 'completed' */
  status: Scalars['String']['output'];
  /** UUID of the task this assignment belongs to */
  taskUuid: Scalars['String']['output'];
  /** Timestamp when the status was last changed */
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type TaskPropertyConfigType = {
  __typename?: 'TaskPropertyConfigType';
  /** Expected data type: 'string', 'integer', 'float', or 'enum' */
  dataType: Scalars['String']['output'];
  /** Allowed values when data_type is 'enum' */
  enumOptions?: Maybe<Array<Scalars['String']['output']>>;
  /** The property key this config defines */
  propertyName: Scalars['String']['output'];
  /** The task type this config applies to */
  taskType: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
};

export const TaskPropertyStatus = {
  Fulfilled: 'fulfilled',
  Pending: 'pending'
} as const;

export type TaskPropertyStatus = typeof TaskPropertyStatus[keyof typeof TaskPropertyStatus];
export type TaskPropertyType = {
  __typename?: 'TaskPropertyType';
  /** Optional notes about this property */
  comment?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** Structured attribute key, e.g. 'skill_required', 'cargo_type' */
  propertyName: Scalars['String']['output'];
  /** Value for the attribute, e.g. 'medical_first_aid', 'food' */
  propertyValue: Scalars['String']['output'];
  /** Number of units required — null means not applicable */
  quantity?: Maybe<Scalars['Int']['output']>;
  /** Fulfillment state: 'pending' or 'fulfilled' */
  status?: Maybe<Scalars['String']['output']>;
  /** UUID of the parent ticket task */
  taskUuid: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
};

export type TicketConnection = {
  __typename?: 'TicketConnection';
  items: Array<TicketType>;
  pageInfo: PageInfo;
};

export type TicketTaskType = {
  __typename?: 'TicketTaskType';
  assignedCount: Scalars['Int']['output'];
  assignments: Array<TaskAssignmentType>;
  completedCount: Scalars['Int']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who created this task */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** Review state: 'pending_review', 'approved', or 'rejected' */
  moderationStatus: Scalars['String']['output'];
  progress?: Maybe<Scalars['Float']['output']>;
  /** Current progress update written by the assignee */
  progressNote?: Maybe<Scalars['String']['output']>;
  properties: Array<TaskPropertyType>;
  /** Number of people or units needed — null means unspecified */
  quantity?: Maybe<Scalars['Int']['output']>;
  /** Moderator's notes explaining the review decision */
  reviewNote?: Maybe<Scalars['String']['output']>;
  /** Origin of this task: 'user' or 'official' */
  source: Scalars['String']['output'];
  /** Lifecycle state: 'pending', 'in_progress', 'fulfilled', or 'canceled' */
  status: Scalars['String']['output'];
  /** Detailed task instructions or context */
  taskDescription?: Maybe<Scalars['String']['output']>;
  /** Short name summarising the task */
  taskName: Scalars['String']['output'];
  /** Category of task: 'rescue', 'supply', 'medical', or 'hr' */
  taskType: Scalars['String']['output'];
  /** UUID of the parent ticket this task belongs to */
  ticketUuid: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
  /** Who can see this task: 'public', 'restricted', or 'internal' */
  visibility: Scalars['String']['output'];
};

export type TicketType = {
  __typename?: 'TicketType';
  /** Follow-up email — masked unless the caller holds ticket.view_pii here */
  contactEmail?: Maybe<Scalars['String']['output']>;
  /** Requester full name — masked unless the caller holds ticket.view_pii here */
  contactName?: Maybe<Scalars['String']['output']>;
  /** Follow-up phone — masked unless the caller holds ticket.view_pii here */
  contactPhone?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who submitted this ticket */
  createdBy?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  /** Type of disaster, e.g. 'earthquake', 'flood' */
  disasterType?: Maybe<Scalars['String']['output']>;
  /** GeoJSON Point indicating where help is needed */
  geometry?: Maybe<Scalars['GeoJSON']['output']>;
  photos: Array<PhotoType>;
  /** Urgency level: 'low', 'medium', 'high', or 'critical' */
  priority: Scalars['String']['output'];
  /** Internal polymorphic discriminator — always 'request' */
  propertyName: Scalars['String']['output'];
  /** Moderator's notes about the verification decision */
  reviewNote?: Maybe<Scalars['String']['output']>;
  /** Address of the request — masked unless the caller holds ticket.view_pii here */
  secondaryLocation?: Maybe<SecondaryLocationType>;
  /** Lifecycle state: 'pending', 'in_progress', 'completed', or 'cancelled' */
  status: Scalars['String']['output'];
  /** Type of help needed: 'rescue', 'supply', 'medical', or 'hr' */
  taskType?: Maybe<Scalars['String']['output']>;
  tasks: Array<TicketTaskType>;
  /** Short subject line describing the request */
  title: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
  /** Review state: 'unverified', 'ai_verified', 'human_verified', or 'disputed' */
  verificationStatus?: Maybe<Scalars['String']['output']>;
  /** Who can see this ticket: 'public', 'restricted', or 'internal' */
  visibility?: Maybe<Scalars['String']['output']>;
};

export type UpdateAnnouncementInput = {
  /** The new announcement body text */
  content: Scalars['String']['input'];
};

export type UpdateClosureAreaInput = {
  comment?: InputMaybe<Scalars['String']['input']>;
  geometry?: InputMaybe<Scalars['GeoJSON']['input']>;
  informationSource?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateStationInput = {
  comment?: InputMaybe<Scalars['String']['input']>;
  contactEmail?: InputMaybe<Scalars['String']['input']>;
  contactName?: InputMaybe<Scalars['String']['input']>;
  contactPhone?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  /** New GeoJSON Point — replaces existing geometry if provided */
  geometry?: InputMaybe<Scalars['GeoJSON']['input']>;
  /** Updated importance level */
  level?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  opHour?: InputMaybe<Scalars['String']['input']>;
  /** Replaces the station's address wholesale; omit to leave it unchanged */
  secondaryLocation?: InputMaybe<SecondaryLocationInput>;
  type?: InputMaybe<Scalars['String']['input']>;
  /** Updated visibility: 'public', 'restricted', or 'internal' */
  visibility?: InputMaybe<Visibility>;
};

export type UpdateStationPropertyInput = {
  quantity?: InputMaybe<Scalars['Int']['input']>;
  /** New review state: 'pending', 'verified', or 'rejected' */
  status?: InputMaybe<Scalars['String']['input']>;
  /** Updated credibility weight [0.0–2.0] */
  weightings?: InputMaybe<Scalars['Float']['input']>;
};

export type UpdateTaskAssignmentInput = {
  /** Updated role, e.g. 'lead' or 'support' — pass null to clear */
  role?: InputMaybe<Scalars['String']['input']>;
  /** New work-completion state */
  status?: InputMaybe<TaskAssignmentStatus>;
};

export type UpdateTaskPropertyInput = {
  /** Updated notes — pass null to clear */
  comment?: InputMaybe<Scalars['String']['input']>;
  /** Updated attribute value */
  propertyValue?: InputMaybe<Scalars['String']['input']>;
  /** Updated number of units — pass null to clear */
  quantity?: InputMaybe<Scalars['Int']['input']>;
  /** Updated fulfillment state */
  status?: InputMaybe<TaskPropertyStatus>;
};

export type UpdateTicketInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  /** Type of disaster — pass null to clear */
  disasterType?: InputMaybe<Scalars['String']['input']>;
  /** Updated urgency: 'low', 'medium', 'high', or 'critical' */
  priority?: InputMaybe<Scalars['String']['input']>;
  /** Moderator's review notes — pass null to clear */
  reviewNote?: InputMaybe<Scalars['String']['input']>;
  /** New lifecycle state — must follow valid transitions (e.g. pending → in_progress) */
  status?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  /** Updated review state: 'unverified', 'ai_verified', 'human_verified', or 'disputed' */
  verificationStatus?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTicketTaskInput = {
  /** New review state: 'pending_review', 'approved', or 'rejected' */
  moderationStatus?: InputMaybe<Scalars['String']['input']>;
  /** Updated progress description — pass null to clear */
  progressNote?: InputMaybe<Scalars['String']['input']>;
  /** Moderator's review notes — pass null to clear */
  reviewNote?: InputMaybe<Scalars['String']['input']>;
  /** New lifecycle state: 'pending', 'in_progress', 'fulfilled', or 'canceled' */
  status?: InputMaybe<Scalars['String']['input']>;
  /** Updated visibility: 'public', 'restricted', or 'internal' */
  visibility?: InputMaybe<Visibility>;
};

export type UpdateWorkZoneInput = {
  geometry?: InputMaybe<Scalars['GeoJSON']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpsertPropertyConfigInput = {
  /** Expected data type: 'string', 'integer', 'float', or 'enum' */
  dataType: Scalars['String']['input'];
  /** Allowed enum values — required when data_type is 'enum', null otherwise */
  enumOptions?: InputMaybe<Array<Scalars['String']['input']>>;
  /** The property key to create or update */
  propertyName: Scalars['String']['input'];
};

export const Visibility = {
  Internal: 'internal',
  Public: 'public',
  Restricted: 'restricted'
} as const;

export type Visibility = typeof Visibility[keyof typeof Visibility];
export type WorkZoneConnection = {
  __typename?: 'WorkZoneConnection';
  items: Array<WorkZoneType>;
  pageInfo: PageInfo;
};

export type WorkZoneType = {
  __typename?: 'WorkZoneType';
  /** Teams this zone has been delegated to */
  assignedTeams: Array<AssignedTeamType>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the gov user who drew this zone */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** GeoJSON Polygon or MultiPolygon marking the zone boundary */
  geometry?: Maybe<Scalars['GeoJSON']['output']>;
  name: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type ZoneAssignmentType = {
  __typename?: 'ZoneAssignmentType';
  assignedAt?: Maybe<Scalars['DateTime']['output']>;
  assignedBy?: Maybe<Scalars['String']['output']>;
  teamUuid: Scalars['UUID']['output'];
  zoneUuid: Scalars['UUID']['output'];
};

export type ZoneTeamAssignmentInput = {
  teamUuid: Scalars['UUID']['input'];
  zoneUuid: Scalars['UUID']['input'];
};

export type NormalizeAddressQueryVariables = Exact<{
  input: NormalizeAddressInput;
}>;


export type NormalizeAddressQuery = { __typename?: 'Query', normalizeAddress: { __typename?: 'NormalizedAddressType', normalizable: boolean, status: string, formatted?: string | null, county?: string | null, town?: string | null, village?: string | null, road?: string | null, section?: string | null, lane?: string | null, alley?: string | null, no?: string | null, floor?: string | null, room?: string | null, lat?: number | null, lng?: number | null, distanceM?: number | null, issues: Array<string>, suggestions: Array<{ __typename?: 'AddressSuggestionType', formatted: string, county?: string | null, town?: string | null, village?: string | null, road?: string | null, no?: string | null, distanceM?: number | null }> } };

export type ReferenceDataQueryVariables = Exact<{ [key: string]: never; }>;


export type ReferenceDataQuery = { __typename?: 'Query', referenceData: Array<{ __typename?: 'ReferenceDatasetType', name: string, status: string, rowCount?: number | null, sourceVersion?: string | null, startedAt?: any | null, finishedAt?: any | null, error?: string | null }> };

export type PageInfoFieldsFragment = { __typename?: 'PageInfo', totalCount: number, hasNextPage: boolean, hasPreviousPage: boolean } & { ' $fragmentName'?: 'PageInfoFieldsFragment' };

export type StationFieldsFragment = { __typename?: 'StationType', uuid: string, propertyName: string, geometry?: Geometry | null, type?: string | null, name?: string | null, description?: string | null, opHour?: string | null, level: number, comment?: string | null, source?: string | null, visibility?: string | null, verificationStatus?: string | null, confidenceScore?: number | null, isDuplicate: boolean, isTemporary: boolean, isOfficial: boolean, priorityScore?: number | null, createdBy?: string | null, createdAt?: any | null, updatedAt?: any | null } & { ' $fragmentName'?: 'StationFieldsFragment' };

export type ClosureAreaFieldsFragment = { __typename?: 'ClosureAreaType', uuid: string, propertyName: string, geometry?: Geometry | null, status: string, informationSource?: string | null, comment?: string | null, createdBy?: string | null, createdAt?: any | null, updatedAt?: any | null } & { ' $fragmentName'?: 'ClosureAreaFieldsFragment' };

export type GetStationsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  stationType?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetStationsQuery = { __typename?: 'Query', stations: { __typename?: 'StationConnection', items: Array<(
      { __typename?: 'StationType' }
      & { ' $fragmentRefs'?: { 'StationFieldsFragment': StationFieldsFragment } }
    )>, pageInfo: (
      { __typename?: 'PageInfo' }
      & { ' $fragmentRefs'?: { 'PageInfoFieldsFragment': PageInfoFieldsFragment } }
    ) } };

export type GetStationQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;


export type GetStationQuery = { __typename?: 'Query', station?: (
    { __typename?: 'StationType', secondaryLocation?: { __typename?: 'SecondaryLocationType', uuid: string, locationType: string, formatted?: string | null, normalizationStatus?: string | null, county?: string | null, town?: string | null, village?: string | null, road?: string | null, section?: string | null, lane?: string | null, alley?: string | null, no?: string | null, floor?: string | null, room?: string | null, poleId?: string | null, poleType?: string | null, poleNote?: string | null } | null, properties: Array<{ __typename?: 'StationPropertyType', uuid: string, stationUuid: string, propertyType: string, propertyName: string, quantity?: number | null, comment?: string | null, status: string, weightings: number, createdBy?: string | null, createdAt?: any | null }> }
    & { ' $fragmentRefs'?: { 'StationFieldsFragment': StationFieldsFragment } }
  ) | null };

export type GetClosureAreasQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetClosureAreasQuery = { __typename?: 'Query', closureAreas: { __typename?: 'ClosureAreaConnection', items: Array<(
      { __typename?: 'ClosureAreaType' }
      & { ' $fragmentRefs'?: { 'ClosureAreaFieldsFragment': ClosureAreaFieldsFragment } }
    )>, pageInfo: (
      { __typename?: 'PageInfo' }
      & { ' $fragmentRefs'?: { 'PageInfoFieldsFragment': PageInfoFieldsFragment } }
    ) } };

export type GetClosureAreaQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;


export type GetClosureAreaQuery = { __typename?: 'Query', closureArea?: (
    { __typename?: 'ClosureAreaType' }
    & { ' $fragmentRefs'?: { 'ClosureAreaFieldsFragment': ClosureAreaFieldsFragment } }
  ) | null };

export type CreateStationMutationVariables = Exact<{
  input: CreateStationInput;
}>;


export type CreateStationMutation = { __typename?: 'Mutation', createStation: (
    { __typename?: 'StationType' }
    & { ' $fragmentRefs'?: { 'StationFieldsFragment': StationFieldsFragment } }
  ) };

export type UpdateStationMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateStationInput;
}>;


export type UpdateStationMutation = { __typename?: 'Mutation', updateStation: (
    { __typename?: 'StationType' }
    & { ' $fragmentRefs'?: { 'StationFieldsFragment': StationFieldsFragment } }
  ) };

export type DeleteStationMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;


export type DeleteStationMutation = { __typename?: 'Mutation', deleteStation: boolean };

export type CreateStationPropertyMutationVariables = Exact<{
  input: CreateStationPropertyInput;
}>;


export type CreateStationPropertyMutation = { __typename?: 'Mutation', createStationProperty: { __typename?: 'StationPropertyType', uuid: string, stationUuid: string, propertyType: string, propertyName: string, quantity?: number | null, status: string, weightings: number, createdBy?: string | null, createdAt?: any | null } };

export type CreateCrowdSourcingMutationVariables = Exact<{
  input: CreateCrowdSourcingInput;
}>;


export type CreateCrowdSourcingMutation = { __typename?: 'Mutation', createCrowdSourcing: { __typename?: 'CrowdSourcingType', uuid: string, stationUuid: string, itemUuid?: string | null, rating: string, createdAt?: any | null } };

export type TicketFieldsFragment = { __typename?: 'TicketType', uuid: string, propertyName: string, geometry?: Geometry | null, title: string, description?: string | null, contactName?: string | null, contactEmail?: string | null, contactPhone?: string | null, status: string, priority: string, taskType?: string | null, visibility?: string | null, verificationStatus?: string | null, reviewNote?: string | null, createdBy?: string | null, createdAt?: any | null, updatedAt?: any | null } & { ' $fragmentName'?: 'TicketFieldsFragment' };

export type TicketTaskFieldsFragment = { __typename?: 'TicketTaskType', uuid: string, ticketUuid: string, taskType: string, taskName: string, taskDescription?: string | null, quantity?: number | null, status: string, source: string, progressNote?: string | null, visibility: string, moderationStatus: string, reviewNote?: string | null, createdAt?: any | null, updatedAt?: any | null } & { ' $fragmentName'?: 'TicketTaskFieldsFragment' };

export type GetTicketsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  status?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetTicketsQuery = { __typename?: 'Query', tickets: { __typename?: 'TicketConnection', items: Array<(
      { __typename?: 'TicketType' }
      & { ' $fragmentRefs'?: { 'TicketFieldsFragment': TicketFieldsFragment } }
    )>, pageInfo: { __typename?: 'PageInfo', totalCount: number, hasNextPage: boolean, hasPreviousPage: boolean } } };

export type GetTicketQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;


export type GetTicketQuery = { __typename?: 'Query', ticket?: (
    { __typename?: 'TicketType', photos: Array<{ __typename?: 'PhotoType', uuid: string, url: string, createdBy: string, createdAt?: any | null }>, tasks: Array<(
      { __typename?: 'TicketTaskType' }
      & { ' $fragmentRefs'?: { 'TicketTaskFieldsFragment': TicketTaskFieldsFragment } }
    )> }
    & { ' $fragmentRefs'?: { 'TicketFieldsFragment': TicketFieldsFragment } }
  ) | null };

export type GetTicketTasksQueryVariables = Exact<{
  ticketUuid: Scalars['String']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetTicketTasksQuery = { __typename?: 'Query', ticketTasks: Array<(
    { __typename?: 'TicketTaskType', properties: Array<{ __typename?: 'TaskPropertyType', uuid: string, taskUuid: string, propertyName: string, propertyValue: string, quantity?: number | null, status?: string | null, comment?: string | null, createdAt?: any | null }>, assignments: Array<{ __typename?: 'TaskAssignmentType', uuid: string, taskUuid: string, actorUuid: string, role?: string | null, assignedAt?: any | null }> }
    & { ' $fragmentRefs'?: { 'TicketTaskFieldsFragment': TicketTaskFieldsFragment } }
  )> };

export type CreateTicketMutationVariables = Exact<{
  input: CreateTicketInput;
}>;


export type CreateTicketMutation = { __typename?: 'Mutation', createTicket: (
    { __typename?: 'TicketType' }
    & { ' $fragmentRefs'?: { 'TicketFieldsFragment': TicketFieldsFragment } }
  ) };

export type UpdateTicketMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateTicketInput;
}>;


export type UpdateTicketMutation = { __typename?: 'Mutation', updateTicket: (
    { __typename?: 'TicketType' }
    & { ' $fragmentRefs'?: { 'TicketFieldsFragment': TicketFieldsFragment } }
  ) };

export type CreateTicketTaskMutationVariables = Exact<{
  input: CreateTicketTaskInput;
}>;


export type CreateTicketTaskMutation = { __typename?: 'Mutation', createTicketTask: (
    { __typename?: 'TicketTaskType' }
    & { ' $fragmentRefs'?: { 'TicketTaskFieldsFragment': TicketTaskFieldsFragment } }
  ) };

export type UpdateTicketTaskMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateTicketTaskInput;
}>;


export type UpdateTicketTaskMutation = { __typename?: 'Mutation', updateTicketTask: (
    { __typename?: 'TicketTaskType' }
    & { ' $fragmentRefs'?: { 'TicketTaskFieldsFragment': TicketTaskFieldsFragment } }
  ) };

export type CreateTaskPropertyMutationVariables = Exact<{
  input: CreateTaskPropertyInput;
}>;


export type CreateTaskPropertyMutation = { __typename?: 'Mutation', createTaskProperty: { __typename?: 'TaskPropertyType', uuid: string, taskUuid: string, propertyName: string, propertyValue: string, quantity?: number | null, status?: string | null, comment?: string | null, createdAt?: any | null } };

export const PageInfoFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PageInfoFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PageInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}}]}}]} as unknown as DocumentNode<PageInfoFieldsFragment, unknown>;
export const StationFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"StationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StationType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"opHour"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"confidenceScore"}},{"kind":"Field","name":{"kind":"Name","value":"isDuplicate"}},{"kind":"Field","name":{"kind":"Name","value":"isTemporary"}},{"kind":"Field","name":{"kind":"Name","value":"isOfficial"}},{"kind":"Field","name":{"kind":"Name","value":"priorityScore"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<StationFieldsFragment, unknown>;
export const ClosureAreaFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ClosureAreaFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ClosureAreaType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"informationSource"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<ClosureAreaFieldsFragment, unknown>;
export const TicketFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"contactName"}},{"kind":"Field","name":{"kind":"Name","value":"contactEmail"}},{"kind":"Field","name":{"kind":"Name","value":"contactPhone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"priority"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<TicketFieldsFragment, unknown>;
export const TicketTaskFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketTaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketTaskType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"ticketUuid"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"taskName"}},{"kind":"Field","name":{"kind":"Name","value":"taskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"progressNote"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"moderationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<TicketTaskFieldsFragment, unknown>;
export const NormalizeAddressDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"NormalizeAddress"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"NormalizeAddressInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"normalizeAddress"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"normalizable"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"formatted"}},{"kind":"Field","name":{"kind":"Name","value":"county"}},{"kind":"Field","name":{"kind":"Name","value":"town"}},{"kind":"Field","name":{"kind":"Name","value":"village"}},{"kind":"Field","name":{"kind":"Name","value":"road"}},{"kind":"Field","name":{"kind":"Name","value":"section"}},{"kind":"Field","name":{"kind":"Name","value":"lane"}},{"kind":"Field","name":{"kind":"Name","value":"alley"}},{"kind":"Field","name":{"kind":"Name","value":"no"}},{"kind":"Field","name":{"kind":"Name","value":"floor"}},{"kind":"Field","name":{"kind":"Name","value":"room"}},{"kind":"Field","name":{"kind":"Name","value":"lat"}},{"kind":"Field","name":{"kind":"Name","value":"lng"}},{"kind":"Field","name":{"kind":"Name","value":"distanceM"}},{"kind":"Field","name":{"kind":"Name","value":"issues"}},{"kind":"Field","name":{"kind":"Name","value":"suggestions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"formatted"}},{"kind":"Field","name":{"kind":"Name","value":"county"}},{"kind":"Field","name":{"kind":"Name","value":"town"}},{"kind":"Field","name":{"kind":"Name","value":"village"}},{"kind":"Field","name":{"kind":"Name","value":"road"}},{"kind":"Field","name":{"kind":"Name","value":"no"}},{"kind":"Field","name":{"kind":"Name","value":"distanceM"}}]}}]}}]}}]} as unknown as DocumentNode<NormalizeAddressQuery, NormalizeAddressQueryVariables>;
export const ReferenceDataDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ReferenceData"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"referenceData"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"rowCount"}},{"kind":"Field","name":{"kind":"Name","value":"sourceVersion"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"finishedAt"}},{"kind":"Field","name":{"kind":"Name","value":"error"}}]}}]}}]} as unknown as DocumentNode<ReferenceDataQuery, ReferenceDataQueryVariables>;
export const GetStationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetStations"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"bounds"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"BoundsInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"stationType"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"skip"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"50"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"stations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"bounds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"bounds"}}},{"kind":"Argument","name":{"kind":"Name","value":"stationType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"stationType"}}},{"kind":"Argument","name":{"kind":"Name","value":"skip"},"value":{"kind":"Variable","name":{"kind":"Name","value":"skip"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"StationFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PageInfoFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PageInfoFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PageInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"StationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StationType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"opHour"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"confidenceScore"}},{"kind":"Field","name":{"kind":"Name","value":"isDuplicate"}},{"kind":"Field","name":{"kind":"Name","value":"isTemporary"}},{"kind":"Field","name":{"kind":"Name","value":"isOfficial"}},{"kind":"Field","name":{"kind":"Name","value":"priorityScore"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetStationsQuery, GetStationsQueryVariables>;
export const GetStationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetStation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"station"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"StationFields"}},{"kind":"Field","name":{"kind":"Name","value":"secondaryLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"locationType"}},{"kind":"Field","name":{"kind":"Name","value":"formatted"}},{"kind":"Field","name":{"kind":"Name","value":"normalizationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"county"}},{"kind":"Field","name":{"kind":"Name","value":"town"}},{"kind":"Field","name":{"kind":"Name","value":"village"}},{"kind":"Field","name":{"kind":"Name","value":"road"}},{"kind":"Field","name":{"kind":"Name","value":"section"}},{"kind":"Field","name":{"kind":"Name","value":"lane"}},{"kind":"Field","name":{"kind":"Name","value":"alley"}},{"kind":"Field","name":{"kind":"Name","value":"no"}},{"kind":"Field","name":{"kind":"Name","value":"floor"}},{"kind":"Field","name":{"kind":"Name","value":"room"}},{"kind":"Field","name":{"kind":"Name","value":"poleId"}},{"kind":"Field","name":{"kind":"Name","value":"poleType"}},{"kind":"Field","name":{"kind":"Name","value":"poleNote"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"stationUuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyType"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"weightings"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"StationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StationType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"opHour"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"confidenceScore"}},{"kind":"Field","name":{"kind":"Name","value":"isDuplicate"}},{"kind":"Field","name":{"kind":"Name","value":"isTemporary"}},{"kind":"Field","name":{"kind":"Name","value":"isOfficial"}},{"kind":"Field","name":{"kind":"Name","value":"priorityScore"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetStationQuery, GetStationQueryVariables>;
export const GetClosureAreasDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetClosureAreas"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"bounds"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"BoundsInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"skip"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"50"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"closureAreas"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"bounds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"bounds"}}},{"kind":"Argument","name":{"kind":"Name","value":"skip"},"value":{"kind":"Variable","name":{"kind":"Name","value":"skip"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ClosureAreaFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PageInfoFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PageInfoFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PageInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ClosureAreaFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ClosureAreaType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"informationSource"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetClosureAreasQuery, GetClosureAreasQueryVariables>;
export const GetClosureAreaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetClosureArea"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"closureArea"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ClosureAreaFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ClosureAreaFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ClosureAreaType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"informationSource"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetClosureAreaQuery, GetClosureAreaQueryVariables>;
export const CreateStationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateStation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateStationInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createStation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"StationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"StationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StationType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"opHour"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"confidenceScore"}},{"kind":"Field","name":{"kind":"Name","value":"isDuplicate"}},{"kind":"Field","name":{"kind":"Name","value":"isTemporary"}},{"kind":"Field","name":{"kind":"Name","value":"isOfficial"}},{"kind":"Field","name":{"kind":"Name","value":"priorityScore"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CreateStationMutation, CreateStationMutationVariables>;
export const UpdateStationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateStation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateStationInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateStation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"StationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"StationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StationType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"opHour"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"confidenceScore"}},{"kind":"Field","name":{"kind":"Name","value":"isDuplicate"}},{"kind":"Field","name":{"kind":"Name","value":"isTemporary"}},{"kind":"Field","name":{"kind":"Name","value":"isOfficial"}},{"kind":"Field","name":{"kind":"Name","value":"priorityScore"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateStationMutation, UpdateStationMutationVariables>;
export const DeleteStationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteStation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteStation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}}]}]}}]} as unknown as DocumentNode<DeleteStationMutation, DeleteStationMutationVariables>;
export const CreateStationPropertyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateStationProperty"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateStationPropertyInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createStationProperty"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"stationUuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyType"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"weightings"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateStationPropertyMutation, CreateStationPropertyMutationVariables>;
export const CreateCrowdSourcingDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateCrowdSourcing"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateCrowdSourcingInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createCrowdSourcing"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"stationUuid"}},{"kind":"Field","name":{"kind":"Name","value":"itemUuid"}},{"kind":"Field","name":{"kind":"Name","value":"rating"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateCrowdSourcingMutation, CreateCrowdSourcingMutationVariables>;
export const GetTicketsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetTickets"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"bounds"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"BoundsInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"status"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"priority"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"skip"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"50"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tickets"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"bounds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"bounds"}}},{"kind":"Argument","name":{"kind":"Name","value":"status"},"value":{"kind":"Variable","name":{"kind":"Name","value":"status"}}},{"kind":"Argument","name":{"kind":"Name","value":"priority"},"value":{"kind":"Variable","name":{"kind":"Name","value":"priority"}}},{"kind":"Argument","name":{"kind":"Name","value":"skip"},"value":{"kind":"Variable","name":{"kind":"Name","value":"skip"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TicketFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"contactName"}},{"kind":"Field","name":{"kind":"Name","value":"contactEmail"}},{"kind":"Field","name":{"kind":"Name","value":"contactPhone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"priority"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetTicketsQuery, GetTicketsQueryVariables>;
export const GetTicketDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetTicket"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ticket"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TicketFields"}},{"kind":"Field","name":{"kind":"Name","value":"photos"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"url"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"tasks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TicketTaskFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"contactName"}},{"kind":"Field","name":{"kind":"Name","value":"contactEmail"}},{"kind":"Field","name":{"kind":"Name","value":"contactPhone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"priority"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketTaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketTaskType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"ticketUuid"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"taskName"}},{"kind":"Field","name":{"kind":"Name","value":"taskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"progressNote"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"moderationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetTicketQuery, GetTicketQueryVariables>;
export const GetTicketTasksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetTicketTasks"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"ticketUuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"status"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"skip"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"50"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"ticketTasks"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"ticketUuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"ticketUuid"}}},{"kind":"Argument","name":{"kind":"Name","value":"status"},"value":{"kind":"Variable","name":{"kind":"Name","value":"status"}}},{"kind":"Argument","name":{"kind":"Name","value":"skip"},"value":{"kind":"Variable","name":{"kind":"Name","value":"skip"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TicketTaskFields"}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"taskUuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"propertyValue"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"assignments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"taskUuid"}},{"kind":"Field","name":{"kind":"Name","value":"actorUuid"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"assignedAt"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketTaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketTaskType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"ticketUuid"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"taskName"}},{"kind":"Field","name":{"kind":"Name","value":"taskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"progressNote"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"moderationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetTicketTasksQuery, GetTicketTasksQueryVariables>;
export const CreateTicketDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateTicket"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateTicketInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createTicket"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TicketFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"contactName"}},{"kind":"Field","name":{"kind":"Name","value":"contactEmail"}},{"kind":"Field","name":{"kind":"Name","value":"contactPhone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"priority"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CreateTicketMutation, CreateTicketMutationVariables>;
export const UpdateTicketDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateTicket"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateTicketInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateTicket"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TicketFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"contactName"}},{"kind":"Field","name":{"kind":"Name","value":"contactEmail"}},{"kind":"Field","name":{"kind":"Name","value":"contactPhone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"priority"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateTicketMutation, UpdateTicketMutationVariables>;
export const CreateTicketTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateTicketTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateTicketTaskInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createTicketTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TicketTaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketTaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketTaskType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"ticketUuid"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"taskName"}},{"kind":"Field","name":{"kind":"Name","value":"taskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"progressNote"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"moderationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CreateTicketTaskMutation, CreateTicketTaskMutationVariables>;
export const UpdateTicketTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateTicketTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateTicketTaskInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateTicketTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TicketTaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketTaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketTaskType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"ticketUuid"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"taskName"}},{"kind":"Field","name":{"kind":"Name","value":"taskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"progressNote"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"moderationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateTicketTaskMutation, UpdateTicketTaskMutationVariables>;
export const CreateTaskPropertyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateTaskProperty"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateTaskPropertyInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createTaskProperty"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"taskUuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"propertyValue"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateTaskPropertyMutation, CreateTaskPropertyMutationVariables>;