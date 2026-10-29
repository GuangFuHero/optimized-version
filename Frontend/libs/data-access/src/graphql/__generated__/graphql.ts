/* eslint-disable */
import { Geometry } from 'geojson';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  /** Date with time (isoformat) */
  DateTime: { input: any; output: any };
  /** GeoJSON geometry object (RFC 7946) */
  GeoJSON: { input: Geometry; output: Geometry };
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](https://ecma-international.org/wp-content/uploads/ECMA-404_2nd_edition_december_2017.pdf). */
  JSON: { input: any; output: any };
  UUID: { input: string; output: string };
};

export const AccessStatus = {
  Accessible: 'accessible',
  Inaccessible: 'inaccessible',
  Restricted: 'restricted',
  Unknown: 'unknown',
} as const;

export type AccessStatus = (typeof AccessStatus)[keyof typeof AccessStatus];
export type AddressLookupType = {
  __typename?: 'AddressLookupType';
  /** Send back with fullAddress on save, within a day, so the address is stored as verified */
  addressToken?: Maybe<Scalars['String']['output']>;
  /** 弄, e.g. '1弄' */
  alley?: Maybe<Scalars['String']['output']>;
  /** A 棟 typed after the 號, split off for the building-section field */
  buildingSection?: Maybe<Scalars['String']['output']>;
  /** 縣市 */
  county?: Maybe<Scalars['String']['output']>;
  /** Metres between the 門牌 and the lat/lng you passed */
  distanceM?: Maybe<Scalars['Float']['output']>;
  /** A 樓 typed after the 號, split off for the floor field */
  floor?: Maybe<Scalars['String']['output']>;
  /** The official address line, e.g. '花蓮縣光復鄉大進村3鄰糖廠街19號'. Send it back unchanged */
  fullAddress?: Maybe<Scalars['String']['output']>;
  /** 巷, e.g. '469巷' */
  lane?: Maybe<Scalars['String']['output']>;
  /** Latitude of the 門牌's official point */
  lat?: Maybe<Scalars['Float']['output']>;
  /** Longitude of the 門牌's official point */
  lng?: Maybe<Scalars['Float']['output']>;
  /** 鄰, e.g. '3鄰' */
  neighborhood?: Maybe<Scalars['String']['output']>;
  /** 號, e.g. '19號' */
  no?: Maybe<Scalars['String']['output']>;
  /** True when the 門牌 is over 500 m from the lat/lng you passed */
  pinMismatch: Scalars['Boolean']['output'];
  /** 路／街／大道 */
  road?: Maybe<Scalars['String']['output']>;
  /** A 室 typed after the 號, split off for the room field */
  room?: Maybe<Scalars['String']['output']>;
  /** 段, e.g. '一段' */
  section?: Maybe<Scalars['String']['output']>;
  /** 'found'; 'not_found'; 'ambiguous' (several addresses match, so add the 鄉鎮市區); or 'unavailable' (TGOS could not answer; saving still works, as unverified) */
  status: Scalars['String']['output'];
  /** 鄉鎮市區 */
  town?: Maybe<Scalars['String']['output']>;
  /** 村里 */
  village?: Maybe<Scalars['String']['output']>;
};

export const AnnouncementFilter = {
  Active: 'ACTIVE',
  All: 'ALL',
  Draft: 'DRAFT',
} as const;

export type AnnouncementFilter =
  (typeof AnnouncementFilter)[keyof typeof AnnouncementFilter];
export const AnnouncementMoveDirection = {
  Down: 'DOWN',
  Up: 'UP',
} as const;

export type AnnouncementMoveDirection =
  (typeof AnnouncementMoveDirection)[keyof typeof AnnouncementMoveDirection];
export const AnnouncementPlacement = {
  AdminPage: 'admin_page',
  All: 'all',
  PublicPage: 'public_page',
} as const;

export type AnnouncementPlacement =
  (typeof AnnouncementPlacement)[keyof typeof AnnouncementPlacement];
export const AnnouncementStatus = {
  Active: 'ACTIVE',
  Draft: 'DRAFT',
  Inactive: 'INACTIVE',
} as const;

export type AnnouncementStatus =
  (typeof AnnouncementStatus)[keyof typeof AnnouncementStatus];
export type AnnouncementType = {
  __typename?: 'AnnouncementType';
  active: Scalars['Boolean']['output'];
  content: Scalars['String']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** Who created it. Null unless the caller holds announcement.edit */
  creator?: Maybe<UserRefType>;
  /** Display position (1 = top) among active announcements; null when inactive */
  order?: Maybe<Scalars['Int']['output']>;
  /** admin_page, public_page, or all (both pages) */
  placement: Scalars['String']['output'];
  /** When it last went live; null while a draft */
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Who last activated it; null while a draft or unless the caller holds announcement.edit */
  publisher?: Maybe<UserRefType>;
  status: AnnouncementStatus;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Who last changed it. Null unless the caller holds announcement.edit */
  updater?: Maybe<UserRefType>;
  uuid: Scalars['UUID']['output'];
};

export type AreaConnection = {
  __typename?: 'AreaConnection';
  items: Array<AreaType>;
  pageInfo: PageInfo;
};

export const AreaKind = {
  HazardousZone: 'hazardous_zone',
  MarkZone: 'mark_zone',
  TeamZone: 'team_zone',
} as const;

export type AreaKind = (typeof AreaKind)[keyof typeof AreaKind];
export type AreaType = {
  __typename?: 'AreaType';
  /** Teams a team zone is assigned to; empty for the other kinds */
  assignedTeams: Array<AssignedTeamType>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** GeoJSON Polygon or MultiPolygon marking the area */
  geometry?: Maybe<Scalars['GeoJSON']['output']>;
  /** Shown on the public map; always true except for a mark zone */
  isPublic: Scalars['Boolean']['output'];
  name?: Maybe<Scalars['String']['output']>;
  note?: Maybe<Scalars['String']['output']>;
  /** 'hazardous_zone', 'team_zone' or 'mark_zone' */
  type: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type AssignedTeamType = {
  __typename?: 'AssignedTeamType';
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
};

export const AuditStatus = {
  AuditIssue: 'audit_issue',
  Audited: 'audited',
  NeedAudit: 'need_audit',
  NoAudit: 'no_audit',
} as const;

export type AuditStatus = (typeof AuditStatus)[keyof typeof AuditStatus];
export const AuditVerdict = {
  AuditIssue: 'audit_issue',
  Audited: 'audited',
} as const;

export type AuditVerdict = (typeof AuditVerdict)[keyof typeof AuditVerdict];
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

export const BriefingState = {
  Briefing: 'BRIEFING',
  Debrief: 'DEBRIEF',
  InField: 'IN_FIELD',
} as const;

export type BriefingState = (typeof BriefingState)[keyof typeof BriefingState];
export const BriefingStatus = {
  Draft: 'DRAFT',
  Published: 'PUBLISHED',
} as const;

export type BriefingStatus =
  (typeof BriefingStatus)[keyof typeof BriefingStatus];
export const BriefingStatusFilter = {
  All: 'ALL',
  Draft: 'DRAFT',
  Published: 'PUBLISHED',
} as const;

export type BriefingStatusFilter =
  (typeof BriefingStatusFilter)[keyof typeof BriefingStatusFilter];
export type BriefingTemplateType = {
  __typename?: 'BriefingTemplateType';
  content: Scalars['String']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who created this template */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** Lifecycle phase: 'briefing', 'in_field', or 'debrief' */
  state: Scalars['String']['output'];
  /** Free-form categorization tags */
  tags: Array<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type BriefingType = {
  __typename?: 'BriefingType';
  content: Scalars['String']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** When it was published; null while a draft */
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Lifecycle phase: 'briefing', 'in_field', or 'debrief' */
  state: Scalars['String']['output'];
  status: BriefingStatus;
  /** Free-form categorization tags */
  tags: Array<Scalars['String']['output']>;
  /** UUID of the source template, or null for ad-hoc briefings */
  templateUuid?: Maybe<Scalars['UUID']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type BuildingFloorAreasInput = {
  /** Area names, 1-20 characters each */
  areas: Array<Scalars['String']['input']>;
  /** Floor label: '3F', '1F', 'B1' */
  floor: Scalars['String']['input'];
};

export type BuildingFloorType = {
  __typename?: 'BuildingFloorType';
  /** Areas a ticket on this floor must pick from, ending with '其他' for an unlisted space. Empty when the floor takes a free-text room number instead */
  areas: Array<Scalars['String']['output']>;
  /** Floor label: '3F', '1F', 'B1' */
  label: Scalars['String']['output'];
};

export type BuildingMapConnection = {
  __typename?: 'BuildingMapConnection';
  items: Array<BuildingMapType>;
  pageInfo: PageInfo;
};

export type BuildingMapType = {
  __typename?: 'BuildingMapType';
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  createdBy?: Maybe<Scalars['String']['output']>;
  /** The building's floors, roof (RF) first */
  floors: Array<BuildingFloorType>;
  floorsAboveGround: Scalars['Int']['output'];
  floorsBelowGround: Scalars['Int']['output'];
  /** GeoJSON Point of the building — [longitude, latitude] */
  geometry?: Maybe<Scalars['GeoJSON']['output']>;
  /** Building name shown on the map and in the sidebar */
  name: Scalars['String']['output'];
  /** The building's street address. Public, like a station's */
  secondaryLocation?: Maybe<SecondaryLocationType>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type CreateAnnouncementInput = {
  /** The announcement body text */
  content: Scalars['String']['input'];
  /** Which page shows it; defaults to both */
  placement?: AnnouncementPlacement;
};

export type CreateAreaInput = {
  /** GeoJSON Polygon or MultiPolygon — must not be a Point */
  geometry: Scalars['GeoJSON']['input'];
  /** Hazardous zone only: agency name or URL the report came from */
  informationSource?: InputMaybe<Scalars['String']['input']>;
  /** Shown on the public map; hazardous and team zones are always public, a mark zone defaults to false */
  isPublic?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  note?: InputMaybe<Scalars['String']['input']>;
  /** Required for a hazardous zone, refused for the other kinds */
  status?: InputMaybe<Scalars['String']['input']>;
  /** Required for a team zone, refused for the other kinds */
  teamUuid?: InputMaybe<Scalars['UUID']['input']>;
  type: AreaKind;
};

export type CreateBriefingTemplateInput = {
  /** The template body text */
  content: Scalars['String']['input'];
  /** Lifecycle phase this template targets */
  state?: BriefingState;
  /** Categorization tags */
  tags?: Array<Scalars['String']['input']>;
};

export type CreateBuildingMapInput = {
  /** Areas per floor. A floor left out takes a free-text room number */
  floorAreas?: Array<BuildingFloorAreasInput>;
  /** Floors from 1F up, 1-200 */
  floorsAboveGround: Scalars['Int']['input'];
  /** Basement floors, 0-20 */
  floorsBelowGround?: Scalars['Int']['input'];
  /** GeoJSON Point — [longitude, latitude] */
  geometry: Scalars['GeoJSON']['input'];
  /** Building name, e.g. '光復國小圖書館' */
  name: Scalars['String']['input'];
  /** Street address. Leave buildingSection, floor and room empty */
  secondaryLocation: SecondaryLocationInput;
};

export type CreateCrowdSourcingInput = {
  /** Distance in meters from the user to the station at time of submission */
  distanceFromGeometry?: InputMaybe<Scalars['Float']['input']>;
  /** UUID of the StationProperty being rated — null for a general station rating */
  itemUuid?: InputMaybe<Scalars['UUID']['input']>;
  /** Rating value: 'up', 'neutral', or 'down' */
  rating: Scalars['String']['input'];
  /** UUID of the station being rated */
  stationUuid: Scalars['UUID']['input'];
};

export type CreateHelpRequestInput = {
  /** Optional; the account's own email is never filled in for it */
  contactEmail?: InputMaybe<Scalars['String']['input']>;
  /** Who to ask for at the place */
  contactName: Scalars['String']['input'];
  /** Phone number or LINE ID, as the person typed it */
  contactPhone?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  /** GeoJSON Point for the location where help is needed — [longitude, latitude] */
  geometry: Scalars['GeoJSON']['input'];
  /** Scene photos as links to images kept elsewhere — the platform stores no image. At most 10, each an https:// URL of at most 500 characters */
  photoUrls?: InputMaybe<Array<Scalars['String']['input']>>;
  /** The address line goes in `fullAddress` (with its `addressToken` if looked up), with `floor` and `room` */
  secondaryLocation?: InputMaybe<SecondaryLocationInput>;
  /** At least one need, at most 20 */
  tasks: Array<HelpRequestTaskInput>;
  /** At most 200 characters */
  title: Scalars['String']['input'];
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
  /** Whether the station is open: 'active' (default), 'temporarily_closed', or 'permanently_closed' */
  operationalStatus?: StationOperationalStatus;
  /** Optional secondary address or pole location to attach to this station */
  secondaryLocation?: InputMaybe<SecondaryLocationInput>;
  /** Data origin: 'user' (default) or 'official' */
  source?: Scalars['String']['input'];
  /** Optional public line on what the station is short of */
  supplyStatus?: InputMaybe<Scalars['String']['input']>;
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
  stationUuid: Scalars['UUID']['input'];
  /** Initial credibility weight [0.0–2.0], default 1.0 */
  weightings?: Scalars['Float']['input'];
};

export type CreateStationResult = DuplicatesSuspected | StationCreated;

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
  taskUuid: Scalars['UUID']['input'];
};

export type CreateTicketInput = {
  /** File the ticket inside this building map. Its point and address are copied onto the ticket, and secondaryLocation.floor (and room, on a floor with areas) must match the building's floors. Omit floor when the reporter doesn't know it */
  buildingMapUuid?: InputMaybe<Scalars['UUID']['input']>;
  /** Optional email for follow-up */
  contactEmail?: InputMaybe<Scalars['String']['input']>;
  /** Full name of the requester */
  contactName: Scalars['String']['input'];
  /** Optional phone number for follow-up */
  contactPhone?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  /** Disaster type keys, e.g. ['flood', 'landslide']. Each must be an active key from `disasterTypes`; an unknown one is rejected rather than stored, because a ticket filed under a disaster that does not exist would show the reporter an empty form */
  disasterTypes?: InputMaybe<Array<Scalars['String']['input']>>;
  /** GeoJSON Point for the location where help is needed — [longitude, latitude]. Required unless buildingMapUuid is given, in which case it must be omitted */
  geometry?: InputMaybe<Scalars['GeoJSON']['input']>;
  /** 立即生命危險. Omit when nobody was asked */
  immediateDangerReported?: InputMaybe<TriState>;
  /** 災民受困／無法自行離開. Omit when nobody was asked */
  personTrappedReported?: InputMaybe<TriState>;
  /** Urgency: 'low' (default), 'medium', 'high', or 'critical' */
  priority?: Scalars['String']['input'];
  /** Street address and space detail for where help is needed. New in feature 018 — before it, only stations could carry one, so the record that most needs a door number had nothing but a map pin */
  secondaryLocation?: InputMaybe<SecondaryLocationInput>;
  /** Type of help: 'rescue', 'supply', 'medical', or 'hr' */
  taskType?: InputMaybe<Scalars['String']['input']>;
  /** The ticket's tasks, created with it in one go (Spec 022 §5.1). Each is checked for duplicates */
  tasks?: Array<CreateTicketTaskDraft>;
  title: Scalars['String']['input'];
};

export type CreateTicketResult = DuplicatesSuspected | TicketCreated;

export type CreateTicketTaskDraft = {
  /** Confirmed not a duplicate of this task (a relatedUuid from DuplicatesSuspected); not checked again */
  acknowledgedDuplicateOf?: InputMaybe<Scalars['String']['input']>;
  /** Number of people or units needed */
  quantity?: InputMaybe<Scalars['Int']['input']>;
  routeUuid?: InputMaybe<Scalars['UUID']['input']>;
  taskDescription?: InputMaybe<Scalars['String']['input']>;
  taskName: Scalars['String']['input'];
  /** Category: 'rescue', 'supply', 'medical', or 'hr' */
  taskType: Scalars['String']['input'];
  visibility?: Visibility;
};

export type CreateTicketTaskInput = {
  /** People or units needed, at least 1; required except for a 'rescue' task, which may omit it */
  quantity?: InputMaybe<Scalars['Int']['input']>;
  /** Optional UUID of an associated route */
  routeUuid?: InputMaybe<Scalars['UUID']['input']>;
  taskDescription?: InputMaybe<Scalars['String']['input']>;
  taskName: Scalars['String']['input'];
  /** Category: 'rescue', 'supply', 'medical', or 'hr' */
  taskType: Scalars['String']['input'];
  /** UUID of the ticket this task belongs to */
  ticketUuid: Scalars['UUID']['input'];
};

export type CreateTicketTaskResult = DuplicatesSuspected | TicketTaskCreated;

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

/** The disaster this deployment responds to, as the public site names it */
export type CurrentDisasterType = {
  __typename?: 'CurrentDisasterType';
  /** Where the site's map opens for this disaster; null when unset, so keep the site's own default */
  mapView?: Maybe<MapViewType>;
  /** Full name, e.g. 花蓮馬太鞍溪堰塞湖專案 */
  name: Scalars['String']['output'];
  /** Short name for tight spots such as the site's top bar, e.g. 花蓮馬太鞍溪; null when unset, so use name */
  shortName?: Maybe<Scalars['String']['output']>;
};

export type DisasterTypeType = {
  __typename?: 'DisasterTypeType';
  /** False retires the type: no new writes, existing ones readable */
  isActive: Scalars['Boolean']['output'];
  /** Immutable lower-case English code, e.g. 'flood'. Referenced as a bare string by tickets and every field config, so it is never renamed — edit `label` instead */
  key: Scalars['String']['output'];
  /** Display name, e.g. '水災' */
  label: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
};

export type DuplicateSuspect = {
  __typename?: 'DuplicateSuspect';
  /** Which part of what was sent: "task:0", "task:1"…, or "station" */
  draftRef: Scalars['String']['output'];
  /** What it looks like: "ticket_task" or "station" */
  relatedKind: Scalars['String']['output'];
  /** When it looks like a task, that task's ticket */
  relatedTicketUuid?: Maybe<Scalars['String']['output']>;
  /** The existing entity it looks like */
  relatedUuid: Scalars['String']['output'];
};

export type DuplicatesSuspected = {
  __typename?: 'DuplicatesSuspected';
  suspects: Array<DuplicateSuspect>;
};

export const FieldDataType = {
  Boolean: 'boolean',
  LongText: 'long_text',
  MultiSelect: 'multi_select',
  Number: 'number',
  SingleSelect: 'single_select',
  Text: 'text',
} as const;

export type FieldDataType = (typeof FieldDataType)[keyof typeof FieldDataType];
export type GenerateBriefingInput = {
  /** Override content; defaults to the template's content */
  content?: InputMaybe<Scalars['String']['input']>;
  /** Override phase; defaults to the template's state */
  state?: InputMaybe<BriefingState>;
  /** Override tags; defaults to the template's tags */
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Source template UUID; null for an ad-hoc briefing */
  templateUuid?: InputMaybe<Scalars['UUID']['input']>;
};

export type HazardousZoneConnection = {
  __typename?: 'HazardousZoneConnection';
  items: Array<HazardousZoneType>;
  pageInfo: PageInfo;
};

export type HazardousZoneType = {
  __typename?: 'HazardousZoneType';
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who drew this zone */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** GeoJSON Polygon or MultiPolygon marking the zone */
  geometry?: Maybe<Scalars['GeoJSON']['output']>;
  /** Source of the hazard report, e.g. agency name or URL */
  informationSource?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  /** Additional notes about this zone */
  note?: Maybe<Scalars['String']['output']>;
  /** Internal polymorphic discriminator — always 'hazardous_zone' */
  propertyName: Scalars['String']['output'];
  /** Current hazard status, e.g. 'dangerous', 'block' */
  status: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type HelpRequestTaskInput = {
  /** Confirmed not a duplicate of this task (a relatedUuid from DuplicatesSuspected); not checked again */
  acknowledgedDuplicateOf?: InputMaybe<Scalars['String']['input']>;
  /** People or units needed, at least 1; required except for a 'rescue' need, which may omit it */
  quantity?: InputMaybe<Scalars['Int']['input']>;
  taskDescription?: InputMaybe<Scalars['String']['input']>;
  /** What is needed, at most 200 characters */
  taskName: Scalars['String']['input'];
  /** What the need asks for */
  taskType: NeedKind;
};

/** Where the site's map opens: a centre and a zoom */
export type MapViewType = {
  __typename?: 'MapViewType';
  /** Latitude of the centre, e.g. 23.67 */
  lat: Scalars['Float']['output'];
  /** Longitude of the centre, e.g. 121.418 */
  lng: Scalars['Float']['output'];
  /** Zoom level, 7 to 18 as the site's map allows, e.g. 14 */
  zoom: Scalars['Int']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  assignStationToTeam: StationType;
  assignTaskActor: TaskAssignmentType;
  assignZoneToTeam: ZoneAssignmentType;
  attachStationPhoto: PhotoType;
  auditTicket: TicketType;
  createAnnouncement: AnnouncementType;
  createArea: AreaType;
  createBriefingTemplate: BriefingTemplateType;
  createBuildingMap: BuildingMapType;
  createCrowdSourcing: CrowdSourcingType;
  createHelpRequest: CreateTicketResult;
  createStation: CreateStationResult;
  createStationProperty: StationPropertyType;
  createStationSuggestion: StationSuggestionType;
  createTaskProperty: TaskPropertyType;
  createTicket: CreateTicketResult;
  createTicketTask: CreateTicketTaskResult;
  deleteAnnouncement: Scalars['Boolean']['output'];
  deleteArea: Scalars['Boolean']['output'];
  deleteBriefing: Scalars['Boolean']['output'];
  deleteBriefingTemplate: Scalars['Boolean']['output'];
  deleteBuildingMap: Scalars['Boolean']['output'];
  deleteStation: Scalars['Boolean']['output'];
  deleteTicket: Scalars['Boolean']['output'];
  deleteTicketTask: Scalars['Boolean']['output'];
  detachStationPhoto: Scalars['Boolean']['output'];
  generateBriefing: BriefingType;
  mergeStationSuggestions: StationSuggestionMergeType;
  moveAnnouncement: AnnouncementType;
  promoteMarkZone: HazardousZoneType;
  removeZoneFromTeam: Scalars['Boolean']['output'];
  revokeStationSuggestionMerge: StationSuggestionMergeType;
  setAnnouncementActive: AnnouncementType;
  setTicketDisasterDetails: Array<TicketDisasterDetailType>;
  stopRecruiting: TicketTaskType;
  submitRoleRequest: RoleRequestType;
  unassignStation: StationType;
  unassignTaskActor: Scalars['Boolean']['output'];
  updateAnnouncement: AnnouncementType;
  updateArea: AreaType;
  updateBriefing: BriefingType;
  updateBriefingTemplate: BriefingTemplateType;
  updateBuildingMap: BuildingMapType;
  updateStation: StationType;
  updateStationProperty: StationPropertyType;
  updateTaskAssignment: TaskAssignmentType;
  updateTaskProperty: TaskPropertyType;
  updateTicket: TicketType;
  updateTicketTask: TicketTaskType;
  upsertDisasterType: DisasterTypeType;
  upsertStationPropertyConfig: StationPropertyConfigType;
  upsertTaskPropertyConfig: TaskPropertyConfigType;
  upsertTicketPropertyConfig: TicketPropertyConfigType;
  withdrawRoleRequest: RoleRequestType;
};

export type MutationAssignStationToTeamArgs = {
  stationUuid: Scalars['UUID']['input'];
  teamUuid: Scalars['UUID']['input'];
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

export type MutationAuditTicketArgs = {
  contentHash: Scalars['String']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
  status: AuditVerdict;
  uuid: Scalars['UUID']['input'];
};

export type MutationCreateAnnouncementArgs = {
  input: CreateAnnouncementInput;
};

export type MutationCreateAreaArgs = {
  input: CreateAreaInput;
};

export type MutationCreateBriefingTemplateArgs = {
  input: CreateBriefingTemplateInput;
};

export type MutationCreateBuildingMapArgs = {
  input: CreateBuildingMapInput;
};

export type MutationCreateCrowdSourcingArgs = {
  input: CreateCrowdSourcingInput;
};

export type MutationCreateHelpRequestArgs = {
  input: CreateHelpRequestInput;
};

export type MutationCreateStationArgs = {
  acknowledgedDuplicateOf?: InputMaybe<Scalars['String']['input']>;
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
  acknowledgedDuplicateOf?: InputMaybe<Scalars['String']['input']>;
  input: CreateTicketTaskInput;
};

export type MutationDeleteAnnouncementArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationDeleteAreaArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationDeleteBriefingArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationDeleteBriefingTemplateArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationDeleteBuildingMapArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationDeleteStationArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationDeleteTicketArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationDeleteTicketTaskArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationDetachStationPhotoArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationGenerateBriefingArgs = {
  input: GenerateBriefingInput;
};

export type MutationMergeStationSuggestionsArgs = {
  decisions: Array<SuggestionDecisionInput>;
  reviewNote?: InputMaybe<Scalars['String']['input']>;
  stationUuid: Scalars['UUID']['input'];
};

export type MutationMoveAnnouncementArgs = {
  direction: AnnouncementMoveDirection;
  uuid: Scalars['UUID']['input'];
};

export type MutationPromoteMarkZoneArgs = {
  input: PromoteMarkZoneInput;
  uuid: Scalars['UUID']['input'];
};

export type MutationRemoveZoneFromTeamArgs = {
  input: ZoneTeamAssignmentInput;
};

export type MutationRevokeStationSuggestionMergeArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationSetAnnouncementActiveArgs = {
  active: Scalars['Boolean']['input'];
  uuid: Scalars['UUID']['input'];
};

export type MutationSetTicketDisasterDetailsArgs = {
  details: Array<TicketDisasterDetailInput>;
  uuid: Scalars['UUID']['input'];
};

export type MutationStopRecruitingArgs = {
  taskUuid: Scalars['UUID']['input'];
};

export type MutationSubmitRoleRequestArgs = {
  input: SubmitRoleRequestInput;
};

export type MutationUnassignStationArgs = {
  stationUuid: Scalars['UUID']['input'];
};

export type MutationUnassignTaskActorArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationUpdateAnnouncementArgs = {
  input: UpdateAnnouncementInput;
  uuid: Scalars['UUID']['input'];
};

export type MutationUpdateAreaArgs = {
  input: UpdateAreaInput;
  uuid: Scalars['UUID']['input'];
};

export type MutationUpdateBriefingArgs = {
  input: UpdateBriefingInput;
  uuid: Scalars['UUID']['input'];
};

export type MutationUpdateBriefingTemplateArgs = {
  input: UpdateBriefingTemplateInput;
  uuid: Scalars['UUID']['input'];
};

export type MutationUpdateBuildingMapArgs = {
  input: UpdateBuildingMapInput;
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

export type MutationUpsertDisasterTypeArgs = {
  input: UpsertDisasterTypeInput;
};

export type MutationUpsertStationPropertyConfigArgs = {
  input: UpsertPropertyConfigInput;
  stationType: Scalars['String']['input'];
};

export type MutationUpsertTaskPropertyConfigArgs = {
  input: UpsertPropertyConfigInput;
  taskType: Scalars['String']['input'];
};

export type MutationUpsertTicketPropertyConfigArgs = {
  input: UpsertTicketPropertyConfigInput;
};

export type MutationWithdrawRoleRequestArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MyRoleRequestsType = {
  __typename?: 'MyRoleRequestsType';
  /** May send an application now: none pending and not paused. A back-office identity rules out only the data auditor choice (ADR-351) */
  canApply: Scalars['Boolean']['output'];
  /** Holds a role beyond `user`: the entry offers 前往後台 instead of applying */
  hasBackofficeIdentity: Scalars['Boolean']['output'];
  /** Newest first */
  requests: Array<RoleRequestType>;
};

/** One of the caller's claims, with the need and the ticket it is for */
export type MyTaskAssignmentType = {
  __typename?: 'MyTaskAssignmentType';
  assignment: TaskAssignmentType;
  task: TicketTaskType;
  ticket: TicketType;
};

export const NeedKind = {
  Hr: 'hr',
  Medical: 'medical',
  Rescue: 'rescue',
  Supply: 'supply',
} as const;

export type NeedKind = (typeof NeedKind)[keyof typeof NeedKind];
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

export type PromoteMarkZoneInput = {
  informationSource?: InputMaybe<Scalars['String']['input']>;
  status: Scalars['String']['input'];
};

export type Query = {
  __typename?: 'Query';
  announcement?: Maybe<AnnouncementType>;
  announcements: Array<AnnouncementType>;
  areas: AreaConnection;
  briefing?: Maybe<BriefingType>;
  briefingTemplate?: Maybe<BriefingTemplateType>;
  briefingTemplates: Array<BriefingTemplateType>;
  briefings: Array<BriefingType>;
  buildingMap?: Maybe<BuildingMapType>;
  buildingMapTickets: Array<TicketType>;
  buildingMaps: BuildingMapConnection;
  /** The deployment's disaster, readable without signing in; null until first configured */
  currentDisaster?: Maybe<CurrentDisasterType>;
  disasterTypes: Array<DisasterTypeType>;
  hazardousZone?: Maybe<HazardousZoneType>;
  hazardousZones: HazardousZoneConnection;
  myRoleRequests: MyRoleRequestsType;
  myTaskAssignments: Array<MyTaskAssignmentType>;
  myTickets: Array<TicketType>;
  /** Look a typed address up in TGOS before saving it (exact matches only). Pass the map pin as lat/lng to check the two agree. Signed-in callers only, 30 lookups a minute shared with reverseGeocode */
  normalizeAddress: AddressLookupType;
  /** The nearest 門牌 to a map pin, within 500 m. Signed-in callers only, 30 lookups a minute shared with normalizeAddress */
  reverseGeocode: AddressLookupType;
  roleRequestTeams: Array<RoleRequestTeam>;
  station?: Maybe<StationType>;
  stationPropertyConfigs: Array<StationPropertyConfigType>;
  stations: StationConnection;
  suggestableFields: Array<SuggestableFieldType>;
  taskProperties: Array<TaskPropertyType>;
  taskPropertyConfigs: Array<TaskPropertyConfigType>;
  teamZone?: Maybe<TeamZoneType>;
  teamZones: TeamZoneConnection;
  ticket?: Maybe<TicketType>;
  ticketPropertyConfigs: Array<TicketPropertyConfigType>;
  ticketTasks: Array<TicketTaskType>;
  tickets: TicketConnection;
  zonesByTeam: TeamZoneConnection;
};

export type QueryAnnouncementArgs = {
  uuid: Scalars['UUID']['input'];
};

export type QueryAnnouncementsArgs = {
  filter?: AnnouncementFilter;
  placement?: AnnouncementPlacement;
};

export type QueryAreasArgs = {
  bounds?: InputMaybe<BoundsInput>;
  includePrivate?: Scalars['Boolean']['input'];
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
};

export type QueryBriefingArgs = {
  uuid: Scalars['UUID']['input'];
};

export type QueryBriefingTemplateArgs = {
  uuid: Scalars['UUID']['input'];
};

export type QueryBriefingTemplatesArgs = {
  state?: InputMaybe<BriefingState>;
  tag?: InputMaybe<Scalars['String']['input']>;
};

export type QueryBriefingsArgs = {
  state?: InputMaybe<BriefingState>;
  status?: BriefingStatusFilter;
  tag?: InputMaybe<Scalars['String']['input']>;
};

export type QueryBuildingMapArgs = {
  uuid: Scalars['UUID']['input'];
};

export type QueryBuildingMapTicketsArgs = {
  buildingMapUuid: Scalars['UUID']['input'];
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
};

export type QueryBuildingMapsArgs = {
  bounds?: InputMaybe<BoundsInput>;
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
};

export type QueryDisasterTypesArgs = {
  includeInactive?: Scalars['Boolean']['input'];
};

export type QueryHazardousZoneArgs = {
  uuid: Scalars['UUID']['input'];
};

export type QueryHazardousZonesArgs = {
  bounds?: InputMaybe<BoundsInput>;
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
};

export type QueryNormalizeAddressArgs = {
  address: Scalars['String']['input'];
  lat?: InputMaybe<Scalars['Float']['input']>;
  lng?: InputMaybe<Scalars['Float']['input']>;
};

export type QueryReverseGeocodeArgs = {
  lat: Scalars['Float']['input'];
  lng: Scalars['Float']['input'];
};

export type QueryRoleRequestTeamsArgs = {
  type?: InputMaybe<RoleRequestTeamType>;
};

export type QueryStationArgs = {
  uuid: Scalars['UUID']['input'];
};

export type QueryStationPropertyConfigsArgs = {
  includeInactive?: Scalars['Boolean']['input'];
  stationType: Scalars['String']['input'];
};

export type QueryStationsArgs = {
  assignedTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  bounds?: InputMaybe<BoundsInput>;
  hasPendingSuggestions?: Scalars['Boolean']['input'];
  limit?: Scalars['Int']['input'];
  operationalStatus?: InputMaybe<StationOperationalStatus>;
  q?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  stationType?: InputMaybe<Scalars['String']['input']>;
  unassignedOnly?: Scalars['Boolean']['input'];
};

export type QuerySuggestableFieldsArgs = {
  targetType: Scalars['String']['input'];
};

export type QueryTaskPropertiesArgs = {
  taskUuid: Scalars['String']['input'];
};

export type QueryTaskPropertyConfigsArgs = {
  includeInactive?: Scalars['Boolean']['input'];
  taskType: Scalars['String']['input'];
};

export type QueryTeamZoneArgs = {
  uuid: Scalars['UUID']['input'];
};

export type QueryTeamZonesArgs = {
  bounds?: InputMaybe<BoundsInput>;
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
};

export type QueryTicketArgs = {
  uuid: Scalars['UUID']['input'];
  zoom?: InputMaybe<Scalars['Float']['input']>;
};

export type QueryTicketPropertyConfigsArgs = {
  disasterTypes: Array<Scalars['String']['input']>;
  includeInactive?: Scalars['Boolean']['input'];
};

export type QueryTicketTasksArgs = {
  limit?: Scalars['Int']['input'];
  q?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  ticketUuid: Scalars['String']['input'];
};

export type QueryTicketsArgs = {
  auditStatus?: InputMaybe<AuditStatus>;
  bounds?: InputMaybe<BoundsInput>;
  limit?: Scalars['Int']['input'];
  needType?: InputMaybe<Scalars['String']['input']>;
  openNeedsOnly?: Scalars['Boolean']['input'];
  priority?: InputMaybe<Scalars['String']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  zoom?: InputMaybe<Scalars['Float']['input']>;
};

export type QueryZonesByTeamArgs = {
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
  teamUuid: Scalars['UUID']['input'];
};

export const RoleRequestRole = {
  DataAuditor: 'data_auditor',
  Government: 'government',
  Ngo: 'ngo',
} as const;

export type RoleRequestRole =
  (typeof RoleRequestRole)[keyof typeof RoleRequestRole];
export const RoleRequestStatus = {
  Approved: 'approved',
  Pending: 'pending',
  Rejected: 'rejected',
  Withdrawn: 'withdrawn',
} as const;

export type RoleRequestStatus =
  (typeof RoleRequestStatus)[keyof typeof RoleRequestStatus];
export type RoleRequestTeam = {
  __typename?: 'RoleRequestTeam';
  name: Scalars['String']['output'];
  type: RoleRequestTeamType;
  uuid: Scalars['UUID']['output'];
};

export const RoleRequestTeamType = {
  Gov: 'GOV',
  Ngo: 'NGO',
} as const;

export type RoleRequestTeamType =
  (typeof RoleRequestTeamType)[keyof typeof RoleRequestTeamType];
export type RoleRequestType = {
  __typename?: 'RoleRequestType';
  applicantEmail?: Maybe<Scalars['String']['output']>;
  applicantName?: Maybe<Scalars['String']['output']>;
  /** Masked */
  applicantPhone?: Maybe<Scalars['String']['output']>;
  /** When it was approved, rejected or withdrawn */
  closedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Spec 019 only; no longer sent (ADR-355) */
  contact?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** The team a new-team application founds */
  newTeamName?: Maybe<Scalars['String']['output']>;
  reason: Scalars['String']['output'];
  requestedRole: RoleRequestRole;
  /** The reviewer's reply, if any */
  reviewNote?: Maybe<Scalars['String']['output']>;
  status: RoleRequestStatus;
  /** The existing team a member request asks to join */
  team?: Maybe<RoleRequestTeam>;
  uuid: Scalars['UUID']['output'];
  /** Sent through a team's invite link */
  viaInvite: Scalars['Boolean']['output'];
};

export type SecondaryLocationInput = {
  /** Whether the space can be entered right now */
  accessStatus?: InputMaybe<AccessStatus>;
  /** The addressToken from the same lookup. With it, and fullAddress unchanged, the address is stored as verified; without it, as unverified */
  addressToken?: InputMaybe<Scalars['String']['input']>;
  /** 樓棟／區域, e.g. 'A棟'; leave empty if unknown */
  buildingSection?: InputMaybe<Scalars['String']['input']>;
  /** Floor label: 'B1', '1F', 'RF'. Free text on purpose */
  floor?: InputMaybe<Scalars['String']['input']>;
  /** The address line, ideally exactly as normalizeAddress or reverseGeocode returned it. The backend splits it into county … no; a 樓/室 at its end fills floor and room when those are empty */
  fullAddress?: InputMaybe<Scalars['String']['input']>;
  /** 地標補充 — entrance, landmark, building, which side of the road */
  landmarkNote?: InputMaybe<Scalars['String']['input']>;
  /** Type of secondary location: 'address' (default) or 'pole' */
  locationType?: Scalars['String']['input'];
  poleId?: InputMaybe<Scalars['String']['input']>;
  poleNote?: InputMaybe<Scalars['String']['input']>;
  poleType?: InputMaybe<Scalars['String']['input']>;
  /** 房號／空間, e.g. '302', '樓梯間' */
  room?: InputMaybe<Scalars['String']['input']>;
  /** 空間描述, e.g. '三房兩廳' */
  spaceDescription?: InputMaybe<Scalars['String']['input']>;
  /** 求救者所在空間, e.g. '主臥衣櫃' */
  victimSpace?: InputMaybe<Scalars['String']['input']>;
};

export type SecondaryLocationType = {
  __typename?: 'SecondaryLocationType';
  /** Whether the space can be entered: 'accessible', 'restricted', 'inaccessible', 'unknown'. A current observation, not a safety certification */
  accessStatus?: Maybe<Scalars['String']['output']>;
  /** 弄, e.g. '1弄' */
  alley?: Maybe<Scalars['String']['output']>;
  /** 樓棟／區域, e.g. 'A棟', '東翼' */
  buildingSection?: Maybe<Scalars['String']['output']>;
  /** 縣市, e.g. '花蓮縣' */
  county?: Maybe<Scalars['String']['output']>;
  /** Floor label as spoken: 'B1', '1F', 'RF' — never coerced to a number */
  floor?: Maybe<Scalars['String']['output']>;
  /** The whole address line, without floor or room: official when TGOS confirmed it, as typed otherwise */
  fullAddress?: Maybe<Scalars['String']['output']>;
  /** UUID of the parent station or ticket this location belongs to */
  geometryUuid: Scalars['String']['output'];
  /** 地標補充 — how to find the entrance when coordinates are not enough */
  landmarkNote?: Maybe<Scalars['String']['output']>;
  /** 巷, e.g. '469巷' */
  lane?: Maybe<Scalars['String']['output']>;
  /** Type of secondary location: 'address' or 'pole' */
  locationType: Scalars['String']['output'];
  /** 鄰, e.g. '3鄰' */
  neighborhood?: Maybe<Scalars['String']['output']>;
  /** 號, e.g. '19號' or '19之1號' */
  no?: Maybe<Scalars['String']['output']>;
  /** 'verified' (TGOS confirmed the address near the pin), 'pin_mismatch' (confirmed, but over 500 m from the pin) or 'unverified'; null when there is no address */
  normalizationStatus?: Maybe<Scalars['String']['output']>;
  /** Utility pole identifier (only set when location_type is 'pole') */
  poleId?: Maybe<Scalars['String']['output']>;
  /** Additional notes about the pole location */
  poleNote?: Maybe<Scalars['String']['output']>;
  /** Type of utility pole, e.g. '電線桿' (electricity pole), '電話線桿' (telephone pole) */
  poleType?: Maybe<Scalars['String']['output']>;
  /** 路／街／大道, e.g. '糖廠街' */
  road?: Maybe<Scalars['String']['output']>;
  /** 房號／空間, e.g. '302', '樓梯間' */
  room?: Maybe<Scalars['String']['output']>;
  /** 段, e.g. '一段' */
  section?: Maybe<Scalars['String']['output']>;
  /** 空間描述, e.g. '三房兩廳' */
  spaceDescription?: Maybe<Scalars['String']['output']>;
  /** 鄉鎮市區, e.g. '光復鄉' */
  town?: Maybe<Scalars['String']['output']>;
  uuid: Scalars['UUID']['output'];
  /** 求救者所在空間, e.g. '主臥衣櫃' */
  victimSpace?: Maybe<Scalars['String']['output']>;
  /** 村里, e.g. '大進村' */
  village?: Maybe<Scalars['String']['output']>;
};

export type StationConnection = {
  __typename?: 'StationConnection';
  items: Array<StationType>;
  pageInfo: PageInfo;
};

export type StationCreated = {
  __typename?: 'StationCreated';
  station: StationType;
};

export const StationOperationalStatus = {
  Active: 'active',
  PermanentlyClosed: 'permanently_closed',
  TemporarilyClosed: 'temporarily_closed',
} as const;

export type StationOperationalStatus =
  (typeof StationOperationalStatus)[keyof typeof StationOperationalStatus];
export type StationPropertyConfigType = {
  __typename?: 'StationPropertyConfigType';
  /** Which control the form renders for this field */
  dataType: FieldDataType;
  /** Disaster types this field is enabled for; empty means every type */
  disasterTypes: Array<Scalars['String']['output']>;
  /** Text to render: the label, falling back to property_name */
  displayLabel: Scalars['String']['output'];
  /** Allowed values for single_select / multi_select, e.g. ['available', 'depleted'] */
  enumOptions?: Maybe<Array<Scalars['String']['output']>>;
  /** Whether the field is in use */
  isActive: Scalars['Boolean']['output'];
  /** Display text; null when no custom label has been set */
  label?: Maybe<Scalars['String']['output']>;
  /** The property key this config defines, e.g. 'water', 'food_ration' */
  propertyName: Scalars['String']['output'];
  /** Field order within the form */
  sortOrder: Scalars['Int']['output'];
  /** The station type this config applies to, or 'all' for universal properties */
  stationType: Scalars['String']['output'];
  /** Unit suffix for a number field, e.g. 'cm'; null otherwise */
  unit?: Maybe<Scalars['String']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type StationPropertyType = {
  __typename?: 'StationPropertyType';
  comment?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who added this property */
  createdBy?: Maybe<Scalars['String']['output']>;
  crowdSourcings: Array<CrowdSourcingType>;
  /** Fields of this property with a suggested edit awaiting review. Names only, so public. */
  pendingSuggestedFields: Array<Scalars['String']['output']>;
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

export type StationSuggestionMergeType = {
  __typename?: 'StationSuggestionMergeType';
  changes: Array<SuggestionChangeType>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  reviewNote?: Maybe<Scalars['String']['output']>;
  /** UUID of the reviewer; null once their account is gone, as a mock one is after a SEED_MOCK run (ADR-393) */
  reviewedBy?: Maybe<Scalars['String']['output']>;
  revokedAt?: Maybe<Scalars['DateTime']['output']>;
  revokedBy?: Maybe<Scalars['String']['output']>;
  stationUuid: Scalars['String']['output'];
  /** 'applied' or 'revoked' */
  status: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
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
  /** 'pending', 'approved', 'rejected', or 'revoked' */
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
  /** The team that runs this station, or null when unassigned (ADR-285). Public: which organisation runs a station is not protected. Only the team's uuid, name and type show — never its members. */
  assignedTeam?: Maybe<AssignedTeamType>;
  /** Internal admin comment, not shown to the public */
  comment?: Maybe<Scalars['String']['output']>;
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
  /** Whether the station is open: 'active', 'temporarily_closed', or 'permanently_closed' */
  operationalStatus: Scalars['String']['output'];
  /** Fields of this station with a suggested edit awaiting review. Names only, so public. */
  pendingSuggestedFields: Array<Scalars['String']['output']>;
  photos: Array<PhotoType>;
  properties: Array<StationPropertyType>;
  /** Internal polymorphic discriminator — always 'station' */
  propertyName: Scalars['String']['output'];
  secondaryLocation?: Maybe<SecondaryLocationType>;
  /** Data source of this record: 'user' or 'official' */
  source?: Maybe<Scalars['String']['output']>;
  /** When operational_status last changed */
  statusChangedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Pending suggestions on this station and its properties, pooled per field; empty without station.review over this station */
  suggestedFields: Array<SuggestedFieldType>;
  /** Merges applied to this station, newest first; empty without station.review over this station */
  suggestionMerges: Array<StationSuggestionMergeType>;
  /** What the station is short of, in free text, e.g. '飲用水見底、尿布尚有存量'. Public (ADR-333) */
  supplyStatus?: Maybe<Scalars['String']['output']>;
  /** When supply_status last changed; null while it has never been set */
  supplyStatusUpdatedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Station category, e.g. 'shelter', 'supply', 'medical' */
  type?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
  /** Review state: 'unverified', 'ai_verified', or 'human_verified' */
  verificationStatus?: Maybe<Scalars['String']['output']>;
  /** Who can see this station: 'public' or 'restricted' */
  visibility?: Maybe<Scalars['String']['output']>;
};

export type SubmitRoleRequestInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  newTeamName?: InputMaybe<Scalars['String']['input']>;
  reason: Scalars['String']['input'];
  requestedRole: RoleRequestRole;
  teamUuid?: InputMaybe<Scalars['UUID']['input']>;
};

export type SuggestableFieldType = {
  __typename?: 'SuggestableFieldType';
  /** Input widget hint: 'string', 'integer', or 'enum' */
  dataType: Scalars['String']['output'];
  /** Allowed values when data_type is 'enum', else null */
  enumOptions?: Maybe<Array<Scalars['String']['output']>>;
  fieldName: Scalars['String']['output'];
};

export type SuggestedFieldType = {
  __typename?: 'SuggestedFieldType';
  comments: Array<Scalars['String']['output']>;
  fieldName: Scalars['String']['output'];
  firstSuggestedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Distinct proposed values, newest first */
  proposedValues: Array<Scalars['String']['output']>;
  suggestionCount: Scalars['Int']['output'];
  targetType: Scalars['String']['output'];
  targetUuid: Scalars['String']['output'];
};

export type SuggestionChangeType = {
  __typename?: 'SuggestionChangeType';
  after?: Maybe<Scalars['String']['output']>;
  before?: Maybe<Scalars['String']['output']>;
  fieldName: Scalars['String']['output'];
  targetType: Scalars['String']['output'];
  targetUuid: Scalars['String']['output'];
};

export type SuggestionDecisionInput = {
  approve: Scalars['Boolean']['input'];
  fieldName: Scalars['String']['input'];
  /** The station, or one of its properties */
  targetUuid: Scalars['UUID']['input'];
  /** Value to write, possibly edited by the reviewer; required to approve */
  value?: InputMaybe<Scalars['String']['input']>;
};

export const TaskAssignmentStatus = {
  Accepted: 'accepted',
  Completed: 'completed',
  EnRoute: 'en_route',
} as const;

export type TaskAssignmentStatus =
  (typeof TaskAssignmentStatus)[keyof typeof TaskAssignmentStatus];
export type TaskAssignmentType = {
  __typename?: 'TaskAssignmentType';
  /** Display name of the assigned person. Null to a caller without ticket.view_history on the parent ticket, unless the assignment is their own */
  actorName?: Maybe<Scalars['String']['output']>;
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
  /** Which control the form renders for this field */
  dataType: FieldDataType;
  /** Disaster types this field is enabled for; empty means every type */
  disasterTypes: Array<Scalars['String']['output']>;
  /** Text to render: the label, falling back to property_name */
  displayLabel: Scalars['String']['output'];
  /** Allowed values for single_select / multi_select */
  enumOptions?: Maybe<Array<Scalars['String']['output']>>;
  /** Whether the field is in use */
  isActive: Scalars['Boolean']['output'];
  /** Display text; null when no custom label has been set */
  label?: Maybe<Scalars['String']['output']>;
  /** The property key this config defines */
  propertyName: Scalars['String']['output'];
  /** Field order within the form */
  sortOrder: Scalars['Int']['output'];
  /** The task type this config applies to */
  taskType: Scalars['String']['output'];
  /** Unit suffix for a number field, e.g. 'cm'; null otherwise */
  unit?: Maybe<Scalars['String']['output']>;
  uuid: Scalars['UUID']['output'];
};

export const TaskPropertyStatus = {
  Fulfilled: 'fulfilled',
  Pending: 'pending',
} as const;

export type TaskPropertyStatus =
  (typeof TaskPropertyStatus)[keyof typeof TaskPropertyStatus];
export type TaskPropertyType = {
  __typename?: 'TaskPropertyType';
  /** Optional notes about this property. Null to a caller without ticket.view_detail on the parent ticket */
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

export type TeamZoneConnection = {
  __typename?: 'TeamZoneConnection';
  items: Array<TeamZoneType>;
  pageInfo: PageInfo;
};

export type TeamZoneType = {
  __typename?: 'TeamZoneType';
  /** Teams this zone has been delegated to */
  assignedTeams: Array<AssignedTeamType>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the gov user who drew this zone */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** GeoJSON Polygon or MultiPolygon marking the zone boundary */
  geometry?: Maybe<Scalars['GeoJSON']['output']>;
  /** Always true: a team zone and its teams are shown on the public map */
  isPublic: Scalars['Boolean']['output'];
  name?: Maybe<Scalars['String']['output']>;
  note?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

/** One field that differs from the content the last verdict was given on */
export type TicketAuditChangeType = {
  __typename?: 'TicketAuditChangeType';
  /** Its value when audited; null if it is new */
  auditedValue?: Maybe<Scalars['JSON']['output']>;
  currentValue?: Maybe<Scalars['JSON']['output']>;
  /** 'ticket', 'secondary_location', 'disaster_detail', 'task' or 'task_property' */
  entity: Scalars['String']['output'];
  /** The row it is on; the ticket's own uuid for its address and disaster answers */
  entityUuid: Scalars['String']['output'];
  /** Column name, or the disaster field's property name */
  field: Scalars['String']['output'];
};

/** One move of a ticket's audit status */
export type TicketAuditEntryType = {
  __typename?: 'TicketAuditEntryType';
  actorName?: Maybe<Scalars['String']['output']>;
  /** Who moved it; null for the scan */
  actorUuid?: Maybe<Scalars['String']['output']>;
  at: Scalars['DateTime']['output'];
  /** What moved it: 'verdict' (an auditor's), 'scan' (picked out for checking) or 'content_change' (a change that voided the verdict) */
  kind: Scalars['String']['output'];
  /** The auditor's note; set on a verdict only */
  note?: Maybe<Scalars['String']['output']>;
  /** The audit status it moved to */
  status: Scalars['String']['output'];
};

export type TicketConnection = {
  __typename?: 'TicketConnection';
  items: Array<TicketType>;
  pageInfo: PageInfo;
};

export type TicketCreated = {
  __typename?: 'TicketCreated';
  tasks: Array<TicketTaskType>;
  ticket: TicketType;
};

export type TicketDisasterDetailInput = {
  /** The field key from `ticketPropertyConfigs` */
  propertyName: Scalars['String']['input'];
  /** Selected values. One entry for a single-valued field, several for multi_select, [] to clear the field */
  values: Array<Scalars['String']['input']>;
};

export type TicketDisasterDetailType = {
  __typename?: 'TicketDisasterDetailType';
  /** The field key, matching a `ticketPropertyConfigs` entry */
  propertyName: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
  /** One selected value. Numbers arrive as strings — the config's dataType says how to read it */
  value: Scalars['String']['output'];
};

export type TicketPropertyConfigType = {
  __typename?: 'TicketPropertyConfigType';
  /** Which control the form renders for this field */
  dataType: FieldDataType;
  /** Disaster type keys this field is enabled for; empty means every type */
  disasterTypes: Array<Scalars['String']['output']>;
  /** Text to render: the label, falling back to property_name */
  displayLabel: Scalars['String']['output'];
  /** Allowed values for single_select / multi_select */
  enumOptions?: Maybe<Array<Scalars['String']['output']>>;
  /** Guidance shown under the field, including safety limits such as 「不可為了量測進入危險區」. Render it — some of these tell a reporter not to take a risk */
  hint?: Maybe<Scalars['String']['output']>;
  /** Whether the field is in use */
  isActive: Scalars['Boolean']['output'];
  /** Display text; null when no custom label has been set */
  label?: Maybe<Scalars['String']['output']>;
  /** The immutable field key, e.g. 'water_depth_cm', 'access_blocked' */
  propertyName: Scalars['String']['output'];
  /** Unit suffix for a number field, e.g. 'cm', 'mm' */
  unit?: Maybe<Scalars['String']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type TicketTaskCreated = {
  __typename?: 'TicketTaskCreated';
  task: TicketTaskType;
};

export type TicketTaskType = {
  __typename?: 'TicketTaskType';
  assignedCount: Scalars['Int']['output'];
  /** Everyone who claimed this task. Empty to a caller without ticket.view_history on the parent ticket — assignedCount stays public, and a caller's own claim is myAssignment */
  assignments: Array<TaskAssignmentType>;
  completedCount: Scalars['Int']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who created this task. Null to a caller without ticket.view_detail on the parent ticket */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** The caller's own claim on this task. Null to a guest or a non-claimant */
  myAssignment?: Maybe<TaskAssignmentType>;
  progress?: Maybe<Scalars['Float']['output']>;
  /** Current progress update written by the assignee. Null to a caller without ticket.view_detail on the parent ticket */
  progressNote?: Maybe<Scalars['String']['output']>;
  properties: Array<TaskPropertyType>;
  /** Number of people or units needed. Null means unspecified and uncapped: a rescue need may leave it out, and needs filed before every other kind had to give one */
  quantity?: Maybe<Scalars['Int']['output']>;
  /** When the requester stopped recruiting for this need by hand (stopRecruiting); null if they never did — a need that filled by itself is fulfilled with no such time. Once set, nobody on the need can give their place back */
  recruitingStoppedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Origin of this task: 'user' or 'official' */
  source: Scalars['String']['output'];
  /** Lifecycle state: 'pending' (recruiting), 'fulfilled' (has everyone it asked for, or its requester stopped recruiting — the people on it still go), or 'canceled'. Moves only through assignTaskActor, unassignTaskActor, stopRecruiting and deletion */
  status: Scalars['String']['output'];
  /** Detailed task instructions or context. Null to a caller without ticket.view_detail on the parent ticket */
  taskDescription?: Maybe<Scalars['String']['output']>;
  /** Short name summarising the task */
  taskName: Scalars['String']['output'];
  /** Category of task: 'rescue', 'supply', 'medical', or 'hr' */
  taskType: Scalars['String']['output'];
  /** UUID of the parent ticket this task belongs to */
  ticketUuid: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

export type TicketType = {
  __typename?: 'TicketType';
  /** A fingerprint of the ticket's content as it now stands, to pass back to auditTicket so the verdict is refused if the ticket changes in between. Null to a caller without ticket.audit here. Read it on one ticket at a time */
  auditContentHash?: Maybe<Scalars['String']['output']>;
  /** Every move of the audit status, newest first: verdicts, the scan's flags, and changes that voided a verdict. Null to a caller without ticket.audit here. Read it on one ticket at a time: it queries the change log per ticket */
  auditHistory?: Maybe<Array<TicketAuditEntryType>>;
  /** The note given with the last verdict, kept after a change voids it, so the next auditor sees what was found; always set while 'audit_issue'. Null to a caller without ticket.audit here */
  auditNote?: Maybe<Scalars['String']['output']>;
  /** The data check: 'no_audit' (not checked as it now stands), 'need_audit' (picked out for checking), 'audited' (found right) or 'audit_issue' (found wrong). Public, so a list can leave out tickets with issues */
  auditStatus: Scalars['String']['output'];
  /** When the last verdict was given, kept after a change voids it. Null if never audited, or to a caller without ticket.audit here */
  auditedAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of who gave the last verdict. Null if never audited, or without ticket.audit here */
  auditedBy?: Maybe<Scalars['String']['output']>;
  /** What differs from the content the last verdict was given on, field by field. Null if never audited, or to a caller without ticket.audit here. A need taken off since does not appear: it does not void a verdict. A value the caller could not read on the ticket itself (address, free text, triage answers) comes back null, the change still listed. Read it on one ticket at a time */
  changesSinceAudit?: Maybe<Array<TicketAuditChangeType>>;
  /** Follow-up email — masked unless the caller holds ticket.view_pii here and either ticket.view_history on the ticket or a claim on one of its needs */
  contactEmail?: Maybe<Scalars['String']['output']>;
  /** Requester full name — masked unless the caller holds ticket.view_pii here and either ticket.view_history on the ticket or a claim on one of its needs */
  contactName?: Maybe<Scalars['String']['output']>;
  /** Follow-up phone — masked unless the caller holds ticket.view_pii here and either ticket.view_history on the ticket or a claim on one of its needs */
  contactPhone?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who submitted this ticket. Null to a caller without ticket.view_detail here */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** The reporter's own account. Null to a caller without ticket.view_detail here — free text can name a door number the address field withholds */
  description?: Maybe<Scalars['String']['output']>;
  disasterDetails: Array<TicketDisasterDetailType>;
  /** Disaster type keys this ticket is filed under, e.g. ['flood', 'landslide']. Plural because one incident is routinely two disasters at once. Drives which fields `ticketPropertyConfigs` returns for it */
  disasterTypes: Array<Scalars['String']['output']>;
  /** GeoJSON Point indicating where help is needed. To a caller without ticket.view_detail here, the centre of the H3 cell the point falls in — at most resolution 8 (about 1 km across), coarser when `zoom` asks for it */
  geometry?: Maybe<Scalars['GeoJSON']['output']>;
  /** Reporter's answer to 立即生命危險: 'yes', 'no', 'unknown'. Null when nobody was asked — and also null to a caller without ticket.view_pii here (in the `tickets` list, ticket.view_history too). Not a triage grade and not a risk classification */
  immediateDangerReported?: Maybe<Scalars['String']['output']>;
  /** The H3 cell `geometry` stands in for, as its hex index (e.g. '884ba0a511fffff'), when the caller is shown the coarse location; null when `geometry` is the exact point. Tickets sharing a value share a location on the map — group by it, and draw the cell from it (h3-js `cellToBoundary`); its resolution is in the index */
  locationCell?: Maybe<Scalars['String']['output']>;
  /** Reporter's answer to 災民受困／無法自行離開: 'yes', 'no', 'unknown'. Null when nobody was asked — and also null to a caller without ticket.view_pii here (in the `tickets` list, ticket.view_history too). What the person said, not a professional assessment */
  personTrappedReported?: Maybe<Scalars['String']['output']>;
  /** Photos attached to this ticket. Empty to a caller without ticket.view_detail here */
  photos: Array<PhotoType>;
  /** Urgency level: 'low', 'medium', 'high', or 'critical' */
  priority: Scalars['String']['output'];
  /** Internal polymorphic discriminator — always 'request' */
  propertyName: Scalars['String']['output'];
  /** Street address and space detail for where help is needed. Null to a caller without ticket.view_detail here, and null when the ticket carries no address */
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
};

export const TriState = {
  No: 'no',
  Unknown: 'unknown',
  Yes: 'yes',
} as const;

export type TriState = (typeof TriState)[keyof typeof TriState];
export type UpdateAnnouncementInput = {
  /** The new announcement body text */
  content: Scalars['String']['input'];
  /** Which page shows it; omit to keep the current placement */
  placement?: InputMaybe<AnnouncementPlacement>;
};

export type UpdateAreaInput = {
  geometry?: InputMaybe<Scalars['GeoJSON']['input']>;
  informationSource?: InputMaybe<Scalars['String']['input']>;
  isPublic?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  note?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateBriefingInput = {
  /** New body text */
  content?: InputMaybe<Scalars['String']['input']>;
  /** New lifecycle phase */
  state?: InputMaybe<BriefingState>;
  /** Replacement tag list */
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateBriefingTemplateInput = {
  /** New body text */
  content?: InputMaybe<Scalars['String']['input']>;
  /** New lifecycle phase */
  state?: InputMaybe<BriefingState>;
  /** Replacement tag list */
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateBuildingMapInput = {
  /** Replaces every floor's areas when sent; [] clears them */
  floorAreas?: InputMaybe<Array<BuildingFloorAreasInput>>;
  floorsAboveGround?: InputMaybe<Scalars['Int']['input']>;
  floorsBelowGround?: InputMaybe<Scalars['Int']['input']>;
  geometry?: InputMaybe<Scalars['GeoJSON']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
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
  /** Updated operational status: 'active', 'temporarily_closed', or 'permanently_closed' */
  operationalStatus?: InputMaybe<StationOperationalStatus>;
  supplyStatus?: InputMaybe<Scalars['String']['input']>;
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
  /** Disaster type keys — pass [] or null to clear. Validated against `disasterTypes` */
  disasterTypes?: InputMaybe<Array<Scalars['String']['input']>>;
  /** 立即生命危險 — pass null to unset */
  immediateDangerReported?: InputMaybe<TriState>;
  /** 災民受困／無法自行離開 — pass null to unset */
  personTrappedReported?: InputMaybe<TriState>;
  /** Updated urgency: 'low', 'medium', 'high', or 'critical' */
  priority?: InputMaybe<Scalars['String']['input']>;
  /** Replace the ticket's street address and space detail, creating it if the ticket was filed without one. A whole-input replacement, not a patch — omitted members are written as null */
  secondaryLocation?: InputMaybe<SecondaryLocationInput>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTicketTaskInput = {
  /** Updated progress description — pass null to clear */
  progressNote?: InputMaybe<Scalars['String']['input']>;
};

export type UpsertDisasterTypeInput = {
  /** Set false to retire the type; there is no delete */
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  /** The code to create or update; normalized (trimmed, lower-cased) */
  key: Scalars['String']['input'];
  /** Display name. Required when creating */
  label?: InputMaybe<Scalars['String']['input']>;
};

export type UpsertPropertyConfigInput = {
  /** Which control the form renders. Required when the field is being created; omit to leave an existing field's type untouched */
  dataType?: InputMaybe<FieldDataType>;
  /** Disaster types this field is enabled for; an empty list means every type, so [] sets that value rather than clearing the field. Omit to leave it untouched */
  disasterTypes?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Allowed values for single_select / multi_select. Omit or pass null to leave the stored options untouched; pass [] to clear them */
  enumOptions?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Set false to retire the field without deleting its data */
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  /** Display text for the field. Omit or pass null to leave the stored label untouched; pass "" to clear it and fall back to the property name */
  label?: InputMaybe<Scalars['String']['input']>;
  /** The property key to create or update */
  propertyName: Scalars['String']['input'];
  /** Field order in the form */
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
  /** Unit suffix for a number field, e.g. 'cm'. Omit or pass null to leave the stored unit untouched; pass "" to clear it */
  unit?: InputMaybe<Scalars['String']['input']>;
};

export type UpsertTicketPropertyConfigInput = {
  /** Which control the form renders. Required when creating; omit to leave an existing field's type untouched */
  dataType?: InputMaybe<FieldDataType>;
  /** Disaster type keys this field applies to; empty list means every type. Each must be an active key from `disasterTypes` — an unknown one is rejected, not stored */
  disasterTypes?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Allowed values for single_select / multi_select. Omit or pass null to leave them untouched; pass [] to clear */
  enumOptions?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Guidance and safety text shown under the field. Omit or pass null to leave the stored hint untouched; pass "" to clear it */
  hint?: InputMaybe<Scalars['String']['input']>;
  /** Set false to retire the field without deleting its values */
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  /** Display text for the field. Omit or pass null to leave the stored label untouched; pass "" to clear it and fall back to the property name */
  label?: InputMaybe<Scalars['String']['input']>;
  /** The field key to create or update */
  propertyName: Scalars['String']['input'];
  /** Unit suffix for a number field, e.g. 'cm', 'mm'. Omit or pass null to leave the stored unit untouched; pass "" to clear it */
  unit?: InputMaybe<Scalars['String']['input']>;
};

export type UserRefType = {
  __typename?: 'UserRefType';
  name?: Maybe<Scalars['String']['output']>;
  uuid: Scalars['String']['output'];
};

export const Visibility = {
  Internal: 'internal',
  Public: 'public',
  Restricted: 'restricted',
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];
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

export type SiteAnnouncementsQueryVariables = Exact<{ [key: string]: never }>;

export type SiteAnnouncementsQuery = {
  __typename?: 'Query';
  announcements: Array<{
    __typename?: 'AnnouncementType';
    uuid: string;
    content: string;
    publishedAt?: any | null;
  }>;
};

export type CurrentBriefingQueryVariables = Exact<{ [key: string]: never }>;

export type CurrentBriefingQuery = {
  __typename?: 'Query';
  briefings: Array<{
    __typename?: 'BriefingType';
    uuid: string;
    content: string;
    publishedAt?: any | null;
  }>;
};

export type PageInfoFieldsFragment = {
  __typename?: 'PageInfo';
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
} & { ' $fragmentName'?: 'PageInfoFieldsFragment' };

export type StationFieldsFragment = {
  __typename?: 'StationType';
  uuid: string;
  propertyName: string;
  geometry?: Geometry | null;
  type?: string | null;
  name?: string | null;
  description?: string | null;
  opHour?: string | null;
  level: number;
  source?: string | null;
  visibility?: string | null;
  verificationStatus?: string | null;
  isDuplicate: boolean;
  isTemporary: boolean;
  isOfficial: boolean;
  operationalStatus: string;
  supplyStatus?: string | null;
  supplyStatusUpdatedAt?: any | null;
  createdBy?: string | null;
  createdAt?: any | null;
  updatedAt?: any | null;
} & { ' $fragmentName'?: 'StationFieldsFragment' };

export type ClosureAreaFieldsFragment = {
  __typename?: 'HazardousZoneType';
  uuid: string;
  propertyName: string;
  name?: string | null;
  geometry?: Geometry | null;
  status: string;
  informationSource?: string | null;
  note?: string | null;
  createdBy?: string | null;
  createdAt?: any | null;
  updatedAt?: any | null;
} & { ' $fragmentName'?: 'ClosureAreaFieldsFragment' };

export type GetStationsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  stationType?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetStationsQuery = {
  __typename?: 'Query';
  stations: {
    __typename?: 'StationConnection';
    items: Array<
      { __typename?: 'StationType' } & {
        ' $fragmentRefs'?: { StationFieldsFragment: StationFieldsFragment };
      }
    >;
    pageInfo: { __typename?: 'PageInfo' } & {
      ' $fragmentRefs'?: { PageInfoFieldsFragment: PageInfoFieldsFragment };
    };
  };
};

export type GetStationQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type GetStationQuery = {
  __typename?: 'Query';
  station?:
    | ({
        __typename?: 'StationType';
        secondaryLocation?: {
          __typename?: 'SecondaryLocationType';
          uuid: string;
          locationType: string;
          fullAddress?: string | null;
          county?: string | null;
          town?: string | null;
          village?: string | null;
          neighborhood?: string | null;
          road?: string | null;
          section?: string | null;
          lane?: string | null;
          alley?: string | null;
          no?: string | null;
          normalizationStatus?: string | null;
          floor?: string | null;
          room?: string | null;
          poleId?: string | null;
          poleType?: string | null;
          poleNote?: string | null;
        } | null;
        properties: Array<{
          __typename?: 'StationPropertyType';
          uuid: string;
          stationUuid: string;
          propertyType: string;
          propertyName: string;
          quantity?: number | null;
          comment?: string | null;
          status: string;
          weightings: number;
          createdBy?: string | null;
          createdAt?: any | null;
        }>;
      } & {
        ' $fragmentRefs'?: { StationFieldsFragment: StationFieldsFragment };
      })
    | null;
};

export type GetMapAreasQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetMapAreasQuery = {
  __typename?: 'Query';
  areas: {
    __typename?: 'AreaConnection';
    items: Array<{
      __typename?: 'AreaType';
      uuid: string;
      type: string;
      name?: string | null;
      note?: string | null;
      geometry?: Geometry | null;
      assignedTeams: Array<{
        __typename?: 'AssignedTeamType';
        uuid: string;
        name: string;
      }>;
    }>;
    pageInfo: { __typename?: 'PageInfo' } & {
      ' $fragmentRefs'?: { PageInfoFieldsFragment: PageInfoFieldsFragment };
    };
  };
};

export type GetClosureAreaQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type GetClosureAreaQuery = {
  __typename?: 'Query';
  hazardousZone?:
    | ({ __typename?: 'HazardousZoneType' } & {
        ' $fragmentRefs'?: {
          ClosureAreaFieldsFragment: ClosureAreaFieldsFragment;
        };
      })
    | null;
};

export type ReverseGeocodeQueryVariables = Exact<{
  lat: Scalars['Float']['input'];
  lng: Scalars['Float']['input'];
}>;

export type ReverseGeocodeQuery = {
  __typename?: 'Query';
  reverseGeocode: {
    __typename?: 'AddressLookupType';
    status: string;
    fullAddress?: string | null;
    lat?: number | null;
    lng?: number | null;
    buildingSection?: string | null;
    floor?: string | null;
    room?: string | null;
    addressToken?: string | null;
  };
};

export type NormalizeAddressQueryVariables = Exact<{
  address: Scalars['String']['input'];
  lat?: InputMaybe<Scalars['Float']['input']>;
  lng?: InputMaybe<Scalars['Float']['input']>;
}>;

export type NormalizeAddressQuery = {
  __typename?: 'Query';
  normalizeAddress: {
    __typename?: 'AddressLookupType';
    status: string;
    fullAddress?: string | null;
    lat?: number | null;
    lng?: number | null;
    buildingSection?: string | null;
    floor?: string | null;
    room?: string | null;
    addressToken?: string | null;
  };
};

export type UpdateStationMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateStationInput;
}>;

export type UpdateStationMutation = {
  __typename?: 'Mutation';
  updateStation: { __typename?: 'StationType' } & {
    ' $fragmentRefs'?: { StationFieldsFragment: StationFieldsFragment };
  };
};

export type DeleteStationMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type DeleteStationMutation = {
  __typename?: 'Mutation';
  deleteStation: boolean;
};

export type CreateStationPropertyMutationVariables = Exact<{
  input: CreateStationPropertyInput;
}>;

export type CreateStationPropertyMutation = {
  __typename?: 'Mutation';
  createStationProperty: {
    __typename?: 'StationPropertyType';
    uuid: string;
    stationUuid: string;
    propertyType: string;
    propertyName: string;
    quantity?: number | null;
    status: string;
    weightings: number;
    createdBy?: string | null;
    createdAt?: any | null;
  };
};

export type CreateCrowdSourcingMutationVariables = Exact<{
  input: CreateCrowdSourcingInput;
}>;

export type CreateCrowdSourcingMutation = {
  __typename?: 'Mutation';
  createCrowdSourcing: {
    __typename?: 'CrowdSourcingType';
    uuid: string;
    stationUuid: string;
    itemUuid?: string | null;
    rating: string;
    createdAt?: any | null;
  };
};

export type GetStationForSuggestionQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type GetStationForSuggestionQuery = {
  __typename?: 'Query';
  station?: {
    __typename?: 'StationType';
    uuid: string;
    name?: string | null;
    type?: string | null;
    description?: string | null;
    opHour?: string | null;
    operationalStatus: string;
    supplyStatus?: string | null;
    pendingSuggestedFields: Array<string>;
  } | null;
};

export type CreateStationSuggestionMutationVariables = Exact<{
  input: CreateStationSuggestionInput;
}>;

export type CreateStationSuggestionMutation = {
  __typename?: 'Mutation';
  createStationSuggestion: {
    __typename?: 'StationSuggestionType';
    uuid: string;
    fieldName: string;
    newValue: string;
    status: string;
  };
};

export type MyRoleRequestsQueryVariables = Exact<{ [key: string]: never }>;

export type MyRoleRequestsQuery = {
  __typename?: 'Query';
  myRoleRequests: {
    __typename?: 'MyRoleRequestsType';
    hasBackofficeIdentity: boolean;
    canApply: boolean;
    requests: Array<{
      __typename?: 'RoleRequestType';
      uuid: string;
      requestedRole: RoleRequestRole;
      reason: string;
      status: RoleRequestStatus;
      reviewNote?: string | null;
      createdAt: any;
      closedAt?: any | null;
      newTeamName?: string | null;
      applicantName?: string | null;
      applicantPhone?: string | null;
      team?: {
        __typename?: 'RoleRequestTeam';
        uuid: string;
        name: string;
      } | null;
    }>;
  };
};

export type RoleRequestTeamsQueryVariables = Exact<{
  type: RoleRequestTeamType;
}>;

export type RoleRequestTeamsQuery = {
  __typename?: 'Query';
  roleRequestTeams: Array<{
    __typename?: 'RoleRequestTeam';
    uuid: string;
    name: string;
  }>;
};

export type SubmitRoleRequestMutationVariables = Exact<{
  input: SubmitRoleRequestInput;
}>;

export type SubmitRoleRequestMutation = {
  __typename?: 'Mutation';
  submitRoleRequest: { __typename?: 'RoleRequestType'; uuid: string };
};

export type WithdrawRoleRequestMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type WithdrawRoleRequestMutation = {
  __typename?: 'Mutation';
  withdrawRoleRequest: { __typename?: 'RoleRequestType'; uuid: string };
};

export type TicketFieldsFragment = {
  __typename?: 'TicketType';
  uuid: string;
  propertyName: string;
  geometry?: Geometry | null;
  locationCell?: string | null;
  title: string;
  description?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status: string;
  priority: string;
  taskType?: string | null;
  auditStatus: string;
  createdBy?: string | null;
  createdAt?: any | null;
  updatedAt?: any | null;
} & { ' $fragmentName'?: 'TicketFieldsFragment' };

export type TicketTaskFieldsFragment = {
  __typename?: 'TicketTaskType';
  uuid: string;
  ticketUuid: string;
  taskType: string;
  taskName: string;
  taskDescription?: string | null;
  quantity?: number | null;
  status: string;
  source: string;
  progressNote?: string | null;
  createdAt?: any | null;
  updatedAt?: any | null;
} & { ' $fragmentName'?: 'TicketTaskFieldsFragment' };

export type TicketNeedFieldsFragment = {
  __typename?: 'TicketTaskType';
  uuid: string;
  taskName: string;
  taskType: string;
  quantity?: number | null;
  status: string;
  assignedCount: number;
  myAssignment?: { __typename?: 'TaskAssignmentType'; uuid: string } | null;
} & { ' $fragmentName'?: 'TicketNeedFieldsFragment' };

export type GetTicketsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  status?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  zoom?: InputMaybe<Scalars['Float']['input']>;
}>;

export type GetTicketsQuery = {
  __typename?: 'Query';
  tickets: {
    __typename?: 'TicketConnection';
    items: Array<
      { __typename?: 'TicketType' } & {
        ' $fragmentRefs'?: { TicketFieldsFragment: TicketFieldsFragment };
      }
    >;
    pageInfo: {
      __typename?: 'PageInfo';
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
};

export type GetTicketsWithNeedsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  status?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  zoom?: InputMaybe<Scalars['Float']['input']>;
}>;

export type GetTicketsWithNeedsQuery = {
  __typename?: 'Query';
  tickets: {
    __typename?: 'TicketConnection';
    items: Array<
      {
        __typename?: 'TicketType';
        tasks: Array<
          { __typename?: 'TicketTaskType' } & {
            ' $fragmentRefs'?: {
              TicketNeedFieldsFragment: TicketNeedFieldsFragment;
            };
          }
        >;
      } & { ' $fragmentRefs'?: { TicketFieldsFragment: TicketFieldsFragment } }
    >;
    pageInfo: {
      __typename?: 'PageInfo';
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
};

export type GetTicketQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type GetTicketQuery = {
  __typename?: 'Query';
  ticket?:
    | ({
        __typename?: 'TicketType';
        secondaryLocation?: {
          __typename?: 'SecondaryLocationType';
          fullAddress?: string | null;
          county?: string | null;
          town?: string | null;
          village?: string | null;
          neighborhood?: string | null;
          road?: string | null;
          section?: string | null;
          lane?: string | null;
          alley?: string | null;
          no?: string | null;
          normalizationStatus?: string | null;
          buildingSection?: string | null;
          floor?: string | null;
          room?: string | null;
          landmarkNote?: string | null;
        } | null;
        photos: Array<{
          __typename?: 'PhotoType';
          uuid: string;
          url: string;
          createdAt?: any | null;
        }>;
        tasks: Array<
          { __typename?: 'TicketTaskType' } & {
            ' $fragmentRefs'?: {
              TicketTaskFieldsFragment: TicketTaskFieldsFragment;
              TicketNeedFieldsFragment: TicketNeedFieldsFragment;
            };
          }
        >;
      } & { ' $fragmentRefs'?: { TicketFieldsFragment: TicketFieldsFragment } })
    | null;
};

export type GetTicketTasksQueryVariables = Exact<{
  ticketUuid: Scalars['String']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetTicketTasksQuery = {
  __typename?: 'Query';
  ticketTasks: Array<
    {
      __typename?: 'TicketTaskType';
      properties: Array<{
        __typename?: 'TaskPropertyType';
        uuid: string;
        taskUuid: string;
        propertyName: string;
        propertyValue: string;
        quantity?: number | null;
        status?: string | null;
        comment?: string | null;
        createdAt?: any | null;
      }>;
    } & {
      ' $fragmentRefs'?: { TicketTaskFieldsFragment: TicketTaskFieldsFragment };
    }
  >;
};

export type CreateHelpRequestMutationVariables = Exact<{
  input: CreateHelpRequestInput;
}>;

export type CreateHelpRequestMutation = {
  __typename?: 'Mutation';
  createHelpRequest:
    | {
        __typename: 'DuplicatesSuspected';
        suspects: Array<{
          __typename?: 'DuplicateSuspect';
          draftRef: string;
          relatedUuid: string;
          relatedTicketUuid?: string | null;
        }>;
      }
    | {
        __typename: 'TicketCreated';
        ticket: { __typename?: 'TicketType' } & {
          ' $fragmentRefs'?: { TicketFieldsFragment: TicketFieldsFragment };
        };
        tasks: Array<
          { __typename?: 'TicketTaskType' } & {
            ' $fragmentRefs'?: {
              TicketNeedFieldsFragment: TicketNeedFieldsFragment;
            };
          }
        >;
      };
};

export type UpdateTicketMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateTicketInput;
}>;

export type UpdateTicketMutation = {
  __typename?: 'Mutation';
  updateTicket: { __typename?: 'TicketType' } & {
    ' $fragmentRefs'?: { TicketFieldsFragment: TicketFieldsFragment };
  };
};

export type CreateTicketTaskMutationVariables = Exact<{
  input: CreateTicketTaskInput;
  acknowledgedDuplicateOf?: InputMaybe<Scalars['String']['input']>;
}>;

export type CreateTicketTaskMutation = {
  __typename?: 'Mutation';
  createTicketTask:
    | {
        __typename: 'DuplicatesSuspected';
        suspects: Array<{
          __typename?: 'DuplicateSuspect';
          relatedUuid: string;
          relatedTicketUuid?: string | null;
        }>;
      }
    | {
        __typename: 'TicketTaskCreated';
        task: { __typename?: 'TicketTaskType' } & {
          ' $fragmentRefs'?: {
            TicketTaskFieldsFragment: TicketTaskFieldsFragment;
          };
        };
      };
};

export type UpdateTicketTaskMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateTicketTaskInput;
}>;

export type UpdateTicketTaskMutation = {
  __typename?: 'Mutation';
  updateTicketTask: { __typename?: 'TicketTaskType' } & {
    ' $fragmentRefs'?: { TicketTaskFieldsFragment: TicketTaskFieldsFragment };
  };
};

export type ClaimNeedMutationVariables = Exact<{
  taskUuid: Scalars['UUID']['input'];
}>;

export type ClaimNeedMutation = {
  __typename?: 'Mutation';
  assignTaskActor: {
    __typename?: 'TaskAssignmentType';
    uuid: string;
    taskUuid: string;
  };
};

export type ReleaseClaimMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type ReleaseClaimMutation = {
  __typename?: 'Mutation';
  unassignTaskActor: boolean;
};

export type StopRecruitingMutationVariables = Exact<{
  taskUuid: Scalars['UUID']['input'];
}>;

export type StopRecruitingMutation = {
  __typename?: 'Mutation';
  stopRecruiting: { __typename?: 'TicketTaskType'; uuid: string };
};

export type DeleteTicketTaskMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type DeleteTicketTaskMutation = {
  __typename?: 'Mutation';
  deleteTicketTask: boolean;
};

export type DeleteTicketMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type DeleteTicketMutation = {
  __typename?: 'Mutation';
  deleteTicket: boolean;
};

export type MyTaskAssignmentsQueryVariables = Exact<{ [key: string]: never }>;

export type MyTaskAssignmentsQuery = {
  __typename?: 'Query';
  myTaskAssignments: Array<{
    __typename?: 'MyTaskAssignmentType';
    assignment: {
      __typename?: 'TaskAssignmentType';
      uuid: string;
      assignedAt?: any | null;
    };
    task: {
      __typename?: 'TicketTaskType';
      uuid: string;
      taskName: string;
      recruitingStoppedAt?: any | null;
    };
    ticket: {
      __typename?: 'TicketType';
      uuid: string;
      title: string;
      contactName?: string | null;
      contactPhone?: string | null;
      secondaryLocation?: {
        __typename?: 'SecondaryLocationType';
        fullAddress?: string | null;
        county?: string | null;
        town?: string | null;
        village?: string | null;
        neighborhood?: string | null;
        road?: string | null;
        section?: string | null;
        lane?: string | null;
        alley?: string | null;
        no?: string | null;
        normalizationStatus?: string | null;
        buildingSection?: string | null;
        floor?: string | null;
        room?: string | null;
        landmarkNote?: string | null;
      } | null;
    };
  }>;
};

export type MyTicketsQueryVariables = Exact<{ [key: string]: never }>;

export type MyTicketsQuery = {
  __typename?: 'Query';
  myTickets: Array<{
    __typename?: 'TicketType';
    uuid: string;
    title: string;
    status: string;
    createdAt?: any | null;
    tasks: Array<{
      __typename?: 'TicketTaskType';
      uuid: string;
      status: string;
    }>;
  }>;
};

export type CreateTaskPropertyMutationVariables = Exact<{
  input: CreateTaskPropertyInput;
}>;

export type CreateTaskPropertyMutation = {
  __typename?: 'Mutation';
  createTaskProperty: {
    __typename?: 'TaskPropertyType';
    uuid: string;
    taskUuid: string;
    propertyName: string;
    propertyValue: string;
    quantity?: number | null;
    status?: string | null;
    comment?: string | null;
    createdAt?: any | null;
  };
};

export const PageInfoFieldsFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PageInfoFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'PageInfo' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'totalCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasNextPage' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasPreviousPage' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PageInfoFieldsFragment, unknown>;
export const StationFieldsFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'StationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'supplyStatus' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'supplyStatusUpdatedAt' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<StationFieldsFragment, unknown>;
export const ClosureAreaFieldsFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'ClosureAreaFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'HazardousZoneType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'informationSource' } },
          { kind: 'Field', name: { kind: 'Name', value: 'note' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ClosureAreaFieldsFragment, unknown>;
export const TicketFieldsFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'locationCell' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'auditStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TicketFieldsFragment, unknown>;
export const TicketTaskFieldsFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketTaskFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketTaskType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'ticketUuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskDescription' } },
          { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TicketTaskFieldsFragment, unknown>;
export const TicketNeedFieldsFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketNeedFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketTaskType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'assignedCount' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'myAssignment' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TicketNeedFieldsFragment, unknown>;
export const SiteAnnouncementsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'SiteAnnouncements' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'announcements' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'filter' },
                value: { kind: 'EnumValue', value: 'ACTIVE' },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'placement' },
                value: { kind: 'EnumValue', value: 'public_page' },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SiteAnnouncementsQuery,
  SiteAnnouncementsQueryVariables
>;
export const CurrentBriefingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CurrentBriefing' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'briefings' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'state' },
                value: { kind: 'EnumValue', value: 'BRIEFING' },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'status' },
                value: { kind: 'EnumValue', value: 'PUBLISHED' },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CurrentBriefingQuery,
  CurrentBriefingQueryVariables
>;
export const GetStationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetStations' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'bounds' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'BoundsInput' },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'stationType' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'skip' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          defaultValue: { kind: 'IntValue', value: '0' },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'limit' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          defaultValue: { kind: 'IntValue', value: '50' },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'stations' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'bounds' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'bounds' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'stationType' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'stationType' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'skip' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'skip' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'limit' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'limit' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'FragmentSpread',
                        name: { kind: 'Name', value: 'StationFields' },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'pageInfo' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'FragmentSpread',
                        name: { kind: 'Name', value: 'PageInfoFields' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PageInfoFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'PageInfo' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'totalCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasNextPage' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasPreviousPage' } },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'StationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'supplyStatus' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'supplyStatusUpdatedAt' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetStationsQuery, GetStationsQueryVariables>;
export const GetStationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetStation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'station' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'StationFields' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'secondaryLocation' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'locationType' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'fullAddress' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'county' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'town' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'village' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'neighborhood' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'road' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'section' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'lane' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'alley' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'no' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'normalizationStatus' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'floor' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'room' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'poleId' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'poleType' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'poleNote' },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'properties' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'stationUuid' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'propertyType' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'propertyName' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'quantity' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'comment' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'status' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'weightings' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'createdBy' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'createdAt' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'StationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'supplyStatus' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'supplyStatusUpdatedAt' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetStationQuery, GetStationQueryVariables>;
export const GetMapAreasDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetMapAreas' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'bounds' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'BoundsInput' },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'skip' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          defaultValue: { kind: 'IntValue', value: '0' },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'limit' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          defaultValue: { kind: 'IntValue', value: '50' },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'areas' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'bounds' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'bounds' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'skip' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'skip' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'limit' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'limit' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'note' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'geometry' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'assignedTeams' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'uuid' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'name' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'pageInfo' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'FragmentSpread',
                        name: { kind: 'Name', value: 'PageInfoFields' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PageInfoFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'PageInfo' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'totalCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasNextPage' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasPreviousPage' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetMapAreasQuery, GetMapAreasQueryVariables>;
export const GetClosureAreaDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetClosureArea' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'hazardousZone' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'ClosureAreaFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'ClosureAreaFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'HazardousZoneType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'informationSource' } },
          { kind: 'Field', name: { kind: 'Name', value: 'note' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetClosureAreaQuery, GetClosureAreaQueryVariables>;
export const ReverseGeocodeDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ReverseGeocode' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'lat' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Float' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'lng' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Float' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'reverseGeocode' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'lat' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'lat' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'lng' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'lng' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'fullAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lat' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lng' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'buildingSection' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'floor' } },
                { kind: 'Field', name: { kind: 'Name', value: 'room' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'addressToken' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ReverseGeocodeQuery, ReverseGeocodeQueryVariables>;
export const NormalizeAddressDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'NormalizeAddress' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'address' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'lat' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Float' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'lng' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Float' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'normalizeAddress' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'address' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'address' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'lat' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'lat' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'lng' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'lng' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'fullAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lat' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lng' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'buildingSection' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'floor' } },
                { kind: 'Field', name: { kind: 'Name', value: 'room' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'addressToken' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  NormalizeAddressQuery,
  NormalizeAddressQueryVariables
>;
export const UpdateStationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateStation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpdateStationInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateStation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'StationFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'StationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'supplyStatus' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'supplyStatusUpdatedAt' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateStationMutation,
  UpdateStationMutationVariables
>;
export const DeleteStationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteStation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteStation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DeleteStationMutation,
  DeleteStationMutationVariables
>;
export const CreateStationPropertyDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateStationProperty' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateStationPropertyInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createStationProperty' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stationUuid' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyType' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyName' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'weightings' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateStationPropertyMutation,
  CreateStationPropertyMutationVariables
>;
export const CreateCrowdSourcingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateCrowdSourcing' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateCrowdSourcingInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createCrowdSourcing' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stationUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'itemUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'rating' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateCrowdSourcingMutation,
  CreateCrowdSourcingMutationVariables
>;
export const GetStationForSuggestionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetStationForSuggestion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'station' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'operationalStatus' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'supplyStatus' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'pendingSuggestedFields' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetStationForSuggestionQuery,
  GetStationForSuggestionQueryVariables
>;
export const CreateStationSuggestionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateStationSuggestion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateStationSuggestionInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createStationSuggestion' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'fieldName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'newValue' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateStationSuggestionMutation,
  CreateStationSuggestionMutationVariables
>;
export const MyRoleRequestsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'MyRoleRequests' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'myRoleRequests' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'hasBackofficeIdentity' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'canApply' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'requests' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'requestedRole' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'reason' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'status' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'reviewNote' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'createdAt' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'closedAt' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'team' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'uuid' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'name' },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'newTeamName' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'applicantName' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'applicantPhone' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<MyRoleRequestsQuery, MyRoleRequestsQueryVariables>;
export const RoleRequestTeamsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'RoleRequestTeams' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'type' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'RoleRequestTeamType' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'roleRequestTeams' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'type' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'type' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RoleRequestTeamsQuery,
  RoleRequestTeamsQueryVariables
>;
export const SubmitRoleRequestDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SubmitRoleRequest' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'SubmitRoleRequestInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'submitRoleRequest' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SubmitRoleRequestMutation,
  SubmitRoleRequestMutationVariables
>;
export const WithdrawRoleRequestDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'WithdrawRoleRequest' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'withdrawRoleRequest' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  WithdrawRoleRequestMutation,
  WithdrawRoleRequestMutationVariables
>;
export const GetTicketsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetTickets' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'bounds' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'BoundsInput' },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'status' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'priority' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'skip' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          defaultValue: { kind: 'IntValue', value: '0' },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'limit' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          defaultValue: { kind: 'IntValue', value: '50' },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'zoom' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Float' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'tickets' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'bounds' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'bounds' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'status' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'status' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'priority' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'priority' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'skip' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'skip' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'limit' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'limit' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'zoom' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'zoom' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'FragmentSpread',
                        name: { kind: 'Name', value: 'TicketFields' },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'pageInfo' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'totalCount' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'hasNextPage' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'hasPreviousPage' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'locationCell' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'auditStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetTicketsQuery, GetTicketsQueryVariables>;
export const GetTicketsWithNeedsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetTicketsWithNeeds' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'bounds' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'BoundsInput' },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'status' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'priority' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'q' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'skip' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          defaultValue: { kind: 'IntValue', value: '0' },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'limit' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          defaultValue: { kind: 'IntValue', value: '50' },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'zoom' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Float' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'tickets' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'bounds' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'bounds' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'status' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'status' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'priority' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'priority' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'q' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'q' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'skip' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'skip' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'limit' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'limit' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'zoom' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'zoom' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'FragmentSpread',
                        name: { kind: 'Name', value: 'TicketFields' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'tasks' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'FragmentSpread',
                              name: { kind: 'Name', value: 'TicketNeedFields' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'pageInfo' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'totalCount' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'hasNextPage' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'hasPreviousPage' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'locationCell' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'auditStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketNeedFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketTaskType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'assignedCount' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'myAssignment' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetTicketsWithNeedsQuery,
  GetTicketsWithNeedsQueryVariables
>;
export const GetTicketDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetTicket' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ticket' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'TicketFields' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'secondaryLocation' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'fullAddress' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'county' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'town' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'village' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'neighborhood' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'road' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'section' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'lane' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'alley' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'no' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'normalizationStatus' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'buildingSection' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'floor' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'room' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'landmarkNote' },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'photos' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'createdAt' },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'tasks' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'FragmentSpread',
                        name: { kind: 'Name', value: 'TicketTaskFields' },
                      },
                      {
                        kind: 'FragmentSpread',
                        name: { kind: 'Name', value: 'TicketNeedFields' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'locationCell' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'auditStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketTaskFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketTaskType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'ticketUuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskDescription' } },
          { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketNeedFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketTaskType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'assignedCount' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'myAssignment' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetTicketQuery, GetTicketQueryVariables>;
export const GetTicketTasksDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetTicketTasks' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'ticketUuid' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'status' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'skip' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          defaultValue: { kind: 'IntValue', value: '0' },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'limit' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          defaultValue: { kind: 'IntValue', value: '50' },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ticketTasks' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'ticketUuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'ticketUuid' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'status' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'status' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'skip' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'skip' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'limit' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'limit' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'TicketTaskFields' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'properties' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'taskUuid' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'propertyName' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'propertyValue' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'quantity' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'status' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'comment' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'createdAt' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketTaskFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketTaskType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'ticketUuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskDescription' } },
          { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetTicketTasksQuery, GetTicketTasksQueryVariables>;
export const CreateHelpRequestDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateHelpRequest' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateHelpRequestInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createHelpRequest' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'TicketCreated' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'ticket' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'FragmentSpread',
                              name: { kind: 'Name', value: 'TicketFields' },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'tasks' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'FragmentSpread',
                              name: { kind: 'Name', value: 'TicketNeedFields' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'DuplicatesSuspected' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'suspects' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'draftRef' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'relatedUuid' },
                            },
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: 'relatedTicketUuid',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'locationCell' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'auditStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketNeedFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketTaskType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'assignedCount' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'myAssignment' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateHelpRequestMutation,
  CreateHelpRequestMutationVariables
>;
export const UpdateTicketDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateTicket' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpdateTicketInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateTicket' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'TicketFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'propertyName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'locationCell' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'auditStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateTicketMutation,
  UpdateTicketMutationVariables
>;
export const CreateTicketTaskDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateTicketTask' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateTicketTaskInput' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'acknowledgedDuplicateOf' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createTicketTask' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'acknowledgedDuplicateOf' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'acknowledgedDuplicateOf' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'TicketTaskCreated' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'task' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'FragmentSpread',
                              name: { kind: 'Name', value: 'TicketTaskFields' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'DuplicatesSuspected' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'suspects' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'relatedUuid' },
                            },
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: 'relatedTicketUuid',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketTaskFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketTaskType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'ticketUuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskDescription' } },
          { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateTicketTaskMutation,
  CreateTicketTaskMutationVariables
>;
export const UpdateTicketTaskDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateTicketTask' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpdateTicketTaskInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateTicketTask' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'TicketTaskFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'TicketTaskFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketTaskType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'ticketUuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskDescription' } },
          { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateTicketTaskMutation,
  UpdateTicketTaskMutationVariables
>;
export const ClaimNeedDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ClaimNeed' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'taskUuid' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignTaskActor' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'taskUuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'taskUuid' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'taskUuid' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ClaimNeedMutation, ClaimNeedMutationVariables>;
export const ReleaseClaimDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ReleaseClaim' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'unassignTaskActor' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ReleaseClaimMutation,
  ReleaseClaimMutationVariables
>;
export const StopRecruitingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'StopRecruiting' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'taskUuid' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'stopRecruiting' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'taskUuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'taskUuid' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  StopRecruitingMutation,
  StopRecruitingMutationVariables
>;
export const DeleteTicketTaskDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteTicketTask' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteTicketTask' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DeleteTicketTaskMutation,
  DeleteTicketTaskMutationVariables
>;
export const DeleteTicketDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteTicket' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'uuid' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteTicket' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'uuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'uuid' },
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DeleteTicketMutation,
  DeleteTicketMutationVariables
>;
export const MyTaskAssignmentsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'MyTaskAssignments' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'myTaskAssignments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'assignment' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'assignedAt' },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'task' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'taskName' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'recruitingStoppedAt' },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'ticket' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'contactName' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'contactPhone' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'secondaryLocation' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'fullAddress' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'county' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'town' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'village' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'neighborhood' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'road' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'section' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'lane' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'alley' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'no' },
                            },
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: 'normalizationStatus',
                              },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'buildingSection' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'floor' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'room' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'landmarkNote' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  MyTaskAssignmentsQuery,
  MyTaskAssignmentsQueryVariables
>;
export const MyTicketsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'MyTickets' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'myTickets' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'tasks' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'status' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<MyTicketsQuery, MyTicketsQueryVariables>;
export const CreateTaskPropertyDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateTaskProperty' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateTaskPropertyInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createTaskProperty' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'taskUuid' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyName' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyValue' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'quantity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'comment' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateTaskPropertyMutation,
  CreateTaskPropertyMutationVariables
>;
