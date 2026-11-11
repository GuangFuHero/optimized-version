/* eslint-disable */
import type { Geometry } from 'geojson';
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
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
  DateTime: { input: string; output: string };
  /** GeoJSON geometry object (RFC 7946) */
  GeoJSON: { input: Geometry; output: Geometry };
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](https://ecma-international.org/wp-content/uploads/ECMA-404_2nd_edition_december_2017.pdf). */
  JSON: { input: unknown; output: unknown };
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
  /** Shown on the public map, a team zone only to those signed in; always true except for a mark zone */
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
  Inactive: 'INACTIVE',
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
  /** Who created it. Null unless the caller holds pre_departure.edit */
  creator?: Maybe<UserRefType>;
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
  /** Who created it. Null unless the caller holds pre_departure.edit */
  creator?: Maybe<UserRefType>;
  /** When it was published; null while a draft */
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Who published it; null while a draft or unless the caller holds pre_departure.edit */
  publisher?: Maybe<UserRefType>;
  /** Lifecycle phase: 'briefing', 'in_field', or 'debrief' */
  state: Scalars['String']['output'];
  status: BriefingStatus;
  /** Free-form categorization tags */
  tags: Array<Scalars['String']['output']>;
  /** UUID of the source template, or null for ad-hoc briefings */
  templateUuid?: Maybe<Scalars['UUID']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Who last changed it. Null unless the caller holds pre_departure.edit */
  updater?: Maybe<UserRefType>;
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
  /** How much this building is still short, people and supplies together (ADR-450): over its tickets not completed or cancelled, each pending 'hr' or 'supply' need with a quantity adds that quantity less assignedCount, never below 0. Rescue and medical needs, and needs with no quantity, add nothing. Null to a caller without ticket.view_detail */
  shortfall?: Maybe<Scalars['Int']['output']>;
  /** How many tickets are filed in this building and not deleted, completed and cancelled ones too: every one buildingMapTickets lists, past any page (ADR-450). Null to a caller without ticket.view_detail, to whom those tickets are not placed in the building */
  ticketCount?: Maybe<Scalars['Int']['output']>;
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
  /** Shown on the public map; hazardous and team zones are always public, though a guest never sees a team zone; a mark zone defaults to false */
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
  /** File the request inside this building map, as createTicket does: its point and address are copied onto the ticket, and secondaryLocation.floor (and room, on a floor with areas) must match the building's floors. Omit floor when the reporter doesn't know it */
  buildingMapUuid?: InputMaybe<Scalars['UUID']['input']>;
  /** Optional; the account's own email is never filled in for it */
  contactEmail?: InputMaybe<Scalars['String']['input']>;
  /** Who to ask for at the place */
  contactName: Scalars['String']['input'];
  /** Phone number or LINE ID, as the person typed it */
  contactPhone?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  /** GeoJSON Point for the location where help is needed — [longitude, latitude]. Required unless buildingMapUuid is given, in which case it must be omitted */
  geometry?: InputMaybe<Scalars['GeoJSON']['input']>;
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
  /**
   * Not read: the identity making the station decides it
   * @deprecated The backend sets `source` from the identity making the station; leave it out
   */
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
  /** Scene photos as https links to images kept elsewhere, at most 10, stored in the order given. Any bad link refuses the whole ticket */
  photoUrls?: InputMaybe<Array<Scalars['String']['input']>>;
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
  /** People or units needed, at least 1; required, for a 'rescue' task too */
  quantity?: InputMaybe<Scalars['Int']['input']>;
  routeUuid?: InputMaybe<Scalars['UUID']['input']>;
  /**
   * Not read: the identity making the task decides it
   * @deprecated The backend sets `source` from the identity making the task; leave it out
   */
  source?: Scalars['String']['input'];
  taskDescription?: InputMaybe<Scalars['String']['input']>;
  taskName: Scalars['String']['input'];
  /** Category: 'rescue', 'supply', 'medical', or 'hr' */
  taskType: Scalars['String']['input'];
};

export type CreateTicketTaskInput = {
  /** People or units needed, at least 1; required, for a 'rescue' task too */
  quantity?: InputMaybe<Scalars['Int']['input']>;
  /** Optional UUID of an associated route */
  routeUuid?: InputMaybe<Scalars['UUID']['input']>;
  /**
   * Not read: the identity making the task decides it
   * @deprecated The backend sets `source` from the identity making the task; leave it out
   */
  source?: Scalars['String']['input'];
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
  /** Override content; defaults to the template's or source briefing's */
  content?: InputMaybe<Scalars['String']['input']>;
  /** Briefing to copy, template link included, so a published one is edited as a new draft */
  sourceBriefingUuid?: InputMaybe<Scalars['UUID']['input']>;
  /** Override phase; defaults to the template's or source briefing's */
  state?: InputMaybe<BriefingState>;
  /** Override tags; defaults to the template's or source briefing's */
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
  /** People or units needed, at least 1; required, for a 'rescue' need too */
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
  attachTicketPhoto: PhotoType;
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
  detachTicketPhoto: Scalars['Boolean']['output'];
  generateBriefing: BriefingType;
  mergeStationSuggestions: StationSuggestionMergeType;
  promoteMarkZone: HazardousZoneType;
  publishBriefing: BriefingType;
  removeZoneFromTeam: Scalars['Boolean']['output'];
  revokeStationSuggestionMerge: StationSuggestionMergeType;
  setAnnouncementActive: AnnouncementType;
  setTicketDisasterDetails: Array<TicketDisasterDetailType>;
  stopRecruiting: TicketTaskType;
  submitRoleRequest: RoleRequestType;
  takeDownBriefing: BriefingType;
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

export type MutationAttachTicketPhotoArgs = {
  ticketUuid: Scalars['UUID']['input'];
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

export type MutationDetachTicketPhotoArgs = {
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

export type MutationPromoteMarkZoneArgs = {
  input: PromoteMarkZoneInput;
  uuid: Scalars['UUID']['input'];
};

export type MutationPublishBriefingArgs = {
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

export type MutationTakeDownBriefingArgs = {
  uuid: Scalars['UUID']['input'];
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

export type MyStationSuggestionType = {
  __typename?: 'MyStationSuggestionType';
  /** Approved, adopted_edited or revoked: the value the reviewer wrote, which may differ from newValue. Otherwise null, as for an approval from before merges were recorded */
  appliedValue?: Maybe<Scalars['String']['output']>;
  comment?: Maybe<Scalars['String']['output']>;
  /** When it was approved or rejected, or for a revoked one when the approval was undone; for one decided before merges were recorded, when the row last changed. Null while pending */
  decidedAt?: Maybe<Scalars['DateTime']['output']>;
  fieldName: Scalars['String']['output'];
  /** The value suggested, the latest if sent again */
  newValue: Scalars['String']['output'];
  /** The field's value when last sent, as text ('' for none); null for a suggestion sent before this was recorded */
  previousValue?: Maybe<Scalars['String']['output']>;
  /** The station it is about, or its property's; null once deleted or out of the caller's view, by the rules of `station` */
  station?: Maybe<StationType>;
  /** 'pending', 'approved', 'adopted_edited', 'not_adopted', 'rejected', or 'revoked' */
  status: Scalars['String']['output'];
  /** When it was first sent */
  submittedAt: Scalars['DateTime']['output'];
  /** 'station' or 'station_property' */
  targetType: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
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
  assignableStationTeams: Array<AssignedTeamType>;
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
  myStationSuggestions: Array<MyStationSuggestionType>;
  myTaskAssignments: Array<MyTaskAssignmentType>;
  myTickets: Array<TicketType>;
  /** Look a typed address up in TGOS before saving it (exact matches only). Pass the map pin as lat/lng to check the two agree. Signed-in callers only, 30 lookups a minute shared with reverseGeocode */
  normalizeAddress: AddressLookupType;
  /** The nearest 門牌 to a map pin, within 500 m. Signed-in callers only, 30 lookups a minute shared with normalizeAddress */
  reverseGeocode: AddressLookupType;
  roleRequestTeams: Array<RoleRequestTeam>;
  station?: Maybe<StationType>;
  stationFacets: StationFacetsType;
  stationPropertyConfigs: Array<StationPropertyConfigType>;
  stations: StationConnection;
  suggestableFields: Array<SuggestableFieldType>;
  taskProperties: Array<TaskPropertyType>;
  taskPropertyConfigs: Array<TaskPropertyConfigType>;
  teamZone?: Maybe<TeamZoneType>;
  teamZones: TeamZoneConnection;
  ticket?: Maybe<TicketType>;
  /** Whether ticket(uuid) gives this ticket, and if not, whether it was merged into another, deleted, or never was, so a share link can say which and send a merged one on. Ask it beside ticket(uuid). The state and the kept ticket's uuid alone, nothing of the ticket (ADR-444) */
  ticketAvailability: TicketAvailabilityType;
  ticketCells: Array<TicketCellType>;
  /** The choices of the ticket board's 行政區域 and 組織分配 filters: the areas the addresses of the tickets the caller sees in detail name, and the teams holding a 責任區. Both empty to a caller without ticket.view_detail, as the filters then match nothing */
  ticketFacets: TicketFacetsType;
  ticketPropertyConfigs: Array<TicketPropertyConfigType>;
  ticketStats: TicketStatsType;
  ticketTasks: Array<TicketTaskType>;
  tickets: TicketConnection;
  ticketsExtent: TicketsExtentType;
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

export type QueryMyStationSuggestionsArgs = {
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

export type QueryStationFacetsArgs = {
  assignedTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  bounds?: InputMaybe<BoundsInput>;
  county?: InputMaybe<Scalars['String']['input']>;
  createdAfter?: InputMaybe<Scalars['DateTime']['input']>;
  createdBefore?: InputMaybe<Scalars['DateTime']['input']>;
  hasPendingSuggestions?: Scalars['Boolean']['input'];
  official?: InputMaybe<Scalars['Boolean']['input']>;
  operationalStatus?: InputMaybe<StationOperationalStatus>;
  q?: InputMaybe<Scalars['String']['input']>;
  reviewableOnly?: Scalars['Boolean']['input'];
  stationType?: InputMaybe<Scalars['String']['input']>;
  town?: InputMaybe<Scalars['String']['input']>;
  unassignedOnly?: Scalars['Boolean']['input'];
  updatedAfter?: InputMaybe<Scalars['DateTime']['input']>;
  updatedBefore?: InputMaybe<Scalars['DateTime']['input']>;
};

export type QueryStationPropertyConfigsArgs = {
  includeInactive?: Scalars['Boolean']['input'];
  stationType: Scalars['String']['input'];
};

export type QueryStationsArgs = {
  assignedTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  bounds?: InputMaybe<BoundsInput>;
  county?: InputMaybe<Scalars['String']['input']>;
  createdAfter?: InputMaybe<Scalars['DateTime']['input']>;
  createdBefore?: InputMaybe<Scalars['DateTime']['input']>;
  hasPendingSuggestions?: Scalars['Boolean']['input'];
  limit?: Scalars['Int']['input'];
  official?: InputMaybe<Scalars['Boolean']['input']>;
  operationalStatus?: InputMaybe<StationOperationalStatus>;
  orderBy?: StationOrder;
  q?: InputMaybe<Scalars['String']['input']>;
  reviewableOnly?: Scalars['Boolean']['input'];
  skip?: Scalars['Int']['input'];
  stationType?: InputMaybe<Scalars['String']['input']>;
  town?: InputMaybe<Scalars['String']['input']>;
  unassignedOnly?: Scalars['Boolean']['input'];
  updatedAfter?: InputMaybe<Scalars['DateTime']['input']>;
  updatedBefore?: InputMaybe<Scalars['DateTime']['input']>;
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

export type QueryTicketAvailabilityArgs = {
  uuid: Scalars['UUID']['input'];
};

export type QueryTicketCellsArgs = {
  bounds: BoundsInput;
  statuses?: InputMaybe<Array<TicketStatus>>;
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
  county?: InputMaybe<Scalars['String']['input']>;
  disasterType?: InputMaybe<Scalars['String']['input']>;
  limit?: Scalars['Int']['input'];
  locationCell?: InputMaybe<Scalars['String']['input']>;
  needType?: InputMaybe<Scalars['String']['input']>;
  openNeedsOnly?: Scalars['Boolean']['input'];
  order?: TicketListOrder;
  outsideBounds?: InputMaybe<BoundsInput>;
  priority?: InputMaybe<Scalars['String']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
  responsibleTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  statuses?: InputMaybe<Array<TicketStatus>>;
  town?: InputMaybe<Scalars['String']['input']>;
  unassignedOnly?: Scalars['Boolean']['input'];
  updatedAfter?: InputMaybe<Scalars['DateTime']['input']>;
  updatedBefore?: InputMaybe<Scalars['DateTime']['input']>;
  zoom?: InputMaybe<Scalars['Float']['input']>;
};

export type QueryTicketsExtentArgs = {
  county?: InputMaybe<Scalars['String']['input']>;
  disasterType?: InputMaybe<Scalars['String']['input']>;
  locationCell?: InputMaybe<Scalars['String']['input']>;
  needType?: InputMaybe<Scalars['String']['input']>;
  openNeedsOnly?: Scalars['Boolean']['input'];
  priority?: InputMaybe<Scalars['String']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
  responsibleTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  statuses?: InputMaybe<Array<TicketStatus>>;
  town?: InputMaybe<Scalars['String']['input']>;
  unassignedOnly?: Scalars['Boolean']['input'];
  updatedAfter?: InputMaybe<Scalars['DateTime']['input']>;
  updatedBefore?: InputMaybe<Scalars['DateTime']['input']>;
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
  /** Every admin of the team, `[]` if it has none, in `roleRequestTeams` for a caller who is a team admin or super admin. Null for anyone else, and always null on a role request's `team` and `grantedTeam` */
  admins?: Maybe<Array<TeamAdmin>>;
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
  /** The team approval handed out: the one joined, or the one a new-team application founded */
  grantedTeam?: Maybe<RoleRequestTeam>;
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

export type StationAreaCountType = {
  __typename?: 'StationAreaCountType';
  count: Scalars['Int']['output'];
  county: Scalars['String']['output'];
  /** Null for the stations in this 縣市 whose address names no 鄉鎮市區. No filter selects just those: `county` alone matches the whole 縣市 */
  town?: Maybe<Scalars['String']['output']>;
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

export type StationFacetsType = {
  __typename?: 'StationFacetsType';
  /** Per 縣市 and 鄉鎮市區 of the address; a station with no address is in none, and one with a 縣市 but no 鄉鎮市區 is in a row whose `town` is null */
  areas: Array<StationAreaCountType>;
  byStatus: Array<StationStatusCountType>;
  byType: Array<StationTypeCountType>;
  /** Stations with a pending suggestion that the caller holds station.review over */
  pendingReviewCount: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export const StationOperationalStatus = {
  Active: 'active',
  PermanentlyClosed: 'permanently_closed',
  TemporarilyClosed: 'temporarily_closed',
} as const;

export type StationOperationalStatus =
  (typeof StationOperationalStatus)[keyof typeof StationOperationalStatus];
export const StationOrder = {
  Default: 'DEFAULT',
  OpenFirstRecentlyUpdated: 'OPEN_FIRST_RECENTLY_UPDATED',
} as const;

export type StationOrder = (typeof StationOrder)[keyof typeof StationOrder];
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

export type StationStatusCountType = {
  __typename?: 'StationStatusCountType';
  count: Scalars['Int']['output'];
  /** An operationalStatus value: active, temporarily_closed or permanently_closed */
  status: Scalars['String']['output'];
};

export type StationSuggestionMergeType = {
  __typename?: 'StationSuggestionMergeType';
  /** The fields this merge wrote, before and after. A station's internal comment, which merges could write until ADR-332, is left out without station.view_pii over the station */
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
  /** 'pending', 'approved', 'adopted_edited', 'not_adopted', 'rejected', or 'revoked' */
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
  /** Internal back-office note on this station — null unless the caller holds station.view_pii here (ADR-332) */
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
  /** True if the back office made this station: `source` is 'official', as the `official` filter reads it */
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
  /** When anything about this station last changed: any field, property, photo or team assignment, or an approved or revoked suggestion. A pending or rejected suggestion, or a verdict on a property (pending, verified, rejected), leaves it as is */
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
  /** Review state: 'unverified', 'ai_verified', or 'human_verified' */
  verificationStatus?: Maybe<Scalars['String']['output']>;
  /** Whether the caller holds station.delete over this station, so a page offers a delete control only where the delete would be allowed */
  viewerCanDelete: Scalars['Boolean']['output'];
  /** Whether the caller holds station.edit over this station, so a page offers edit controls only where the edit would be allowed */
  viewerCanEdit: Scalars['Boolean']['output'];
  /** Whether the caller's station export would include this station, so a page can count an export before running it */
  viewerCanExport: Scalars['Boolean']['output'];
  /** Whether the caller holds station.view_history over this station, so a page offers the timeline only where reading it would be allowed */
  viewerCanViewHistory: Scalars['Boolean']['output'];
  /** Whether the contact fields on this station come back unmasked for the caller */
  viewerCanViewPii: Scalars['Boolean']['output'];
  /** Who can see this station: 'public' or 'restricted' */
  visibility?: Maybe<Scalars['String']['output']>;
};

export type StationTypeCountType = {
  __typename?: 'StationTypeCountType';
  count: Scalars['Int']['output'];
  /** How many of them the caller's station export of this type would include: none without station.export, and none on the row with no type, which the export can't ask for. It follows this request's filters, while the export takes the type alone, so the two agree only when no other filter is given */
  exportable: Scalars['Int']['output'];
  /** The station type; null for stations with none */
  type?: Maybe<Scalars['String']['output']>;
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
  /** Whether unassignTaskActor would remove this person for the caller, so a page offers it only there: the caller holds ticket.assign over the assignment (`own` is the assignee themselves, `zone` the need's ticket in the caller's team zones), and recruiting on the need was not stopped by hand, after which nobody may give a place back */
  viewerCanUnassign: Scalars['Boolean']['output'];
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

export type TeamAdmin = {
  __typename?: 'TeamAdmin';
  /** The account's verified email, if any */
  email?: Maybe<Scalars['String']['output']>;
  /** The real name given on applying, else the account name */
  name: Scalars['String']['output'];
  /** The account's verified phone, if any */
  phone?: Maybe<Scalars['String']['output']>;
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
  /** Always true: a team zone and its teams are shown on the public map to those signed in */
  isPublic: Scalars['Boolean']['output'];
  name?: Maybe<Scalars['String']['output']>;
  note?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
};

/** One 縣市 and its 鄉鎮市區, as a listed ticket's address names them */
export type TicketAreaType = {
  __typename?: 'TicketAreaType';
  /** 縣市 */
  county: Scalars['String']['output'];
  /** 鄉鎮市區 */
  town: Scalars['String']['output'];
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

export const TicketAvailability = {
  Available: 'available',
  Deleted: 'deleted',
  Merged: 'merged',
  NotFound: 'not_found',
} as const;

export type TicketAvailability =
  (typeof TicketAvailability)[keyof typeof TicketAvailability];
/** What a share link finds at a ticket's uuid: the state, nothing of the ticket */
export type TicketAvailabilityType = {
  __typename?: 'TicketAvailabilityType';
  /** Set only when status is merged: the ticket the request now lives in, which ticket(uuid) gives */
  replacedByUuid?: Maybe<Scalars['UUID']['output']>;
  status: TicketAvailability;
};

/** How many tickets one H3 cell holds, of those its caller is shown as the cell */
export type TicketCellType = {
  __typename?: 'TicketCellType';
  /** H3 index (hex), the same value TicketType.locationCell carries for these tickets */
  cell: Scalars['String']['output'];
  ticketCount: Scalars['Int']['output'];
  /** Of those, how many are urgent: a priority other than 'low' or 'medium' (trimmed, any case), and not 'in_progress' — the rule the site colours a ticket urgent by */
  urgentCount: Scalars['Int']['output'];
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

/** Another ticket a disputed ticket may duplicate */
export type TicketDuplicateRefType = {
  __typename?: 'TicketDuplicateRefType';
  title: Scalars['String']['output'];
  uuid: Scalars['UUID']['output'];
};

/** What the board's 行政區域 and 組織分配 filters can pick */
export type TicketFacetsType = {
  __typename?: 'TicketFacetsType';
  /** Every county and town pair the addresses of the tickets the caller sees in detail name */
  areas: Array<TicketAreaType>;
  /** Every team whose 責任區 holds a ticket the caller sees in detail, by name */
  teams: Array<AssignedTeamType>;
};

export const TicketListOrder = {
  NeedsFirst: 'NEEDS_FIRST',
  Newest: 'NEWEST',
} as const;

export type TicketListOrder =
  (typeof TicketListOrder)[keyof typeof TicketListOrder];
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

export type TicketStatsType = {
  __typename?: 'TicketStatsType';
  cancelled: Scalars['Int']['output'];
  completed: Scalars['Int']['output'];
  /** How many of those needs are short of people; the dashboard's volunteer_gap_needs */
  gapNeeds: Scalars['Int']['output'];
  /** People still short across open hr needs with a quantity: quantity less the people linked, never below 0. Other need types, and needs on completed or cancelled tickets, add nothing. The dashboard's volunteer_gap gives the same number (ADR-456) */
  gapPeople: Scalars['Int']['output'];
  inProgress: Scalars['Int']['output'];
  pending: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export const TicketStatus = {
  Cancelled: 'cancelled',
  Completed: 'completed',
  InProgress: 'in_progress',
  Pending: 'pending',
} as const;

export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];
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
  /** Number of people or units needed. Null only on a need filed before every need had to give one: unspecified and uncapped */
  quantity?: Maybe<Scalars['Int']['output']>;
  /** When the requester stopped recruiting for this need by hand (stopRecruiting); null if they never did — a need that filled by itself is fulfilled with no such time. Once set, nobody on the need can give their place back */
  recruitingStoppedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Origin of this task: 'user' when the site's identity made it, 'official' when a back-office one did. Tasks made before that rule keep what they had, 'gov' or 'import' */
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
  /** Whether the caller holds ticket.assign over this need as assigning someone else to it is checked, so a page offers 指派承接 only where it would be allowed: `own` is the need's creator, `zone` its ticket in the caller's team zones. Room on the need is not part of it */
  viewerCanAssign: Scalars['Boolean']['output'];
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
  /** The building map this ticket was filed under (createTicket's buildingMapUuid). Null when it was not filed under one, when that building map is deleted, and to a caller without ticket.view_detail here */
  buildingMapUuid?: Maybe<Scalars['UUID']['output']>;
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
  /** The teams of the 責任區 this ticket lies in, by name, each once (ADR-422). Empty when it lies in none, and to a caller without ticket.view_detail here */
  responsibleTeams: Array<AssignedTeamType>;
  /** Street address and space detail for where help is needed. Null to a caller without ticket.view_detail here, and null when the ticket carries no address */
  secondaryLocation?: Maybe<SecondaryLocationType>;
  /** Lifecycle state: 'pending', 'in_progress', 'completed', or 'cancelled' */
  status: Scalars['String']['output'];
  /** Other tickets this one may repeat, to anyone (ADR-454): the tickets verificationStatus names, each once, oldest card first; empty when there are none. Not whether a verdict was given on them */
  suspectedDuplicateOf: Array<TicketDuplicateRefType>;
  /** Type of help needed: 'rescue', 'supply', 'medical', or 'hr' */
  taskType?: Maybe<Scalars['String']['output']>;
  tasks: Array<TicketTaskType>;
  /** Short subject line describing the request */
  title: Scalars['String']['output'];
  /** When anything visible about this ticket last changed: a field, its address, disaster details, photos, a need or its items, its status, or a duplicate merge. A sign-up moves it only when it changes the status; a review verdict never does */
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
  /** Whether 重複審核 still waits on this ticket, and on which other tickets (ADR-443). Null when it does not. Anyone can read it (ADR-455): it names the tickets `suspectedDuplicateOf` does. Not the data check: that is `auditStatus` */
  verificationStatus?: Maybe<TicketVerificationType>;
  /** Whether the caller holds ticket.delete over this ticket, so a page offers a delete control only where the delete would be allowed */
  viewerCanDelete: Scalars['Boolean']['output'];
  /** Whether the caller holds ticket.edit over this ticket, so a page offers edit controls only where the edit would be allowed */
  viewerCanEdit: Scalars['Boolean']['output'];
  /** Whether the caller holds ticket.view_history over this ticket, so a page offers the timeline only where reading it would be allowed */
  viewerCanViewHistory: Scalars['Boolean']['output'];
};

export const TicketVerificationState = {
  Disputed: 'disputed',
} as const;

export type TicketVerificationState =
  (typeof TicketVerificationState)[keyof typeof TicketVerificationState];
/** Where a ticket stands in 重複審核 (ADR-443) */
export type TicketVerificationType = {
  __typename?: 'TicketVerificationType';
  /** The tickets on the far side of those cards, each once, oldest card first; never empty */
  duplicateOf: Array<TicketDuplicateRefType>;
  /** 'disputed': a card on this ticket or one of its needs waits for a verdict, or was judged a duplicate and not merged yet, and 重複審核 can still merge it: its far side is another ticket, neither cancelled nor deleted */
  state: TicketVerificationState;
};

/** How many tickets match a `tickets` filter, and the box their map points span */
export type TicketsExtentType = {
  __typename?: 'TicketsExtentType';
  /** The `tickets` totalCount for the same filters */
  count: Scalars['Int']['output'];
  /** Northern edge; null when none match */
  maxLat?: Maybe<Scalars['Float']['output']>;
  /** Eastern edge; null when none match */
  maxLng?: Maybe<Scalars['Float']['output']>;
  /** Southern edge of the box around the points shown; null when none match */
  minLat?: Maybe<Scalars['Float']['output']>;
  /** Western edge; null when none match */
  minLng?: Maybe<Scalars['Float']['output']>;
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

export type AdminPageInfoFragment = {
  __typename?: 'PageInfo';
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type AdminTicketFieldsFragment = {
  __typename?: 'TicketType';
  uuid: string;
  title: string;
  description?: string | null;
  geometry?: Geometry | null;
  status: string;
  priority: string;
  taskType?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  disasterTypes: Array<string>;
  locationCell?: string | null;
  buildingMapUuid?: string | null;
  viewerCanEdit: boolean;
  viewerCanDelete: boolean;
  viewerCanViewHistory: boolean;
  secondaryLocation?: {
    __typename?: 'SecondaryLocationType';
    county?: string | null;
    town?: string | null;
    floor?: string | null;
  } | null;
};

export type AdminTaskFieldsFragment = {
  __typename?: 'TicketTaskType';
  uuid: string;
  ticketUuid: string;
  taskType: string;
  taskName: string;
  taskDescription?: string | null;
  quantity?: number | null;
  status: string;
  progressNote?: string | null;
  source: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  assignedCount: number;
  recruitingStoppedAt?: string | null;
  assignments: Array<{
    __typename?: 'TaskAssignmentType';
    uuid: string;
    actorUuid: string;
    actorName?: string | null;
    role?: string | null;
    status: string;
    assignedAt?: string | null;
    updatedAt?: string | null;
  }>;
};

export type AdminStationFieldsFragment = {
  __typename?: 'StationType';
  uuid: string;
  type?: string | null;
  name?: string | null;
  description?: string | null;
  geometry?: Geometry | null;
  opHour?: string | null;
  level: number;
  comment?: string | null;
  source?: string | null;
  visibility?: string | null;
  verificationStatus?: string | null;
  operationalStatus: string;
  statusChangedAt?: string | null;
  supplyStatus?: string | null;
  pendingSuggestedFields: Array<string>;
  isDuplicate: boolean;
  isTemporary: boolean;
  isOfficial: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  viewerCanEdit: boolean;
  viewerCanDelete: boolean;
  viewerCanViewHistory: boolean;
  viewerCanViewPii: boolean;
  viewerCanExport: boolean;
  secondaryLocation?: {
    __typename?: 'SecondaryLocationType';
    county?: string | null;
    town?: string | null;
  } | null;
  assignedTeam?: {
    __typename?: 'AssignedTeamType';
    uuid: string;
    name: string;
    type: string;
  } | null;
};

export type AdminTicketsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  status?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
  needType?: InputMaybe<Scalars['String']['input']>;
  responsibleTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  unassignedOnly?: InputMaybe<Scalars['Boolean']['input']>;
  county?: InputMaybe<Scalars['String']['input']>;
  town?: InputMaybe<Scalars['String']['input']>;
  updatedAfter?: InputMaybe<Scalars['DateTime']['input']>;
  updatedBefore?: InputMaybe<Scalars['DateTime']['input']>;
  zoom?: InputMaybe<Scalars['Float']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type AdminTicketsQuery = {
  __typename?: 'Query';
  tickets: {
    __typename?: 'TicketConnection';
    items: Array<{
      __typename?: 'TicketType';
      uuid: string;
      title: string;
      description?: string | null;
      geometry?: Geometry | null;
      status: string;
      priority: string;
      taskType?: string | null;
      contactName?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      createdBy?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
      disasterTypes: Array<string>;
      locationCell?: string | null;
      buildingMapUuid?: string | null;
      viewerCanEdit: boolean;
      viewerCanDelete: boolean;
      viewerCanViewHistory: boolean;
      secondaryLocation?: {
        __typename?: 'SecondaryLocationType';
        fullAddress?: string | null;
        landmarkNote?: string | null;
        county?: string | null;
        town?: string | null;
        floor?: string | null;
      } | null;
      photos: Array<{ __typename?: 'PhotoType'; uuid: string }>;
      responsibleTeams: Array<{
        __typename?: 'AssignedTeamType';
        uuid: string;
        name: string;
      }>;
      verificationStatus?: {
        __typename?: 'TicketVerificationType';
        state: TicketVerificationState;
        duplicateOf: Array<{
          __typename?: 'TicketDuplicateRefType';
          uuid: string;
          title: string;
        }>;
      } | null;
      tasks: Array<{
        __typename?: 'TicketTaskType';
        uuid: string;
        ticketUuid: string;
        taskType: string;
        taskName: string;
        taskDescription?: string | null;
        quantity?: number | null;
        status: string;
        progressNote?: string | null;
        source: string;
        createdAt?: string | null;
        updatedAt?: string | null;
        assignedCount: number;
        recruitingStoppedAt?: string | null;
        assignments: Array<{
          __typename?: 'TaskAssignmentType';
          uuid: string;
          actorUuid: string;
          actorName?: string | null;
          role?: string | null;
          status: string;
          assignedAt?: string | null;
          updatedAt?: string | null;
        }>;
      }>;
    }>;
    pageInfo: {
      __typename?: 'PageInfo';
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
};

export type AdminTicketMapPinsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  status?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
  needType?: InputMaybe<Scalars['String']['input']>;
  responsibleTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  unassignedOnly?: InputMaybe<Scalars['Boolean']['input']>;
  county?: InputMaybe<Scalars['String']['input']>;
  town?: InputMaybe<Scalars['String']['input']>;
  updatedAfter?: InputMaybe<Scalars['DateTime']['input']>;
  updatedBefore?: InputMaybe<Scalars['DateTime']['input']>;
  zoom?: InputMaybe<Scalars['Float']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type AdminTicketMapPinsQuery = {
  __typename?: 'Query';
  tickets: {
    __typename?: 'TicketConnection';
    items: Array<{
      __typename?: 'TicketType';
      uuid: string;
      title: string;
      geometry?: Geometry | null;
      status: string;
      priority: string;
      locationCell?: string | null;
      buildingMapUuid?: string | null;
      secondaryLocation?: {
        __typename?: 'SecondaryLocationType';
        county?: string | null;
        town?: string | null;
        fullAddress?: string | null;
        landmarkNote?: string | null;
      } | null;
    }>;
    pageInfo: { __typename?: 'PageInfo'; totalCount: number };
  };
};

export type AdminTicketsExtentQueryVariables = Exact<{
  status?: InputMaybe<Scalars['String']['input']>;
  priority?: InputMaybe<Scalars['String']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
  needType?: InputMaybe<Scalars['String']['input']>;
  responsibleTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  unassignedOnly?: InputMaybe<Scalars['Boolean']['input']>;
  county?: InputMaybe<Scalars['String']['input']>;
  town?: InputMaybe<Scalars['String']['input']>;
  updatedAfter?: InputMaybe<Scalars['DateTime']['input']>;
  updatedBefore?: InputMaybe<Scalars['DateTime']['input']>;
}>;

export type AdminTicketsExtentQuery = {
  __typename?: 'Query';
  ticketsExtent: {
    __typename?: 'TicketsExtentType';
    count: number;
    minLat?: number | null;
    maxLat?: number | null;
    minLng?: number | null;
    maxLng?: number | null;
  };
};

export type AdminTicketFacetsQueryVariables = Exact<{ [key: string]: never }>;

export type AdminTicketFacetsQuery = {
  __typename?: 'Query';
  ticketFacets: {
    __typename?: 'TicketFacetsType';
    areas: Array<{
      __typename?: 'TicketAreaType';
      county: string;
      town: string;
    }>;
    teams: Array<{
      __typename?: 'AssignedTeamType';
      uuid: string;
      name: string;
    }>;
  };
};

export type AdminTicketStatsQueryVariables = Exact<{ [key: string]: never }>;

export type AdminTicketStatsQuery = {
  __typename?: 'Query';
  ticketStats: {
    __typename?: 'TicketStatsType';
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    gapPeople: number;
    gapNeeds: number;
  };
};

export type AdminTicketQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminTicketQuery = {
  __typename?: 'Query';
  ticket?: {
    __typename?: 'TicketType';
    uuid: string;
    title: string;
    description?: string | null;
    geometry?: Geometry | null;
    status: string;
    priority: string;
    taskType?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    disasterTypes: Array<string>;
    locationCell?: string | null;
    buildingMapUuid?: string | null;
    viewerCanEdit: boolean;
    viewerCanDelete: boolean;
    viewerCanViewHistory: boolean;
    responsibleTeams: Array<{
      __typename?: 'AssignedTeamType';
      uuid: string;
      name: string;
    }>;
    verificationStatus?: {
      __typename?: 'TicketVerificationType';
      state: TicketVerificationState;
      duplicateOf: Array<{
        __typename?: 'TicketDuplicateRefType';
        uuid: string;
        title: string;
      }>;
    } | null;
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
      floor?: string | null;
      room?: string | null;
      landmarkNote?: string | null;
      locationType: string;
      buildingSection?: string | null;
      spaceDescription?: string | null;
      victimSpace?: string | null;
      accessStatus?: string | null;
      poleId?: string | null;
      poleType?: string | null;
      poleNote?: string | null;
    } | null;
    photos: Array<{
      __typename?: 'PhotoType';
      uuid: string;
      url: string;
      createdAt?: string | null;
    }>;
    tasks: Array<{
      __typename?: 'TicketTaskType';
      viewerCanAssign: boolean;
      uuid: string;
      ticketUuid: string;
      taskType: string;
      taskName: string;
      taskDescription?: string | null;
      quantity?: number | null;
      status: string;
      progressNote?: string | null;
      source: string;
      createdAt?: string | null;
      updatedAt?: string | null;
      assignedCount: number;
      recruitingStoppedAt?: string | null;
      assignments: Array<{
        __typename?: 'TaskAssignmentType';
        uuid: string;
        viewerCanUnassign: boolean;
        actorUuid: string;
        actorName?: string | null;
        role?: string | null;
        status: string;
        assignedAt?: string | null;
        updatedAt?: string | null;
      }>;
      properties: Array<{
        __typename?: 'TaskPropertyType';
        uuid: string;
        propertyName: string;
        propertyValue: string;
        quantity?: number | null;
        status?: string | null;
        comment?: string | null;
      }>;
    }>;
    disasterDetails: Array<{
      __typename?: 'TicketDisasterDetailType';
      uuid: string;
      propertyName: string;
      value: string;
    }>;
  } | null;
};

export type AdminTicketTasksQueryVariables = Exact<{
  ticketUuid: Scalars['String']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type AdminTicketTasksQuery = {
  __typename?: 'Query';
  ticketTasks: Array<{
    __typename?: 'TicketTaskType';
    uuid: string;
    ticketUuid: string;
    taskType: string;
    taskName: string;
    taskDescription?: string | null;
    quantity?: number | null;
    status: string;
    progressNote?: string | null;
    source: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    assignedCount: number;
    recruitingStoppedAt?: string | null;
    assignments: Array<{
      __typename?: 'TaskAssignmentType';
      uuid: string;
      actorUuid: string;
      actorName?: string | null;
      role?: string | null;
      status: string;
      assignedAt?: string | null;
      updatedAt?: string | null;
    }>;
  }>;
};

export type AdminStationFacetsQueryVariables = Exact<{ [key: string]: never }>;

export type AdminStationFacetsQuery = {
  __typename?: 'Query';
  stationFacets: {
    __typename?: 'StationFacetsType';
    total: number;
    byStatus: Array<{
      __typename?: 'StationStatusCountType';
      status: string;
      count: number;
    }>;
  };
};

export type AdminStationsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  stationType?: InputMaybe<Scalars['String']['input']>;
  operationalStatus?: InputMaybe<StationOperationalStatus>;
  q?: InputMaybe<Scalars['String']['input']>;
  assignedTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  unassignedOnly?: InputMaybe<Scalars['Boolean']['input']>;
  hasPendingSuggestions?: InputMaybe<Scalars['Boolean']['input']>;
  reviewableOnly?: InputMaybe<Scalars['Boolean']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type AdminStationsQuery = {
  __typename?: 'Query';
  stations: {
    __typename?: 'StationConnection';
    items: Array<{
      __typename?: 'StationType';
      uuid: string;
      type?: string | null;
      name?: string | null;
      description?: string | null;
      geometry?: Geometry | null;
      opHour?: string | null;
      level: number;
      comment?: string | null;
      source?: string | null;
      visibility?: string | null;
      verificationStatus?: string | null;
      operationalStatus: string;
      statusChangedAt?: string | null;
      supplyStatus?: string | null;
      pendingSuggestedFields: Array<string>;
      isDuplicate: boolean;
      isTemporary: boolean;
      isOfficial: boolean;
      createdBy?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
      viewerCanEdit: boolean;
      viewerCanDelete: boolean;
      viewerCanViewHistory: boolean;
      viewerCanViewPii: boolean;
      viewerCanExport: boolean;
      secondaryLocation?: {
        __typename?: 'SecondaryLocationType';
        county?: string | null;
        town?: string | null;
      } | null;
      assignedTeam?: {
        __typename?: 'AssignedTeamType';
        uuid: string;
        name: string;
        type: string;
      } | null;
    }>;
    pageInfo: {
      __typename?: 'PageInfo';
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
};

export type AdminAssignableStationTeamsQueryVariables = Exact<{
  [key: string]: never;
}>;

export type AdminAssignableStationTeamsQuery = {
  __typename?: 'Query';
  assignableStationTeams: Array<{
    __typename?: 'AssignedTeamType';
    uuid: string;
    name: string;
    type: string;
  }>;
};

export type AdminStationQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminStationQuery = {
  __typename?: 'Query';
  station?: {
    __typename?: 'StationType';
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    uuid: string;
    type?: string | null;
    name?: string | null;
    description?: string | null;
    geometry?: Geometry | null;
    opHour?: string | null;
    level: number;
    comment?: string | null;
    source?: string | null;
    visibility?: string | null;
    verificationStatus?: string | null;
    operationalStatus: string;
    statusChangedAt?: string | null;
    supplyStatus?: string | null;
    pendingSuggestedFields: Array<string>;
    isDuplicate: boolean;
    isTemporary: boolean;
    isOfficial: boolean;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    viewerCanEdit: boolean;
    viewerCanDelete: boolean;
    viewerCanViewHistory: boolean;
    viewerCanViewPii: boolean;
    viewerCanExport: boolean;
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
      floor?: string | null;
      room?: string | null;
      poleId?: string | null;
      poleType?: string | null;
      poleNote?: string | null;
    } | null;
    photos: Array<{
      __typename?: 'PhotoType';
      uuid: string;
      url: string;
      createdAt?: string | null;
    }>;
    properties: Array<{
      __typename?: 'StationPropertyType';
      uuid: string;
      propertyType: string;
      propertyName: string;
      quantity?: number | null;
      comment?: string | null;
      status: string;
      weightings: number;
      createdAt?: string | null;
    }>;
    assignedTeam?: {
      __typename?: 'AssignedTeamType';
      uuid: string;
      name: string;
      type: string;
    } | null;
  } | null;
};

export type AdminReverseGeocodeQueryVariables = Exact<{
  lat: Scalars['Float']['input'];
  lng: Scalars['Float']['input'];
}>;

export type AdminReverseGeocodeQuery = {
  __typename?: 'Query';
  reverseGeocode: {
    __typename?: 'AddressLookupType';
    status: string;
    fullAddress?: string | null;
    floor?: string | null;
    room?: string | null;
    addressToken?: string | null;
    lat?: number | null;
    lng?: number | null;
    buildingSection?: string | null;
  };
};

export type AdminStationReviewQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminStationReviewQuery = {
  __typename?: 'Query';
  station?: {
    __typename?: 'StationType';
    uuid: string;
    type?: string | null;
    name?: string | null;
    description?: string | null;
    geometry?: Geometry | null;
    opHour?: string | null;
    level: number;
    comment?: string | null;
    source?: string | null;
    visibility?: string | null;
    verificationStatus?: string | null;
    operationalStatus: string;
    statusChangedAt?: string | null;
    supplyStatus?: string | null;
    pendingSuggestedFields: Array<string>;
    isDuplicate: boolean;
    isTemporary: boolean;
    isOfficial: boolean;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    viewerCanEdit: boolean;
    viewerCanDelete: boolean;
    viewerCanViewHistory: boolean;
    viewerCanViewPii: boolean;
    viewerCanExport: boolean;
    properties: Array<{
      __typename?: 'StationPropertyType';
      uuid: string;
      propertyName: string;
      quantity?: number | null;
      comment?: string | null;
      pendingSuggestedFields: Array<string>;
    }>;
    suggestedFields: Array<{
      __typename?: 'SuggestedFieldType';
      targetType: string;
      targetUuid: string;
      fieldName: string;
      proposedValues: Array<string>;
      suggestionCount: number;
      comments: Array<string>;
      firstSuggestedAt?: string | null;
    }>;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      county?: string | null;
      town?: string | null;
    } | null;
    assignedTeam?: {
      __typename?: 'AssignedTeamType';
      uuid: string;
      name: string;
      type: string;
    } | null;
  } | null;
  suggestableFields: Array<{
    __typename?: 'SuggestableFieldType';
    fieldName: string;
    dataType: string;
    enumOptions?: Array<string> | null;
  }>;
};

export type AdminAnnouncementsQueryVariables = Exact<{
  filter?: InputMaybe<AnnouncementFilter>;
  placement?: InputMaybe<AnnouncementPlacement>;
}>;

export type AdminAnnouncementsQuery = {
  __typename?: 'Query';
  announcements: Array<{
    __typename?: 'AnnouncementType';
    uuid: string;
    content: string;
    active: boolean;
    placement: string;
    publishedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    publisher?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
  }>;
};

export type AdminBriefingFieldsFragment = {
  __typename?: 'BriefingType';
  uuid: string;
  templateUuid?: string | null;
  content: string;
  tags: Array<string>;
  state: string;
  status: BriefingStatus;
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  creator?: {
    __typename?: 'UserRefType';
    uuid: string;
    name?: string | null;
  } | null;
  updater?: {
    __typename?: 'UserRefType';
    uuid: string;
    name?: string | null;
  } | null;
  publisher?: {
    __typename?: 'UserRefType';
    uuid: string;
    name?: string | null;
  } | null;
};

export type AdminBriefingsQueryVariables = Exact<{
  state?: InputMaybe<BriefingState>;
  tag?: InputMaybe<Scalars['String']['input']>;
  status?: BriefingStatusFilter;
}>;

export type AdminBriefingsQuery = {
  __typename?: 'Query';
  briefings: Array<{
    __typename?: 'BriefingType';
    uuid: string;
    templateUuid?: string | null;
    content: string;
    tags: Array<string>;
    state: string;
    status: BriefingStatus;
    publishedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    creator?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
    updater?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
    publisher?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
  }>;
};

export type AdminBriefingTemplatesQueryVariables = Exact<{
  state?: InputMaybe<BriefingState>;
  tag?: InputMaybe<Scalars['String']['input']>;
}>;

export type AdminBriefingTemplatesQuery = {
  __typename?: 'Query';
  briefingTemplates: Array<{
    __typename?: 'BriefingTemplateType';
    uuid: string;
    content: string;
    tags: Array<string>;
    state: string;
    createdAt?: string | null;
    updatedAt?: string | null;
  }>;
};

export type AdminStationPropertyConfigsQueryVariables = Exact<{
  stationType: Scalars['String']['input'];
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type AdminStationPropertyConfigsQuery = {
  __typename?: 'Query';
  stationPropertyConfigs: Array<{
    __typename?: 'StationPropertyConfigType';
    uuid: string;
    stationType: string;
    propertyName: string;
    dataType: FieldDataType;
    enumOptions?: Array<string> | null;
    unit?: string | null;
    label?: string | null;
    displayLabel: string;
    sortOrder: number;
    isActive: boolean;
  }>;
};

export type AdminTaskPropertyConfigsQueryVariables = Exact<{
  taskType: Scalars['String']['input'];
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type AdminTaskPropertyConfigsQuery = {
  __typename?: 'Query';
  taskPropertyConfigs: Array<{
    __typename?: 'TaskPropertyConfigType';
    uuid: string;
    taskType: string;
    propertyName: string;
    dataType: FieldDataType;
    enumOptions?: Array<string> | null;
    unit?: string | null;
    disasterTypes: Array<string>;
    label?: string | null;
    displayLabel: string;
    sortOrder: number;
    isActive: boolean;
  }>;
};

export type AdminTicketPropertyConfigsQueryVariables = Exact<{
  disasterTypes: Array<Scalars['String']['input']> | Scalars['String']['input'];
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type AdminTicketPropertyConfigsQuery = {
  __typename?: 'Query';
  ticketPropertyConfigs: Array<{
    __typename?: 'TicketPropertyConfigType';
    uuid: string;
    propertyName: string;
    dataType: FieldDataType;
    enumOptions?: Array<string> | null;
    unit?: string | null;
    disasterTypes: Array<string>;
    label?: string | null;
    displayLabel: string;
    hint?: string | null;
    isActive: boolean;
  }>;
};

export type AdminTeamDirectoryQueryVariables = Exact<{ [key: string]: never }>;

export type AdminTeamDirectoryQuery = {
  __typename?: 'Query';
  roleRequestTeams: Array<{
    __typename?: 'RoleRequestTeam';
    uuid: string;
    name: string;
    type: RoleRequestTeamType;
    admins?: Array<{
      __typename?: 'TeamAdmin';
      name: string;
      phone?: string | null;
      email?: string | null;
    }> | null;
  }>;
};

export type AdminDisasterTypesQueryVariables = Exact<{
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type AdminDisasterTypesQuery = {
  __typename?: 'Query';
  disasterTypes: Array<{
    __typename?: 'DisasterTypeType';
    uuid: string;
    key: string;
    label: string;
    isActive: boolean;
  }>;
};

export type AdminCurrentDisasterQueryVariables = Exact<{
  [key: string]: never;
}>;

export type AdminCurrentDisasterQuery = {
  __typename?: 'Query';
  currentDisaster?: {
    __typename?: 'CurrentDisasterType';
    name: string;
    shortName?: string | null;
    mapView?: {
      __typename?: 'MapViewType';
      lat: number;
      lng: number;
      zoom: number;
    } | null;
  } | null;
};

export type AdminCreateTicketMutationVariables = Exact<{
  input: CreateTicketInput;
}>;

export type AdminCreateTicketMutation = {
  __typename?: 'Mutation';
  createTicket:
    | {
        __typename: 'DuplicatesSuspected';
        suspects: Array<{
          __typename?: 'DuplicateSuspect';
          draftRef: string;
          relatedKind: string;
          relatedUuid: string;
          relatedTicketUuid?: string | null;
        }>;
      }
    | {
        __typename: 'TicketCreated';
        ticket: {
          __typename?: 'TicketType';
          uuid: string;
          title: string;
          description?: string | null;
          geometry?: Geometry | null;
          status: string;
          priority: string;
          taskType?: string | null;
          contactName?: string | null;
          contactEmail?: string | null;
          contactPhone?: string | null;
          createdBy?: string | null;
          createdAt?: string | null;
          updatedAt?: string | null;
          disasterTypes: Array<string>;
          locationCell?: string | null;
          buildingMapUuid?: string | null;
          viewerCanEdit: boolean;
          viewerCanDelete: boolean;
          viewerCanViewHistory: boolean;
          secondaryLocation?: {
            __typename?: 'SecondaryLocationType';
            county?: string | null;
            town?: string | null;
            floor?: string | null;
          } | null;
        };
      };
};

export type AdminUpdateTicketMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateTicketInput;
}>;

export type AdminUpdateTicketMutation = {
  __typename?: 'Mutation';
  updateTicket: {
    __typename?: 'TicketType';
    uuid: string;
    title: string;
    description?: string | null;
    geometry?: Geometry | null;
    status: string;
    priority: string;
    taskType?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    disasterTypes: Array<string>;
    locationCell?: string | null;
    buildingMapUuid?: string | null;
    viewerCanEdit: boolean;
    viewerCanDelete: boolean;
    viewerCanViewHistory: boolean;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      county?: string | null;
      town?: string | null;
      floor?: string | null;
    } | null;
  };
};

export type AdminDeleteTicketMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteTicketMutation = {
  __typename?: 'Mutation';
  deleteTicket: boolean;
};

export type AdminSetTicketDisasterDetailsMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  details: Array<TicketDisasterDetailInput> | TicketDisasterDetailInput;
}>;

export type AdminSetTicketDisasterDetailsMutation = {
  __typename?: 'Mutation';
  setTicketDisasterDetails: Array<{
    __typename?: 'TicketDisasterDetailType';
    uuid: string;
    propertyName: string;
    value: string;
  }>;
};

export type AdminCreateTicketTaskMutationVariables = Exact<{
  input: CreateTicketTaskInput;
  acknowledgedDuplicateOf?: InputMaybe<Scalars['String']['input']>;
}>;

export type AdminCreateTicketTaskMutation = {
  __typename?: 'Mutation';
  createTicketTask:
    | {
        __typename: 'DuplicatesSuspected';
        suspects: Array<{
          __typename?: 'DuplicateSuspect';
          draftRef: string;
          relatedKind: string;
          relatedUuid: string;
          relatedTicketUuid?: string | null;
        }>;
      }
    | {
        __typename: 'TicketTaskCreated';
        task: {
          __typename?: 'TicketTaskType';
          uuid: string;
          ticketUuid: string;
          taskType: string;
          taskName: string;
          taskDescription?: string | null;
          quantity?: number | null;
          status: string;
          progressNote?: string | null;
          source: string;
          createdAt?: string | null;
          updatedAt?: string | null;
          assignedCount: number;
          recruitingStoppedAt?: string | null;
          assignments: Array<{
            __typename?: 'TaskAssignmentType';
            uuid: string;
            actorUuid: string;
            actorName?: string | null;
            role?: string | null;
            status: string;
            assignedAt?: string | null;
            updatedAt?: string | null;
          }>;
        };
      };
};

export type AdminUpdateTicketTaskMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateTicketTaskInput;
}>;

export type AdminUpdateTicketTaskMutation = {
  __typename?: 'Mutation';
  updateTicketTask: {
    __typename?: 'TicketTaskType';
    uuid: string;
    ticketUuid: string;
    taskType: string;
    taskName: string;
    taskDescription?: string | null;
    quantity?: number | null;
    status: string;
    progressNote?: string | null;
    source: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    assignedCount: number;
    recruitingStoppedAt?: string | null;
    assignments: Array<{
      __typename?: 'TaskAssignmentType';
      uuid: string;
      actorUuid: string;
      actorName?: string | null;
      role?: string | null;
      status: string;
      assignedAt?: string | null;
      updatedAt?: string | null;
    }>;
  };
};

export type AdminAssignTaskActorMutationVariables = Exact<{
  taskUuid: Scalars['UUID']['input'];
  actorUuid?: InputMaybe<Scalars['UUID']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
}>;

export type AdminAssignTaskActorMutation = {
  __typename?: 'Mutation';
  assignTaskActor: {
    __typename?: 'TaskAssignmentType';
    uuid: string;
    taskUuid: string;
    actorUuid: string;
    role?: string | null;
    status: string;
    assignedAt?: string | null;
  };
};

export type AdminUpdateTaskAssignmentMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateTaskAssignmentInput;
}>;

export type AdminUpdateTaskAssignmentMutation = {
  __typename?: 'Mutation';
  updateTaskAssignment: {
    __typename?: 'TaskAssignmentType';
    uuid: string;
    taskUuid: string;
    actorUuid: string;
    role?: string | null;
    status: string;
    updatedAt?: string | null;
  };
};

export type AdminStopRecruitingMutationVariables = Exact<{
  taskUuid: Scalars['UUID']['input'];
}>;

export type AdminStopRecruitingMutation = {
  __typename?: 'Mutation';
  stopRecruiting: {
    __typename?: 'TicketTaskType';
    uuid: string;
    ticketUuid: string;
    taskType: string;
    taskName: string;
    taskDescription?: string | null;
    quantity?: number | null;
    status: string;
    progressNote?: string | null;
    source: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    assignedCount: number;
    recruitingStoppedAt?: string | null;
    assignments: Array<{
      __typename?: 'TaskAssignmentType';
      uuid: string;
      actorUuid: string;
      actorName?: string | null;
      role?: string | null;
      status: string;
      assignedAt?: string | null;
      updatedAt?: string | null;
    }>;
  };
};

export type AdminDeleteTicketTaskMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteTicketTaskMutation = {
  __typename?: 'Mutation';
  deleteTicketTask: boolean;
};

export type AdminAttachTicketPhotoMutationVariables = Exact<{
  ticketUuid: Scalars['UUID']['input'];
  url: Scalars['String']['input'];
}>;

export type AdminAttachTicketPhotoMutation = {
  __typename?: 'Mutation';
  attachTicketPhoto: {
    __typename?: 'PhotoType';
    uuid: string;
    url: string;
    createdAt?: string | null;
  };
};

export type AdminDetachTicketPhotoMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDetachTicketPhotoMutation = {
  __typename?: 'Mutation';
  detachTicketPhoto: boolean;
};

export type AdminUnassignTaskActorMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminUnassignTaskActorMutation = {
  __typename?: 'Mutation';
  unassignTaskActor: boolean;
};

export type AdminCreateStationMutationVariables = Exact<{
  input: CreateStationInput;
  acknowledgedDuplicateOf?: InputMaybe<Scalars['String']['input']>;
}>;

export type AdminCreateStationMutation = {
  __typename?: 'Mutation';
  createStation:
    | {
        __typename: 'DuplicatesSuspected';
        suspects: Array<{
          __typename?: 'DuplicateSuspect';
          relatedKind: string;
          relatedUuid: string;
        }>;
      }
    | {
        __typename: 'StationCreated';
        station: {
          __typename?: 'StationType';
          uuid: string;
          type?: string | null;
          name?: string | null;
          description?: string | null;
          geometry?: Geometry | null;
          opHour?: string | null;
          level: number;
          comment?: string | null;
          source?: string | null;
          visibility?: string | null;
          verificationStatus?: string | null;
          operationalStatus: string;
          statusChangedAt?: string | null;
          supplyStatus?: string | null;
          pendingSuggestedFields: Array<string>;
          isDuplicate: boolean;
          isTemporary: boolean;
          isOfficial: boolean;
          createdBy?: string | null;
          createdAt?: string | null;
          updatedAt?: string | null;
          viewerCanEdit: boolean;
          viewerCanDelete: boolean;
          viewerCanViewHistory: boolean;
          viewerCanViewPii: boolean;
          viewerCanExport: boolean;
          secondaryLocation?: {
            __typename?: 'SecondaryLocationType';
            county?: string | null;
            town?: string | null;
          } | null;
          assignedTeam?: {
            __typename?: 'AssignedTeamType';
            uuid: string;
            name: string;
            type: string;
          } | null;
        };
      };
};

export type AdminUpdateStationMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateStationInput;
}>;

export type AdminUpdateStationMutation = {
  __typename?: 'Mutation';
  updateStation: {
    __typename?: 'StationType';
    uuid: string;
    type?: string | null;
    name?: string | null;
    description?: string | null;
    geometry?: Geometry | null;
    opHour?: string | null;
    level: number;
    comment?: string | null;
    source?: string | null;
    visibility?: string | null;
    verificationStatus?: string | null;
    operationalStatus: string;
    statusChangedAt?: string | null;
    supplyStatus?: string | null;
    pendingSuggestedFields: Array<string>;
    isDuplicate: boolean;
    isTemporary: boolean;
    isOfficial: boolean;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    viewerCanEdit: boolean;
    viewerCanDelete: boolean;
    viewerCanViewHistory: boolean;
    viewerCanViewPii: boolean;
    viewerCanExport: boolean;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      county?: string | null;
      town?: string | null;
    } | null;
    assignedTeam?: {
      __typename?: 'AssignedTeamType';
      uuid: string;
      name: string;
      type: string;
    } | null;
  };
};

export type AdminDeleteStationMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteStationMutation = {
  __typename?: 'Mutation';
  deleteStation: boolean;
};

export type AdminMergeStationSuggestionsMutationVariables = Exact<{
  stationUuid: Scalars['UUID']['input'];
  decisions: Array<SuggestionDecisionInput> | SuggestionDecisionInput;
  reviewNote?: InputMaybe<Scalars['String']['input']>;
}>;

export type AdminMergeStationSuggestionsMutation = {
  __typename?: 'Mutation';
  mergeStationSuggestions: {
    __typename?: 'StationSuggestionMergeType';
    uuid: string;
    status: string;
    changes: Array<{
      __typename?: 'SuggestionChangeType';
      targetType: string;
      targetUuid: string;
      fieldName: string;
      before?: string | null;
      after?: string | null;
    }>;
  };
};

export type AdminAssignStationMutationVariables = Exact<{
  stationUuid: Scalars['UUID']['input'];
  teamUuid: Scalars['UUID']['input'];
}>;

export type AdminAssignStationMutation = {
  __typename?: 'Mutation';
  assignStationToTeam: {
    __typename?: 'StationType';
    uuid: string;
    type?: string | null;
    name?: string | null;
    description?: string | null;
    geometry?: Geometry | null;
    opHour?: string | null;
    level: number;
    comment?: string | null;
    source?: string | null;
    visibility?: string | null;
    verificationStatus?: string | null;
    operationalStatus: string;
    statusChangedAt?: string | null;
    supplyStatus?: string | null;
    pendingSuggestedFields: Array<string>;
    isDuplicate: boolean;
    isTemporary: boolean;
    isOfficial: boolean;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    viewerCanEdit: boolean;
    viewerCanDelete: boolean;
    viewerCanViewHistory: boolean;
    viewerCanViewPii: boolean;
    viewerCanExport: boolean;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      county?: string | null;
      town?: string | null;
    } | null;
    assignedTeam?: {
      __typename?: 'AssignedTeamType';
      uuid: string;
      name: string;
      type: string;
    } | null;
  };
};

export type AdminUnassignStationMutationVariables = Exact<{
  stationUuid: Scalars['UUID']['input'];
}>;

export type AdminUnassignStationMutation = {
  __typename?: 'Mutation';
  unassignStation: {
    __typename?: 'StationType';
    uuid: string;
    type?: string | null;
    name?: string | null;
    description?: string | null;
    geometry?: Geometry | null;
    opHour?: string | null;
    level: number;
    comment?: string | null;
    source?: string | null;
    visibility?: string | null;
    verificationStatus?: string | null;
    operationalStatus: string;
    statusChangedAt?: string | null;
    supplyStatus?: string | null;
    pendingSuggestedFields: Array<string>;
    isDuplicate: boolean;
    isTemporary: boolean;
    isOfficial: boolean;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    viewerCanEdit: boolean;
    viewerCanDelete: boolean;
    viewerCanViewHistory: boolean;
    viewerCanViewPii: boolean;
    viewerCanExport: boolean;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      county?: string | null;
      town?: string | null;
    } | null;
    assignedTeam?: {
      __typename?: 'AssignedTeamType';
      uuid: string;
      name: string;
      type: string;
    } | null;
  };
};

export type AdminAttachStationPhotoMutationVariables = Exact<{
  stationUuid: Scalars['UUID']['input'];
  url: Scalars['String']['input'];
}>;

export type AdminAttachStationPhotoMutation = {
  __typename?: 'Mutation';
  attachStationPhoto: {
    __typename?: 'PhotoType';
    uuid: string;
    url: string;
    createdAt?: string | null;
  };
};

export type AdminDetachStationPhotoMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDetachStationPhotoMutation = {
  __typename?: 'Mutation';
  detachStationPhoto: boolean;
};

export type AdminCreateStationPropertyMutationVariables = Exact<{
  input: CreateStationPropertyInput;
}>;

export type AdminCreateStationPropertyMutation = {
  __typename?: 'Mutation';
  createStationProperty: {
    __typename?: 'StationPropertyType';
    uuid: string;
    stationUuid: string;
    propertyType: string;
    propertyName: string;
    quantity?: number | null;
    status: string;
    comment?: string | null;
  };
};

export type AdminUpdateStationPropertyMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateStationPropertyInput;
}>;

export type AdminUpdateStationPropertyMutation = {
  __typename?: 'Mutation';
  updateStationProperty: {
    __typename?: 'StationPropertyType';
    uuid: string;
    stationUuid: string;
    propertyType: string;
    propertyName: string;
    quantity?: number | null;
    status: string;
    comment?: string | null;
  };
};

export type AdminCreateTaskPropertyMutationVariables = Exact<{
  input: CreateTaskPropertyInput;
}>;

export type AdminCreateTaskPropertyMutation = {
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
  };
};

export type AdminUpdateTaskPropertyMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateTaskPropertyInput;
}>;

export type AdminUpdateTaskPropertyMutation = {
  __typename?: 'Mutation';
  updateTaskProperty: {
    __typename?: 'TaskPropertyType';
    uuid: string;
    taskUuid: string;
    propertyName: string;
    propertyValue: string;
    quantity?: number | null;
    status?: string | null;
    comment?: string | null;
  };
};

export type AdminCreateAnnouncementMutationVariables = Exact<{
  input: CreateAnnouncementInput;
}>;

export type AdminCreateAnnouncementMutation = {
  __typename?: 'Mutation';
  createAnnouncement: {
    __typename?: 'AnnouncementType';
    uuid: string;
    content: string;
    active: boolean;
  };
};

export type AdminUpdateAnnouncementMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateAnnouncementInput;
}>;

export type AdminUpdateAnnouncementMutation = {
  __typename?: 'Mutation';
  updateAnnouncement: {
    __typename?: 'AnnouncementType';
    uuid: string;
    content: string;
    active: boolean;
  };
};

export type AdminDeleteAnnouncementMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteAnnouncementMutation = {
  __typename?: 'Mutation';
  deleteAnnouncement: boolean;
};

export type AdminSetAnnouncementActiveMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  active: Scalars['Boolean']['input'];
}>;

export type AdminSetAnnouncementActiveMutation = {
  __typename?: 'Mutation';
  setAnnouncementActive: {
    __typename?: 'AnnouncementType';
    uuid: string;
    active: boolean;
  };
};

export type AdminGenerateBriefingMutationVariables = Exact<{
  input: GenerateBriefingInput;
}>;

export type AdminGenerateBriefingMutation = {
  __typename?: 'Mutation';
  generateBriefing: {
    __typename?: 'BriefingType';
    uuid: string;
    templateUuid?: string | null;
    content: string;
    tags: Array<string>;
    state: string;
    status: BriefingStatus;
    publishedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    creator?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
    updater?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
    publisher?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
  };
};

export type AdminUpdateBriefingMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateBriefingInput;
}>;

export type AdminUpdateBriefingMutation = {
  __typename?: 'Mutation';
  updateBriefing: {
    __typename?: 'BriefingType';
    uuid: string;
    templateUuid?: string | null;
    content: string;
    tags: Array<string>;
    state: string;
    status: BriefingStatus;
    publishedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    creator?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
    updater?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
    publisher?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
  };
};

export type AdminPublishBriefingMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminPublishBriefingMutation = {
  __typename?: 'Mutation';
  publishBriefing: {
    __typename?: 'BriefingType';
    uuid: string;
    templateUuid?: string | null;
    content: string;
    tags: Array<string>;
    state: string;
    status: BriefingStatus;
    publishedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    creator?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
    updater?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
    publisher?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
  };
};

export type AdminTakeDownBriefingMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminTakeDownBriefingMutation = {
  __typename?: 'Mutation';
  takeDownBriefing: {
    __typename?: 'BriefingType';
    uuid: string;
    templateUuid?: string | null;
    content: string;
    tags: Array<string>;
    state: string;
    status: BriefingStatus;
    publishedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    creator?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
    updater?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
    publisher?: {
      __typename?: 'UserRefType';
      uuid: string;
      name?: string | null;
    } | null;
  };
};

export type AdminDeleteBriefingMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteBriefingMutation = {
  __typename?: 'Mutation';
  deleteBriefing: boolean;
};

export type AdminCreateBriefingTemplateMutationVariables = Exact<{
  input: CreateBriefingTemplateInput;
}>;

export type AdminCreateBriefingTemplateMutation = {
  __typename?: 'Mutation';
  createBriefingTemplate: {
    __typename?: 'BriefingTemplateType';
    uuid: string;
    content: string;
    tags: Array<string>;
    state: string;
  };
};

export type AdminUpdateBriefingTemplateMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateBriefingTemplateInput;
}>;

export type AdminUpdateBriefingTemplateMutation = {
  __typename?: 'Mutation';
  updateBriefingTemplate: {
    __typename?: 'BriefingTemplateType';
    uuid: string;
    content: string;
    tags: Array<string>;
    state: string;
  };
};

export type AdminDeleteBriefingTemplateMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteBriefingTemplateMutation = {
  __typename?: 'Mutation';
  deleteBriefingTemplate: boolean;
};

export type AdminUpsertStationPropertyConfigMutationVariables = Exact<{
  stationType: Scalars['String']['input'];
  input: UpsertPropertyConfigInput;
}>;

export type AdminUpsertStationPropertyConfigMutation = {
  __typename?: 'Mutation';
  upsertStationPropertyConfig: {
    __typename?: 'StationPropertyConfigType';
    uuid: string;
    propertyName: string;
  };
};

export type AdminUpsertTaskPropertyConfigMutationVariables = Exact<{
  taskType: Scalars['String']['input'];
  input: UpsertPropertyConfigInput;
}>;

export type AdminUpsertTaskPropertyConfigMutation = {
  __typename?: 'Mutation';
  upsertTaskPropertyConfig: {
    __typename?: 'TaskPropertyConfigType';
    uuid: string;
    propertyName: string;
  };
};

export type AdminUpsertTicketPropertyConfigMutationVariables = Exact<{
  input: UpsertTicketPropertyConfigInput;
}>;

export type AdminUpsertTicketPropertyConfigMutation = {
  __typename?: 'Mutation';
  upsertTicketPropertyConfig: {
    __typename?: 'TicketPropertyConfigType';
    uuid: string;
    propertyName: string;
  };
};

export type AdminUpsertDisasterTypeMutationVariables = Exact<{
  input: UpsertDisasterTypeInput;
}>;

export type AdminUpsertDisasterTypeMutation = {
  __typename?: 'Mutation';
  upsertDisasterType: {
    __typename?: 'DisasterTypeType';
    uuid: string;
    key: string;
    label: string;
  };
};

export type AdminHazardousZoneSourceQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminHazardousZoneSourceQuery = {
  __typename?: 'Query';
  hazardousZone?: {
    __typename?: 'HazardousZoneType';
    uuid: string;
    informationSource?: string | null;
  } | null;
};

export type AdminCreateAreaMutationVariables = Exact<{
  input: CreateAreaInput;
}>;

export type AdminCreateAreaMutation = {
  __typename?: 'Mutation';
  createArea: {
    __typename?: 'AreaType';
    uuid: string;
    type: string;
    name?: string | null;
  };
};

export type AdminUpdateAreaMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateAreaInput;
}>;

export type AdminUpdateAreaMutation = {
  __typename?: 'Mutation';
  updateArea: {
    __typename?: 'AreaType';
    uuid: string;
    name?: string | null;
    note?: string | null;
    isPublic: boolean;
  };
};

export type AdminDeleteAreaMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteAreaMutation = {
  __typename?: 'Mutation';
  deleteArea: boolean;
};

export type AdminAssignZoneToTeamMutationVariables = Exact<{
  input: ZoneTeamAssignmentInput;
}>;

export type AdminAssignZoneToTeamMutation = {
  __typename?: 'Mutation';
  assignZoneToTeam: {
    __typename?: 'ZoneAssignmentType';
    zoneUuid: string;
    teamUuid: string;
    assignedAt?: string | null;
  };
};

export type AdminRemoveZoneFromTeamMutationVariables = Exact<{
  input: ZoneTeamAssignmentInput;
}>;

export type AdminRemoveZoneFromTeamMutation = {
  __typename?: 'Mutation';
  removeZoneFromTeam: boolean;
};

export type AdminBuildingMapFieldsFragment = {
  __typename?: 'BuildingMapType';
  uuid: string;
  name: string;
  geometry?: Geometry | null;
  floorsAboveGround: number;
  floorsBelowGround: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  floors: Array<{ __typename?: 'BuildingFloorType'; label: string }>;
  secondaryLocation?: {
    __typename?: 'SecondaryLocationType';
    fullAddress?: string | null;
    normalizationStatus?: string | null;
  } | null;
};

export type AdminSpaceTicketFieldsFragment = {
  __typename?: 'TicketType';
  uuid: string;
  propertyName: string;
  title: string;
  status: string;
  priority: string;
  disasterTypes: Array<string>;
  updatedAt?: string | null;
  secondaryLocation?: {
    __typename?: 'SecondaryLocationType';
    county?: string | null;
    town?: string | null;
    floor?: string | null;
    room?: string | null;
  } | null;
  responsibleTeams: Array<{ __typename?: 'AssignedTeamType'; uuid: string }>;
  tasks: Array<{
    __typename?: 'TicketTaskType';
    uuid: string;
    taskType: string;
    status: string;
    quantity?: number | null;
    assignedCount: number;
  }>;
};

export type AdminBuildingMapsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  skip?: Scalars['Int']['input'];
  limit?: Scalars['Int']['input'];
}>;

export type AdminBuildingMapsQuery = {
  __typename?: 'Query';
  buildingMaps: {
    __typename?: 'BuildingMapConnection';
    items: Array<{
      __typename?: 'BuildingMapType';
      uuid: string;
      name: string;
      geometry?: Geometry | null;
      floorsAboveGround: number;
      floorsBelowGround: number;
      createdAt?: string | null;
      updatedAt?: string | null;
      floors: Array<{ __typename?: 'BuildingFloorType'; label: string }>;
      secondaryLocation?: {
        __typename?: 'SecondaryLocationType';
        fullAddress?: string | null;
        normalizationStatus?: string | null;
      } | null;
    }>;
    pageInfo: {
      __typename?: 'PageInfo';
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
};

export type AdminBuildingMapQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminBuildingMapQuery = {
  __typename?: 'Query';
  buildingMap?: {
    __typename?: 'BuildingMapType';
    uuid: string;
    name: string;
    geometry?: Geometry | null;
    floorsAboveGround: number;
    floorsBelowGround: number;
    createdAt?: string | null;
    updatedAt?: string | null;
    floors: Array<{ __typename?: 'BuildingFloorType'; label: string }>;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      fullAddress?: string | null;
      normalizationStatus?: string | null;
    } | null;
  } | null;
};

export type AdminBuildingMapTicketsQueryVariables = Exact<{
  buildingMapUuid: Scalars['UUID']['input'];
  limit?: Scalars['Int']['input'];
}>;

export type AdminBuildingMapTicketsQuery = {
  __typename?: 'Query';
  buildingMapTickets: Array<{
    __typename?: 'TicketType';
    uuid: string;
    propertyName: string;
    title: string;
    status: string;
    priority: string;
    disasterTypes: Array<string>;
    updatedAt?: string | null;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      county?: string | null;
      town?: string | null;
      floor?: string | null;
      room?: string | null;
    } | null;
    responsibleTeams: Array<{ __typename?: 'AssignedTeamType'; uuid: string }>;
    tasks: Array<{
      __typename?: 'TicketTaskType';
      uuid: string;
      taskType: string;
      status: string;
      quantity?: number | null;
      assignedCount: number;
    }>;
  }>;
};

export type AdminNormalizeAddressQueryVariables = Exact<{
  address: Scalars['String']['input'];
  lat?: InputMaybe<Scalars['Float']['input']>;
  lng?: InputMaybe<Scalars['Float']['input']>;
}>;

export type AdminNormalizeAddressQuery = {
  __typename?: 'Query';
  normalizeAddress: {
    __typename?: 'AddressLookupType';
    status: string;
    fullAddress?: string | null;
    addressToken?: string | null;
    lat?: number | null;
    lng?: number | null;
    buildingSection?: string | null;
    floor?: string | null;
    room?: string | null;
  };
};

export type AdminCreateBuildingMapMutationVariables = Exact<{
  input: CreateBuildingMapInput;
}>;

export type AdminCreateBuildingMapMutation = {
  __typename?: 'Mutation';
  createBuildingMap: {
    __typename?: 'BuildingMapType';
    uuid: string;
    name: string;
    geometry?: Geometry | null;
    floorsAboveGround: number;
    floorsBelowGround: number;
    createdAt?: string | null;
    updatedAt?: string | null;
    floors: Array<{ __typename?: 'BuildingFloorType'; label: string }>;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      fullAddress?: string | null;
      normalizationStatus?: string | null;
    } | null;
  };
};

export type AdminUpdateBuildingMapMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateBuildingMapInput;
}>;

export type AdminUpdateBuildingMapMutation = {
  __typename?: 'Mutation';
  updateBuildingMap: {
    __typename?: 'BuildingMapType';
    uuid: string;
    name: string;
    geometry?: Geometry | null;
    floorsAboveGround: number;
    floorsBelowGround: number;
    createdAt?: string | null;
    updatedAt?: string | null;
    floors: Array<{ __typename?: 'BuildingFloorType'; label: string }>;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      fullAddress?: string | null;
      normalizationStatus?: string | null;
    } | null;
  };
};

export type AdminDeleteBuildingMapMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteBuildingMapMutation = {
  __typename?: 'Mutation';
  deleteBuildingMap: boolean;
};

export type SiteAnnouncementsQueryVariables = Exact<{ [key: string]: never }>;

export type SiteAnnouncementsQuery = {
  __typename?: 'Query';
  announcements: Array<{
    __typename?: 'AnnouncementType';
    uuid: string;
    content: string;
    publishedAt?: string | null;
  }>;
};

export type CurrentBriefingQueryVariables = Exact<{ [key: string]: never }>;

export type CurrentBriefingQuery = {
  __typename?: 'Query';
  briefings: Array<{
    __typename?: 'BriefingType';
    uuid: string;
    content: string;
    publishedAt?: string | null;
  }>;
};

export type GetBuildingMapWithTicketsQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  limit?: Scalars['Int']['input'];
}>;

export type GetBuildingMapWithTicketsQuery = {
  __typename?: 'Query';
  buildingMap?: {
    __typename?: 'BuildingMapType';
    uuid: string;
    name: string;
    floors: Array<{
      __typename?: 'BuildingFloorType';
      label: string;
      areas: Array<string>;
    }>;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      fullAddress?: string | null;
      landmarkNote?: string | null;
    } | null;
  } | null;
  buildingMapTickets: Array<{
    __typename?: 'TicketType';
    uuid: string;
    propertyName: string;
    geometry?: Geometry | null;
    locationCell?: string | null;
    buildingMapUuid?: string | null;
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
    createdAt?: string | null;
    updatedAt?: string | null;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      floor?: string | null;
      room?: string | null;
    } | null;
    tasks: Array<{
      __typename?: 'TicketTaskType';
      uuid: string;
      taskName: string;
      taskType: string;
      quantity?: number | null;
      status: string;
      assignedCount: number;
      myAssignment?: { __typename?: 'TaskAssignmentType'; uuid: string } | null;
    }>;
  }>;
};

export type GetBuildingMapsQueryVariables = Exact<{
  limit?: Scalars['Int']['input'];
}>;

export type GetBuildingMapsQuery = {
  __typename?: 'Query';
  buildingMaps: {
    __typename?: 'BuildingMapConnection';
    items: Array<{
      __typename?: 'BuildingMapType';
      uuid: string;
      name: string;
      geometry?: Geometry | null;
      ticketCount?: number | null;
      shortfall?: number | null;
      floors: Array<{ __typename?: 'BuildingFloorType'; label: string }>;
      secondaryLocation?: {
        __typename?: 'SecondaryLocationType';
        fullAddress?: string | null;
        landmarkNote?: string | null;
      } | null;
    }>;
    pageInfo: { __typename?: 'PageInfo'; totalCount: number };
  };
};

export type PageInfoFieldsFragment = {
  __typename?: 'PageInfo';
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

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
  supplyStatusUpdatedAt?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

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
  createdAt?: string | null;
  updatedAt?: string | null;
};

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
    items: Array<{
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
      supplyStatusUpdatedAt?: string | null;
      createdBy?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
    }>;
    pageInfo: {
      __typename?: 'PageInfo';
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
};

export type GetStationQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type GetStationQuery = {
  __typename?: 'Query';
  station?: {
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
    supplyStatusUpdatedAt?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
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
      createdAt?: string | null;
    }>;
  } | null;
};

export type GetMapAreasQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  includePrivate?: InputMaybe<Scalars['Boolean']['input']>;
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
      isPublic: boolean;
      assignedTeams: Array<{
        __typename?: 'AssignedTeamType';
        uuid: string;
        name: string;
      }>;
    }>;
    pageInfo: {
      __typename?: 'PageInfo';
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
};

export type GetClosureAreaQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type GetClosureAreaQuery = {
  __typename?: 'Query';
  hazardousZone?: {
    __typename?: 'HazardousZoneType';
    uuid: string;
    propertyName: string;
    name?: string | null;
    geometry?: Geometry | null;
    status: string;
    informationSource?: string | null;
    note?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
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
  updateStation: {
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
    supplyStatusUpdatedAt?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
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
    createdAt?: string | null;
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
    createdAt?: string | null;
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

export type MyStationSuggestionsQueryVariables = Exact<{
  [key: string]: never;
}>;

export type MyStationSuggestionsQuery = {
  __typename?: 'Query';
  myStationSuggestions: Array<{
    __typename?: 'MyStationSuggestionType';
    uuid: string;
    targetType: string;
    fieldName: string;
    previousValue?: string | null;
    newValue: string;
    comment?: string | null;
    status: string;
    appliedValue?: string | null;
    submittedAt: string;
    decidedAt?: string | null;
    station?: {
      __typename?: 'StationType';
      uuid: string;
      name?: string | null;
    } | null;
  }>;
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
      createdAt: string;
      closedAt?: string | null;
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
  buildingMapUuid?: string | null;
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
  createdAt?: string | null;
  updatedAt?: string | null;
};

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
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type TicketNeedFieldsFragment = {
  __typename?: 'TicketTaskType';
  uuid: string;
  taskName: string;
  taskType: string;
  quantity?: number | null;
  status: string;
  assignedCount: number;
  myAssignment?: { __typename?: 'TaskAssignmentType'; uuid: string } | null;
};

export type GetTicketsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  status?: InputMaybe<Scalars['String']['input']>;
  statuses?: InputMaybe<Array<TicketStatus> | TicketStatus>;
  priority?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  zoom?: InputMaybe<Scalars['Float']['input']>;
}>;

export type GetTicketsQuery = {
  __typename?: 'Query';
  tickets: {
    __typename?: 'TicketConnection';
    items: Array<{
      __typename?: 'TicketType';
      uuid: string;
      propertyName: string;
      geometry?: Geometry | null;
      locationCell?: string | null;
      buildingMapUuid?: string | null;
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
      createdAt?: string | null;
      updatedAt?: string | null;
      suspectedDuplicateOf: Array<{
        __typename?: 'TicketDuplicateRefType';
        uuid: string;
        title: string;
      }>;
    }>;
    pageInfo: {
      __typename?: 'PageInfo';
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
};

export type GetTicketCellsQueryVariables = Exact<{
  bounds: BoundsInput;
  zoom?: InputMaybe<Scalars['Float']['input']>;
  statuses?: InputMaybe<Array<TicketStatus> | TicketStatus>;
}>;

export type GetTicketCellsQuery = {
  __typename?: 'Query';
  ticketCells: Array<{
    __typename?: 'TicketCellType';
    cell: string;
    ticketCount: number;
    urgentCount: number;
  }>;
};

export type GetCellTicketsQueryVariables = Exact<{
  locationCell: Scalars['String']['input'];
  statuses?: InputMaybe<Array<TicketStatus> | TicketStatus>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetCellTicketsQuery = {
  __typename?: 'Query';
  tickets: {
    __typename?: 'TicketConnection';
    items: Array<{
      __typename?: 'TicketType';
      uuid: string;
      propertyName: string;
      geometry?: Geometry | null;
      locationCell?: string | null;
      buildingMapUuid?: string | null;
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
      createdAt?: string | null;
      updatedAt?: string | null;
    }>;
    pageInfo: { __typename?: 'PageInfo'; hasNextPage: boolean };
  };
};

export type GetAdminMapTicketsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  zoom?: InputMaybe<Scalars['Float']['input']>;
}>;

export type GetAdminMapTicketsQuery = {
  __typename?: 'Query';
  tickets: {
    __typename?: 'TicketConnection';
    items: Array<{
      __typename?: 'TicketType';
      uuid: string;
      propertyName: string;
      geometry?: Geometry | null;
      locationCell?: string | null;
      buildingMapUuid?: string | null;
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
      createdAt?: string | null;
      updatedAt?: string | null;
      responsibleTeams: Array<{
        __typename?: 'AssignedTeamType';
        name: string;
      }>;
    }>;
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
  order?: InputMaybe<TicketListOrder>;
}>;

export type GetTicketsWithNeedsQuery = {
  __typename?: 'Query';
  tickets: {
    __typename?: 'TicketConnection';
    items: Array<{
      __typename?: 'TicketType';
      uuid: string;
      propertyName: string;
      geometry?: Geometry | null;
      locationCell?: string | null;
      buildingMapUuid?: string | null;
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
      createdAt?: string | null;
      updatedAt?: string | null;
      suspectedDuplicateOf: Array<{
        __typename?: 'TicketDuplicateRefType';
        uuid: string;
        title: string;
      }>;
      tasks: Array<{
        __typename?: 'TicketTaskType';
        uuid: string;
        taskName: string;
        taskType: string;
        quantity?: number | null;
        status: string;
        assignedCount: number;
        myAssignment?: {
          __typename?: 'TaskAssignmentType';
          uuid: string;
        } | null;
      }>;
    }>;
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
  ticket?: {
    __typename?: 'TicketType';
    buildingMapUuid?: string | null;
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
    createdAt?: string | null;
    updatedAt?: string | null;
    suspectedDuplicateOf: Array<{
      __typename?: 'TicketDuplicateRefType';
      uuid: string;
      title: string;
    }>;
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
    responsibleTeams: Array<{
      __typename?: 'AssignedTeamType';
      uuid: string;
      name: string;
    }>;
    photos: Array<{
      __typename?: 'PhotoType';
      uuid: string;
      url: string;
      createdAt?: string | null;
    }>;
    tasks: Array<{
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
      createdAt?: string | null;
      updatedAt?: string | null;
      assignedCount: number;
      myAssignment?: { __typename?: 'TaskAssignmentType'; uuid: string } | null;
    }>;
  } | null;
};

export type GetLinkedTicketQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type GetLinkedTicketQuery = {
  __typename?: 'Query';
  ticket?: {
    __typename?: 'TicketType';
    uuid: string;
    propertyName: string;
    geometry?: Geometry | null;
    locationCell?: string | null;
    buildingMapUuid?: string | null;
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
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
  ticketAvailability: {
    __typename?: 'TicketAvailabilityType';
    status: TicketAvailability;
    replacedByUuid?: string | null;
  };
};

export type GetTicketTasksQueryVariables = Exact<{
  ticketUuid: Scalars['String']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetTicketTasksQuery = {
  __typename?: 'Query';
  ticketTasks: Array<{
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
    createdAt?: string | null;
    updatedAt?: string | null;
    properties: Array<{
      __typename?: 'TaskPropertyType';
      uuid: string;
      taskUuid: string;
      propertyName: string;
      propertyValue: string;
      quantity?: number | null;
      status?: string | null;
      comment?: string | null;
      createdAt?: string | null;
    }>;
  }>;
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
        ticket: {
          __typename?: 'TicketType';
          uuid: string;
          propertyName: string;
          geometry?: Geometry | null;
          locationCell?: string | null;
          buildingMapUuid?: string | null;
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
          createdAt?: string | null;
          updatedAt?: string | null;
        };
        tasks: Array<{
          __typename?: 'TicketTaskType';
          uuid: string;
          taskName: string;
          taskType: string;
          quantity?: number | null;
          status: string;
          assignedCount: number;
          myAssignment?: {
            __typename?: 'TaskAssignmentType';
            uuid: string;
          } | null;
        }>;
      };
};

export type UpdateTicketMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateTicketInput;
}>;

export type UpdateTicketMutation = {
  __typename?: 'Mutation';
  updateTicket: {
    __typename?: 'TicketType';
    uuid: string;
    propertyName: string;
    geometry?: Geometry | null;
    locationCell?: string | null;
    buildingMapUuid?: string | null;
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
    createdAt?: string | null;
    updatedAt?: string | null;
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
        task: {
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
          createdAt?: string | null;
          updatedAt?: string | null;
        };
      };
};

export type UpdateTicketTaskMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateTicketTaskInput;
}>;

export type UpdateTicketTaskMutation = {
  __typename?: 'Mutation';
  updateTicketTask: {
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
    createdAt?: string | null;
    updatedAt?: string | null;
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
      assignedAt?: string | null;
    };
    task: {
      __typename?: 'TicketTaskType';
      uuid: string;
      taskName: string;
      recruitingStoppedAt?: string | null;
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
    createdAt?: string | null;
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
    createdAt?: string | null;
  };
};

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<
    DocumentTypeDecoration<TResult, TVariables>['__apiType']
  >;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const AdminPageInfoFragmentDoc = new TypedDocumentString(
  `
    fragment AdminPageInfo on PageInfo {
  totalCount
  hasNextPage
  hasPreviousPage
}
    `,
  { fragmentName: 'AdminPageInfo' },
) as unknown as TypedDocumentString<AdminPageInfoFragment, unknown>;
export const AdminTicketFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment AdminTicketFields on TicketType {
  uuid
  title
  description
  geometry
  status
  priority
  taskType
  contactName
  contactEmail
  contactPhone
  createdBy
  createdAt
  updatedAt
  disasterTypes
  locationCell
  buildingMapUuid
  secondaryLocation {
    county
    town
    floor
  }
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
}
    `,
  { fragmentName: 'AdminTicketFields' },
) as unknown as TypedDocumentString<AdminTicketFieldsFragment, unknown>;
export const AdminTaskFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment AdminTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  progressNote
  source
  createdAt
  updatedAt
  assignedCount
  recruitingStoppedAt
  assignments {
    uuid
    actorUuid
    actorName
    role
    status
    assignedAt
    updatedAt
  }
}
    `,
  { fragmentName: 'AdminTaskFields' },
) as unknown as TypedDocumentString<AdminTaskFieldsFragment, unknown>;
export const AdminStationFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment AdminStationFields on StationType {
  uuid
  type
  name
  description
  geometry
  opHour
  level
  comment
  source
  visibility
  verificationStatus
  operationalStatus
  statusChangedAt
  supplyStatus
  pendingSuggestedFields
  isDuplicate
  isTemporary
  isOfficial
  createdBy
  createdAt
  updatedAt
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
  viewerCanViewPii
  viewerCanExport
  secondaryLocation {
    county
    town
  }
  assignedTeam {
    uuid
    name
    type
  }
}
    `,
  { fragmentName: 'AdminStationFields' },
) as unknown as TypedDocumentString<AdminStationFieldsFragment, unknown>;
export const AdminBriefingFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment AdminBriefingFields on BriefingType {
  uuid
  templateUuid
  content
  tags
  state
  status
  publishedAt
  createdAt
  updatedAt
  creator {
    uuid
    name
  }
  updater {
    uuid
    name
  }
  publisher {
    uuid
    name
  }
}
    `,
  { fragmentName: 'AdminBriefingFields' },
) as unknown as TypedDocumentString<AdminBriefingFieldsFragment, unknown>;
export const AdminBuildingMapFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment AdminBuildingMapFields on BuildingMapType {
  uuid
  name
  geometry
  floorsAboveGround
  floorsBelowGround
  createdAt
  updatedAt
  floors {
    label
  }
  secondaryLocation {
    fullAddress
    normalizationStatus
  }
}
    `,
  { fragmentName: 'AdminBuildingMapFields' },
) as unknown as TypedDocumentString<AdminBuildingMapFieldsFragment, unknown>;
export const AdminSpaceTicketFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment AdminSpaceTicketFields on TicketType {
  uuid
  propertyName
  title
  status
  priority
  disasterTypes
  updatedAt
  secondaryLocation {
    county
    town
    floor
    room
  }
  responsibleTeams {
    uuid
  }
  tasks {
    uuid
    taskType
    status
    quantity
    assignedCount
  }
}
    `,
  { fragmentName: 'AdminSpaceTicketFields' },
) as unknown as TypedDocumentString<AdminSpaceTicketFieldsFragment, unknown>;
export const PageInfoFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment PageInfoFields on PageInfo {
  totalCount
  hasNextPage
  hasPreviousPage
}
    `,
  { fragmentName: 'PageInfoFields' },
) as unknown as TypedDocumentString<PageInfoFieldsFragment, unknown>;
export const StationFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment StationFields on StationType {
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
  isDuplicate
  isTemporary
  isOfficial
  operationalStatus
  supplyStatus
  supplyStatusUpdatedAt
  createdBy
  createdAt
  updatedAt
}
    `,
  { fragmentName: 'StationFields' },
) as unknown as TypedDocumentString<StationFieldsFragment, unknown>;
export const ClosureAreaFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment ClosureAreaFields on HazardousZoneType {
  uuid
  propertyName
  name
  geometry
  status
  informationSource
  note
  createdBy
  createdAt
  updatedAt
}
    `,
  { fragmentName: 'ClosureAreaFields' },
) as unknown as TypedDocumentString<ClosureAreaFieldsFragment, unknown>;
export const TicketFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment TicketFields on TicketType {
  uuid
  propertyName
  geometry
  locationCell
  buildingMapUuid
  title
  description
  contactName
  contactEmail
  contactPhone
  status
  priority
  taskType
  auditStatus
  createdBy
  createdAt
  updatedAt
}
    `,
  { fragmentName: 'TicketFields' },
) as unknown as TypedDocumentString<TicketFieldsFragment, unknown>;
export const TicketTaskFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment TicketTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  source
  progressNote
  createdAt
  updatedAt
}
    `,
  { fragmentName: 'TicketTaskFields' },
) as unknown as TypedDocumentString<TicketTaskFieldsFragment, unknown>;
export const TicketNeedFieldsFragmentDoc = new TypedDocumentString(
  `
    fragment TicketNeedFields on TicketTaskType {
  uuid
  taskName
  taskType
  quantity
  status
  assignedCount
  myAssignment {
    uuid
  }
}
    `,
  { fragmentName: 'TicketNeedFields' },
) as unknown as TypedDocumentString<TicketNeedFieldsFragment, unknown>;
export const AdminTicketsDocument = new TypedDocumentString(`
    query AdminTickets($bounds: BoundsInput, $status: String, $priority: String, $q: String, $needType: String, $responsibleTeamUuid: UUID, $unassignedOnly: Boolean = false, $county: String, $town: String, $updatedAfter: DateTime, $updatedBefore: DateTime, $zoom: Float, $skip: Int = 0, $limit: Int = 50) {
  tickets(
    bounds: $bounds
    status: $status
    priority: $priority
    q: $q
    needType: $needType
    responsibleTeamUuid: $responsibleTeamUuid
    unassignedOnly: $unassignedOnly
    county: $county
    town: $town
    updatedAfter: $updatedAfter
    updatedBefore: $updatedBefore
    zoom: $zoom
    skip: $skip
    limit: $limit
  ) {
    items {
      ...AdminTicketFields
      secondaryLocation {
        fullAddress
        landmarkNote
      }
      photos {
        uuid
      }
      responsibleTeams {
        uuid
        name
      }
      verificationStatus {
        state
        duplicateOf {
          uuid
          title
        }
      }
      tasks {
        ...AdminTaskFields
      }
    }
    pageInfo {
      ...AdminPageInfo
    }
  }
}
    fragment AdminPageInfo on PageInfo {
  totalCount
  hasNextPage
  hasPreviousPage
}
fragment AdminTicketFields on TicketType {
  uuid
  title
  description
  geometry
  status
  priority
  taskType
  contactName
  contactEmail
  contactPhone
  createdBy
  createdAt
  updatedAt
  disasterTypes
  locationCell
  buildingMapUuid
  secondaryLocation {
    county
    town
    floor
  }
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
}
fragment AdminTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  progressNote
  source
  createdAt
  updatedAt
  assignedCount
  recruitingStoppedAt
  assignments {
    uuid
    actorUuid
    actorName
    role
    status
    assignedAt
    updatedAt
  }
}`) as unknown as TypedDocumentString<
  AdminTicketsQuery,
  AdminTicketsQueryVariables
>;
export const AdminTicketMapPinsDocument = new TypedDocumentString(`
    query AdminTicketMapPins($bounds: BoundsInput, $status: String, $priority: String, $q: String, $needType: String, $responsibleTeamUuid: UUID, $unassignedOnly: Boolean = false, $county: String, $town: String, $updatedAfter: DateTime, $updatedBefore: DateTime, $zoom: Float, $skip: Int = 0, $limit: Int = 50) {
  tickets(
    bounds: $bounds
    status: $status
    priority: $priority
    q: $q
    needType: $needType
    responsibleTeamUuid: $responsibleTeamUuid
    unassignedOnly: $unassignedOnly
    county: $county
    town: $town
    updatedAfter: $updatedAfter
    updatedBefore: $updatedBefore
    zoom: $zoom
    skip: $skip
    limit: $limit
  ) {
    items {
      uuid
      title
      geometry
      status
      priority
      locationCell
      buildingMapUuid
      secondaryLocation {
        county
        town
        fullAddress
        landmarkNote
      }
    }
    pageInfo {
      totalCount
    }
  }
}
    `) as unknown as TypedDocumentString<
  AdminTicketMapPinsQuery,
  AdminTicketMapPinsQueryVariables
>;
export const AdminTicketsExtentDocument = new TypedDocumentString(`
    query AdminTicketsExtent($status: String, $priority: String, $q: String, $needType: String, $responsibleTeamUuid: UUID, $unassignedOnly: Boolean = false, $county: String, $town: String, $updatedAfter: DateTime, $updatedBefore: DateTime) {
  ticketsExtent(
    status: $status
    priority: $priority
    q: $q
    needType: $needType
    responsibleTeamUuid: $responsibleTeamUuid
    unassignedOnly: $unassignedOnly
    county: $county
    town: $town
    updatedAfter: $updatedAfter
    updatedBefore: $updatedBefore
  ) {
    count
    minLat
    maxLat
    minLng
    maxLng
  }
}
    `) as unknown as TypedDocumentString<
  AdminTicketsExtentQuery,
  AdminTicketsExtentQueryVariables
>;
export const AdminTicketFacetsDocument = new TypedDocumentString(`
    query AdminTicketFacets {
  ticketFacets {
    areas {
      county
      town
    }
    teams {
      uuid
      name
    }
  }
}
    `) as unknown as TypedDocumentString<
  AdminTicketFacetsQuery,
  AdminTicketFacetsQueryVariables
>;
export const AdminTicketStatsDocument = new TypedDocumentString(`
    query AdminTicketStats {
  ticketStats {
    total
    pending
    inProgress
    completed
    cancelled
    gapPeople
    gapNeeds
  }
}
    `) as unknown as TypedDocumentString<
  AdminTicketStatsQuery,
  AdminTicketStatsQueryVariables
>;
export const AdminTicketDocument = new TypedDocumentString(`
    query AdminTicket($uuid: UUID!) {
  ticket(uuid: $uuid) {
    ...AdminTicketFields
    responsibleTeams {
      uuid
      name
    }
    verificationStatus {
      state
      duplicateOf {
        uuid
        title
      }
    }
    secondaryLocation {
      fullAddress
      county
      town
      village
      neighborhood
      road
      section
      lane
      alley
      no
      normalizationStatus
      floor
      room
      landmarkNote
      locationType
      buildingSection
      spaceDescription
      victimSpace
      accessStatus
      poleId
      poleType
      poleNote
    }
    photos {
      uuid
      url
      createdAt
    }
    tasks {
      ...AdminTaskFields
      viewerCanAssign
      assignments {
        uuid
        viewerCanUnassign
      }
      properties {
        uuid
        propertyName
        propertyValue
        quantity
        status
        comment
      }
    }
    disasterDetails {
      uuid
      propertyName
      value
    }
  }
}
    fragment AdminTicketFields on TicketType {
  uuid
  title
  description
  geometry
  status
  priority
  taskType
  contactName
  contactEmail
  contactPhone
  createdBy
  createdAt
  updatedAt
  disasterTypes
  locationCell
  buildingMapUuid
  secondaryLocation {
    county
    town
    floor
  }
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
}
fragment AdminTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  progressNote
  source
  createdAt
  updatedAt
  assignedCount
  recruitingStoppedAt
  assignments {
    uuid
    actorUuid
    actorName
    role
    status
    assignedAt
    updatedAt
  }
}`) as unknown as TypedDocumentString<
  AdminTicketQuery,
  AdminTicketQueryVariables
>;
export const AdminTicketTasksDocument = new TypedDocumentString(`
    query AdminTicketTasks($ticketUuid: String!, $status: String, $q: String, $skip: Int = 0, $limit: Int = 50) {
  ticketTasks(
    ticketUuid: $ticketUuid
    status: $status
    q: $q
    skip: $skip
    limit: $limit
  ) {
    ...AdminTaskFields
  }
}
    fragment AdminTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  progressNote
  source
  createdAt
  updatedAt
  assignedCount
  recruitingStoppedAt
  assignments {
    uuid
    actorUuid
    actorName
    role
    status
    assignedAt
    updatedAt
  }
}`) as unknown as TypedDocumentString<
  AdminTicketTasksQuery,
  AdminTicketTasksQueryVariables
>;
export const AdminStationFacetsDocument = new TypedDocumentString(`
    query AdminStationFacets {
  stationFacets {
    total
    byStatus {
      status
      count
    }
  }
}
    `) as unknown as TypedDocumentString<
  AdminStationFacetsQuery,
  AdminStationFacetsQueryVariables
>;
export const AdminStationsDocument = new TypedDocumentString(`
    query AdminStations($bounds: BoundsInput, $stationType: String, $operationalStatus: StationOperationalStatus, $q: String, $assignedTeamUuid: UUID, $unassignedOnly: Boolean = false, $hasPendingSuggestions: Boolean = false, $reviewableOnly: Boolean = false, $skip: Int = 0, $limit: Int = 50) {
  stations(
    bounds: $bounds
    stationType: $stationType
    operationalStatus: $operationalStatus
    q: $q
    assignedTeamUuid: $assignedTeamUuid
    unassignedOnly: $unassignedOnly
    hasPendingSuggestions: $hasPendingSuggestions
    reviewableOnly: $reviewableOnly
    skip: $skip
    limit: $limit
  ) {
    items {
      ...AdminStationFields
    }
    pageInfo {
      ...AdminPageInfo
    }
  }
}
    fragment AdminPageInfo on PageInfo {
  totalCount
  hasNextPage
  hasPreviousPage
}
fragment AdminStationFields on StationType {
  uuid
  type
  name
  description
  geometry
  opHour
  level
  comment
  source
  visibility
  verificationStatus
  operationalStatus
  statusChangedAt
  supplyStatus
  pendingSuggestedFields
  isDuplicate
  isTemporary
  isOfficial
  createdBy
  createdAt
  updatedAt
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
  viewerCanViewPii
  viewerCanExport
  secondaryLocation {
    county
    town
  }
  assignedTeam {
    uuid
    name
    type
  }
}`) as unknown as TypedDocumentString<
  AdminStationsQuery,
  AdminStationsQueryVariables
>;
export const AdminAssignableStationTeamsDocument = new TypedDocumentString(`
    query AdminAssignableStationTeams {
  assignableStationTeams {
    uuid
    name
    type
  }
}
    `) as unknown as TypedDocumentString<
  AdminAssignableStationTeamsQuery,
  AdminAssignableStationTeamsQueryVariables
>;
export const AdminStationDocument = new TypedDocumentString(`
    query AdminStation($uuid: UUID!) {
  station(uuid: $uuid) {
    ...AdminStationFields
    contactName
    contactPhone
    contactEmail
    secondaryLocation {
      fullAddress
      county
      town
      village
      neighborhood
      road
      section
      lane
      alley
      no
      normalizationStatus
      floor
      room
      poleId
      poleType
      poleNote
    }
    photos {
      uuid
      url
      createdAt
    }
    properties {
      uuid
      propertyType
      propertyName
      quantity
      comment
      status
      weightings
      createdAt
    }
  }
}
    fragment AdminStationFields on StationType {
  uuid
  type
  name
  description
  geometry
  opHour
  level
  comment
  source
  visibility
  verificationStatus
  operationalStatus
  statusChangedAt
  supplyStatus
  pendingSuggestedFields
  isDuplicate
  isTemporary
  isOfficial
  createdBy
  createdAt
  updatedAt
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
  viewerCanViewPii
  viewerCanExport
  secondaryLocation {
    county
    town
  }
  assignedTeam {
    uuid
    name
    type
  }
}`) as unknown as TypedDocumentString<
  AdminStationQuery,
  AdminStationQueryVariables
>;
export const AdminReverseGeocodeDocument = new TypedDocumentString(`
    query AdminReverseGeocode($lat: Float!, $lng: Float!) {
  reverseGeocode(lat: $lat, lng: $lng) {
    status
    fullAddress
    floor
    room
    addressToken
    lat
    lng
    buildingSection
  }
}
    `) as unknown as TypedDocumentString<
  AdminReverseGeocodeQuery,
  AdminReverseGeocodeQueryVariables
>;
export const AdminStationReviewDocument = new TypedDocumentString(`
    query AdminStationReview($uuid: UUID!) {
  station(uuid: $uuid) {
    ...AdminStationFields
    properties {
      uuid
      propertyName
      quantity
      comment
      pendingSuggestedFields
    }
    suggestedFields {
      targetType
      targetUuid
      fieldName
      proposedValues
      suggestionCount
      comments
      firstSuggestedAt
    }
  }
  suggestableFields(targetType: "station") {
    fieldName
    dataType
    enumOptions
  }
}
    fragment AdminStationFields on StationType {
  uuid
  type
  name
  description
  geometry
  opHour
  level
  comment
  source
  visibility
  verificationStatus
  operationalStatus
  statusChangedAt
  supplyStatus
  pendingSuggestedFields
  isDuplicate
  isTemporary
  isOfficial
  createdBy
  createdAt
  updatedAt
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
  viewerCanViewPii
  viewerCanExport
  secondaryLocation {
    county
    town
  }
  assignedTeam {
    uuid
    name
    type
  }
}`) as unknown as TypedDocumentString<
  AdminStationReviewQuery,
  AdminStationReviewQueryVariables
>;
export const AdminAnnouncementsDocument = new TypedDocumentString(`
    query AdminAnnouncements($filter: AnnouncementFilter = ALL, $placement: AnnouncementPlacement = admin_page) {
  announcements(filter: $filter, placement: $placement) {
    uuid
    content
    active
    placement
    publishedAt
    publisher {
      uuid
      name
    }
    createdAt
    updatedAt
  }
}
    `) as unknown as TypedDocumentString<
  AdminAnnouncementsQuery,
  AdminAnnouncementsQueryVariables
>;
export const AdminBriefingsDocument = new TypedDocumentString(`
    query AdminBriefings($state: BriefingState, $tag: String, $status: BriefingStatusFilter! = PUBLISHED) {
  briefings(state: $state, tag: $tag, status: $status) {
    ...AdminBriefingFields
  }
}
    fragment AdminBriefingFields on BriefingType {
  uuid
  templateUuid
  content
  tags
  state
  status
  publishedAt
  createdAt
  updatedAt
  creator {
    uuid
    name
  }
  updater {
    uuid
    name
  }
  publisher {
    uuid
    name
  }
}`) as unknown as TypedDocumentString<
  AdminBriefingsQuery,
  AdminBriefingsQueryVariables
>;
export const AdminBriefingTemplatesDocument = new TypedDocumentString(`
    query AdminBriefingTemplates($state: BriefingState, $tag: String) {
  briefingTemplates(state: $state, tag: $tag) {
    uuid
    content
    tags
    state
    createdAt
    updatedAt
  }
}
    `) as unknown as TypedDocumentString<
  AdminBriefingTemplatesQuery,
  AdminBriefingTemplatesQueryVariables
>;
export const AdminStationPropertyConfigsDocument = new TypedDocumentString(`
    query AdminStationPropertyConfigs($stationType: String!, $includeInactive: Boolean = true) {
  stationPropertyConfigs(
    stationType: $stationType
    includeInactive: $includeInactive
  ) {
    uuid
    stationType
    propertyName
    dataType
    enumOptions
    unit
    label
    displayLabel
    sortOrder
    isActive
  }
}
    `) as unknown as TypedDocumentString<
  AdminStationPropertyConfigsQuery,
  AdminStationPropertyConfigsQueryVariables
>;
export const AdminTaskPropertyConfigsDocument = new TypedDocumentString(`
    query AdminTaskPropertyConfigs($taskType: String!, $includeInactive: Boolean = true) {
  taskPropertyConfigs(taskType: $taskType, includeInactive: $includeInactive) {
    uuid
    taskType
    propertyName
    dataType
    enumOptions
    unit
    disasterTypes
    label
    displayLabel
    sortOrder
    isActive
  }
}
    `) as unknown as TypedDocumentString<
  AdminTaskPropertyConfigsQuery,
  AdminTaskPropertyConfigsQueryVariables
>;
export const AdminTicketPropertyConfigsDocument = new TypedDocumentString(`
    query AdminTicketPropertyConfigs($disasterTypes: [String!]!, $includeInactive: Boolean = true) {
  ticketPropertyConfigs(
    disasterTypes: $disasterTypes
    includeInactive: $includeInactive
  ) {
    uuid
    propertyName
    dataType
    enumOptions
    unit
    disasterTypes
    label
    displayLabel
    hint
    isActive
  }
}
    `) as unknown as TypedDocumentString<
  AdminTicketPropertyConfigsQuery,
  AdminTicketPropertyConfigsQueryVariables
>;
export const AdminTeamDirectoryDocument = new TypedDocumentString(`
    query AdminTeamDirectory {
  roleRequestTeams {
    uuid
    name
    type
    admins {
      name
      phone
      email
    }
  }
}
    `) as unknown as TypedDocumentString<
  AdminTeamDirectoryQuery,
  AdminTeamDirectoryQueryVariables
>;
export const AdminDisasterTypesDocument = new TypedDocumentString(`
    query AdminDisasterTypes($includeInactive: Boolean = true) {
  disasterTypes(includeInactive: $includeInactive) {
    uuid
    key
    label
    isActive
  }
}
    `) as unknown as TypedDocumentString<
  AdminDisasterTypesQuery,
  AdminDisasterTypesQueryVariables
>;
export const AdminCurrentDisasterDocument = new TypedDocumentString(`
    query AdminCurrentDisaster {
  currentDisaster {
    name
    shortName
    mapView {
      lat
      lng
      zoom
    }
  }
}
    `) as unknown as TypedDocumentString<
  AdminCurrentDisasterQuery,
  AdminCurrentDisasterQueryVariables
>;
export const AdminCreateTicketDocument = new TypedDocumentString(`
    mutation AdminCreateTicket($input: CreateTicketInput!) {
  createTicket(input: $input) {
    __typename
    ... on TicketCreated {
      ticket {
        ...AdminTicketFields
      }
    }
    ... on DuplicatesSuspected {
      suspects {
        draftRef
        relatedKind
        relatedUuid
        relatedTicketUuid
      }
    }
  }
}
    fragment AdminTicketFields on TicketType {
  uuid
  title
  description
  geometry
  status
  priority
  taskType
  contactName
  contactEmail
  contactPhone
  createdBy
  createdAt
  updatedAt
  disasterTypes
  locationCell
  buildingMapUuid
  secondaryLocation {
    county
    town
    floor
  }
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
}`) as unknown as TypedDocumentString<
  AdminCreateTicketMutation,
  AdminCreateTicketMutationVariables
>;
export const AdminUpdateTicketDocument = new TypedDocumentString(`
    mutation AdminUpdateTicket($uuid: UUID!, $input: UpdateTicketInput!) {
  updateTicket(uuid: $uuid, input: $input) {
    ...AdminTicketFields
  }
}
    fragment AdminTicketFields on TicketType {
  uuid
  title
  description
  geometry
  status
  priority
  taskType
  contactName
  contactEmail
  contactPhone
  createdBy
  createdAt
  updatedAt
  disasterTypes
  locationCell
  buildingMapUuid
  secondaryLocation {
    county
    town
    floor
  }
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
}`) as unknown as TypedDocumentString<
  AdminUpdateTicketMutation,
  AdminUpdateTicketMutationVariables
>;
export const AdminDeleteTicketDocument = new TypedDocumentString(`
    mutation AdminDeleteTicket($uuid: UUID!) {
  deleteTicket(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminDeleteTicketMutation,
  AdminDeleteTicketMutationVariables
>;
export const AdminSetTicketDisasterDetailsDocument = new TypedDocumentString(`
    mutation AdminSetTicketDisasterDetails($uuid: UUID!, $details: [TicketDisasterDetailInput!]!) {
  setTicketDisasterDetails(uuid: $uuid, details: $details) {
    uuid
    propertyName
    value
  }
}
    `) as unknown as TypedDocumentString<
  AdminSetTicketDisasterDetailsMutation,
  AdminSetTicketDisasterDetailsMutationVariables
>;
export const AdminCreateTicketTaskDocument = new TypedDocumentString(`
    mutation AdminCreateTicketTask($input: CreateTicketTaskInput!, $acknowledgedDuplicateOf: String) {
  createTicketTask(
    input: $input
    acknowledgedDuplicateOf: $acknowledgedDuplicateOf
  ) {
    __typename
    ... on TicketTaskCreated {
      task {
        ...AdminTaskFields
      }
    }
    ... on DuplicatesSuspected {
      suspects {
        draftRef
        relatedKind
        relatedUuid
        relatedTicketUuid
      }
    }
  }
}
    fragment AdminTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  progressNote
  source
  createdAt
  updatedAt
  assignedCount
  recruitingStoppedAt
  assignments {
    uuid
    actorUuid
    actorName
    role
    status
    assignedAt
    updatedAt
  }
}`) as unknown as TypedDocumentString<
  AdminCreateTicketTaskMutation,
  AdminCreateTicketTaskMutationVariables
>;
export const AdminUpdateTicketTaskDocument = new TypedDocumentString(`
    mutation AdminUpdateTicketTask($uuid: UUID!, $input: UpdateTicketTaskInput!) {
  updateTicketTask(uuid: $uuid, input: $input) {
    ...AdminTaskFields
  }
}
    fragment AdminTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  progressNote
  source
  createdAt
  updatedAt
  assignedCount
  recruitingStoppedAt
  assignments {
    uuid
    actorUuid
    actorName
    role
    status
    assignedAt
    updatedAt
  }
}`) as unknown as TypedDocumentString<
  AdminUpdateTicketTaskMutation,
  AdminUpdateTicketTaskMutationVariables
>;
export const AdminAssignTaskActorDocument = new TypedDocumentString(`
    mutation AdminAssignTaskActor($taskUuid: UUID!, $actorUuid: UUID, $role: String) {
  assignTaskActor(taskUuid: $taskUuid, actorUuid: $actorUuid, role: $role) {
    uuid
    taskUuid
    actorUuid
    role
    status
    assignedAt
  }
}
    `) as unknown as TypedDocumentString<
  AdminAssignTaskActorMutation,
  AdminAssignTaskActorMutationVariables
>;
export const AdminUpdateTaskAssignmentDocument = new TypedDocumentString(`
    mutation AdminUpdateTaskAssignment($uuid: UUID!, $input: UpdateTaskAssignmentInput!) {
  updateTaskAssignment(uuid: $uuid, input: $input) {
    uuid
    taskUuid
    actorUuid
    role
    status
    updatedAt
  }
}
    `) as unknown as TypedDocumentString<
  AdminUpdateTaskAssignmentMutation,
  AdminUpdateTaskAssignmentMutationVariables
>;
export const AdminStopRecruitingDocument = new TypedDocumentString(`
    mutation AdminStopRecruiting($taskUuid: UUID!) {
  stopRecruiting(taskUuid: $taskUuid) {
    ...AdminTaskFields
  }
}
    fragment AdminTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  progressNote
  source
  createdAt
  updatedAt
  assignedCount
  recruitingStoppedAt
  assignments {
    uuid
    actorUuid
    actorName
    role
    status
    assignedAt
    updatedAt
  }
}`) as unknown as TypedDocumentString<
  AdminStopRecruitingMutation,
  AdminStopRecruitingMutationVariables
>;
export const AdminDeleteTicketTaskDocument = new TypedDocumentString(`
    mutation AdminDeleteTicketTask($uuid: UUID!) {
  deleteTicketTask(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminDeleteTicketTaskMutation,
  AdminDeleteTicketTaskMutationVariables
>;
export const AdminAttachTicketPhotoDocument = new TypedDocumentString(`
    mutation AdminAttachTicketPhoto($ticketUuid: UUID!, $url: String!) {
  attachTicketPhoto(ticketUuid: $ticketUuid, url: $url) {
    uuid
    url
    createdAt
  }
}
    `) as unknown as TypedDocumentString<
  AdminAttachTicketPhotoMutation,
  AdminAttachTicketPhotoMutationVariables
>;
export const AdminDetachTicketPhotoDocument = new TypedDocumentString(`
    mutation AdminDetachTicketPhoto($uuid: UUID!) {
  detachTicketPhoto(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminDetachTicketPhotoMutation,
  AdminDetachTicketPhotoMutationVariables
>;
export const AdminUnassignTaskActorDocument = new TypedDocumentString(`
    mutation AdminUnassignTaskActor($uuid: UUID!) {
  unassignTaskActor(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminUnassignTaskActorMutation,
  AdminUnassignTaskActorMutationVariables
>;
export const AdminCreateStationDocument = new TypedDocumentString(`
    mutation AdminCreateStation($input: CreateStationInput!, $acknowledgedDuplicateOf: String) {
  createStation(input: $input, acknowledgedDuplicateOf: $acknowledgedDuplicateOf) {
    __typename
    ... on StationCreated {
      station {
        ...AdminStationFields
      }
    }
    ... on DuplicatesSuspected {
      suspects {
        relatedKind
        relatedUuid
      }
    }
  }
}
    fragment AdminStationFields on StationType {
  uuid
  type
  name
  description
  geometry
  opHour
  level
  comment
  source
  visibility
  verificationStatus
  operationalStatus
  statusChangedAt
  supplyStatus
  pendingSuggestedFields
  isDuplicate
  isTemporary
  isOfficial
  createdBy
  createdAt
  updatedAt
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
  viewerCanViewPii
  viewerCanExport
  secondaryLocation {
    county
    town
  }
  assignedTeam {
    uuid
    name
    type
  }
}`) as unknown as TypedDocumentString<
  AdminCreateStationMutation,
  AdminCreateStationMutationVariables
>;
export const AdminUpdateStationDocument = new TypedDocumentString(`
    mutation AdminUpdateStation($uuid: UUID!, $input: UpdateStationInput!) {
  updateStation(uuid: $uuid, input: $input) {
    ...AdminStationFields
  }
}
    fragment AdminStationFields on StationType {
  uuid
  type
  name
  description
  geometry
  opHour
  level
  comment
  source
  visibility
  verificationStatus
  operationalStatus
  statusChangedAt
  supplyStatus
  pendingSuggestedFields
  isDuplicate
  isTemporary
  isOfficial
  createdBy
  createdAt
  updatedAt
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
  viewerCanViewPii
  viewerCanExport
  secondaryLocation {
    county
    town
  }
  assignedTeam {
    uuid
    name
    type
  }
}`) as unknown as TypedDocumentString<
  AdminUpdateStationMutation,
  AdminUpdateStationMutationVariables
>;
export const AdminDeleteStationDocument = new TypedDocumentString(`
    mutation AdminDeleteStation($uuid: UUID!) {
  deleteStation(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminDeleteStationMutation,
  AdminDeleteStationMutationVariables
>;
export const AdminMergeStationSuggestionsDocument = new TypedDocumentString(`
    mutation AdminMergeStationSuggestions($stationUuid: UUID!, $decisions: [SuggestionDecisionInput!]!, $reviewNote: String) {
  mergeStationSuggestions(
    stationUuid: $stationUuid
    decisions: $decisions
    reviewNote: $reviewNote
  ) {
    uuid
    status
    changes {
      targetType
      targetUuid
      fieldName
      before
      after
    }
  }
}
    `) as unknown as TypedDocumentString<
  AdminMergeStationSuggestionsMutation,
  AdminMergeStationSuggestionsMutationVariables
>;
export const AdminAssignStationDocument = new TypedDocumentString(`
    mutation AdminAssignStation($stationUuid: UUID!, $teamUuid: UUID!) {
  assignStationToTeam(stationUuid: $stationUuid, teamUuid: $teamUuid) {
    ...AdminStationFields
  }
}
    fragment AdminStationFields on StationType {
  uuid
  type
  name
  description
  geometry
  opHour
  level
  comment
  source
  visibility
  verificationStatus
  operationalStatus
  statusChangedAt
  supplyStatus
  pendingSuggestedFields
  isDuplicate
  isTemporary
  isOfficial
  createdBy
  createdAt
  updatedAt
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
  viewerCanViewPii
  viewerCanExport
  secondaryLocation {
    county
    town
  }
  assignedTeam {
    uuid
    name
    type
  }
}`) as unknown as TypedDocumentString<
  AdminAssignStationMutation,
  AdminAssignStationMutationVariables
>;
export const AdminUnassignStationDocument = new TypedDocumentString(`
    mutation AdminUnassignStation($stationUuid: UUID!) {
  unassignStation(stationUuid: $stationUuid) {
    ...AdminStationFields
  }
}
    fragment AdminStationFields on StationType {
  uuid
  type
  name
  description
  geometry
  opHour
  level
  comment
  source
  visibility
  verificationStatus
  operationalStatus
  statusChangedAt
  supplyStatus
  pendingSuggestedFields
  isDuplicate
  isTemporary
  isOfficial
  createdBy
  createdAt
  updatedAt
  viewerCanEdit
  viewerCanDelete
  viewerCanViewHistory
  viewerCanViewPii
  viewerCanExport
  secondaryLocation {
    county
    town
  }
  assignedTeam {
    uuid
    name
    type
  }
}`) as unknown as TypedDocumentString<
  AdminUnassignStationMutation,
  AdminUnassignStationMutationVariables
>;
export const AdminAttachStationPhotoDocument = new TypedDocumentString(`
    mutation AdminAttachStationPhoto($stationUuid: UUID!, $url: String!) {
  attachStationPhoto(stationUuid: $stationUuid, url: $url) {
    uuid
    url
    createdAt
  }
}
    `) as unknown as TypedDocumentString<
  AdminAttachStationPhotoMutation,
  AdminAttachStationPhotoMutationVariables
>;
export const AdminDetachStationPhotoDocument = new TypedDocumentString(`
    mutation AdminDetachStationPhoto($uuid: UUID!) {
  detachStationPhoto(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminDetachStationPhotoMutation,
  AdminDetachStationPhotoMutationVariables
>;
export const AdminCreateStationPropertyDocument = new TypedDocumentString(`
    mutation AdminCreateStationProperty($input: CreateStationPropertyInput!) {
  createStationProperty(input: $input) {
    uuid
    stationUuid
    propertyType
    propertyName
    quantity
    status
    comment
  }
}
    `) as unknown as TypedDocumentString<
  AdminCreateStationPropertyMutation,
  AdminCreateStationPropertyMutationVariables
>;
export const AdminUpdateStationPropertyDocument = new TypedDocumentString(`
    mutation AdminUpdateStationProperty($uuid: UUID!, $input: UpdateStationPropertyInput!) {
  updateStationProperty(uuid: $uuid, input: $input) {
    uuid
    stationUuid
    propertyType
    propertyName
    quantity
    status
    comment
  }
}
    `) as unknown as TypedDocumentString<
  AdminUpdateStationPropertyMutation,
  AdminUpdateStationPropertyMutationVariables
>;
export const AdminCreateTaskPropertyDocument = new TypedDocumentString(`
    mutation AdminCreateTaskProperty($input: CreateTaskPropertyInput!) {
  createTaskProperty(input: $input) {
    uuid
    taskUuid
    propertyName
    propertyValue
    quantity
    status
    comment
  }
}
    `) as unknown as TypedDocumentString<
  AdminCreateTaskPropertyMutation,
  AdminCreateTaskPropertyMutationVariables
>;
export const AdminUpdateTaskPropertyDocument = new TypedDocumentString(`
    mutation AdminUpdateTaskProperty($uuid: UUID!, $input: UpdateTaskPropertyInput!) {
  updateTaskProperty(uuid: $uuid, input: $input) {
    uuid
    taskUuid
    propertyName
    propertyValue
    quantity
    status
    comment
  }
}
    `) as unknown as TypedDocumentString<
  AdminUpdateTaskPropertyMutation,
  AdminUpdateTaskPropertyMutationVariables
>;
export const AdminCreateAnnouncementDocument = new TypedDocumentString(`
    mutation AdminCreateAnnouncement($input: CreateAnnouncementInput!) {
  createAnnouncement(input: $input) {
    uuid
    content
    active
  }
}
    `) as unknown as TypedDocumentString<
  AdminCreateAnnouncementMutation,
  AdminCreateAnnouncementMutationVariables
>;
export const AdminUpdateAnnouncementDocument = new TypedDocumentString(`
    mutation AdminUpdateAnnouncement($uuid: UUID!, $input: UpdateAnnouncementInput!) {
  updateAnnouncement(uuid: $uuid, input: $input) {
    uuid
    content
    active
  }
}
    `) as unknown as TypedDocumentString<
  AdminUpdateAnnouncementMutation,
  AdminUpdateAnnouncementMutationVariables
>;
export const AdminDeleteAnnouncementDocument = new TypedDocumentString(`
    mutation AdminDeleteAnnouncement($uuid: UUID!) {
  deleteAnnouncement(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminDeleteAnnouncementMutation,
  AdminDeleteAnnouncementMutationVariables
>;
export const AdminSetAnnouncementActiveDocument = new TypedDocumentString(`
    mutation AdminSetAnnouncementActive($uuid: UUID!, $active: Boolean!) {
  setAnnouncementActive(uuid: $uuid, active: $active) {
    uuid
    active
  }
}
    `) as unknown as TypedDocumentString<
  AdminSetAnnouncementActiveMutation,
  AdminSetAnnouncementActiveMutationVariables
>;
export const AdminGenerateBriefingDocument = new TypedDocumentString(`
    mutation AdminGenerateBriefing($input: GenerateBriefingInput!) {
  generateBriefing(input: $input) {
    ...AdminBriefingFields
  }
}
    fragment AdminBriefingFields on BriefingType {
  uuid
  templateUuid
  content
  tags
  state
  status
  publishedAt
  createdAt
  updatedAt
  creator {
    uuid
    name
  }
  updater {
    uuid
    name
  }
  publisher {
    uuid
    name
  }
}`) as unknown as TypedDocumentString<
  AdminGenerateBriefingMutation,
  AdminGenerateBriefingMutationVariables
>;
export const AdminUpdateBriefingDocument = new TypedDocumentString(`
    mutation AdminUpdateBriefing($uuid: UUID!, $input: UpdateBriefingInput!) {
  updateBriefing(uuid: $uuid, input: $input) {
    ...AdminBriefingFields
  }
}
    fragment AdminBriefingFields on BriefingType {
  uuid
  templateUuid
  content
  tags
  state
  status
  publishedAt
  createdAt
  updatedAt
  creator {
    uuid
    name
  }
  updater {
    uuid
    name
  }
  publisher {
    uuid
    name
  }
}`) as unknown as TypedDocumentString<
  AdminUpdateBriefingMutation,
  AdminUpdateBriefingMutationVariables
>;
export const AdminPublishBriefingDocument = new TypedDocumentString(`
    mutation AdminPublishBriefing($uuid: UUID!) {
  publishBriefing(uuid: $uuid) {
    ...AdminBriefingFields
  }
}
    fragment AdminBriefingFields on BriefingType {
  uuid
  templateUuid
  content
  tags
  state
  status
  publishedAt
  createdAt
  updatedAt
  creator {
    uuid
    name
  }
  updater {
    uuid
    name
  }
  publisher {
    uuid
    name
  }
}`) as unknown as TypedDocumentString<
  AdminPublishBriefingMutation,
  AdminPublishBriefingMutationVariables
>;
export const AdminTakeDownBriefingDocument = new TypedDocumentString(`
    mutation AdminTakeDownBriefing($uuid: UUID!) {
  takeDownBriefing(uuid: $uuid) {
    ...AdminBriefingFields
  }
}
    fragment AdminBriefingFields on BriefingType {
  uuid
  templateUuid
  content
  tags
  state
  status
  publishedAt
  createdAt
  updatedAt
  creator {
    uuid
    name
  }
  updater {
    uuid
    name
  }
  publisher {
    uuid
    name
  }
}`) as unknown as TypedDocumentString<
  AdminTakeDownBriefingMutation,
  AdminTakeDownBriefingMutationVariables
>;
export const AdminDeleteBriefingDocument = new TypedDocumentString(`
    mutation AdminDeleteBriefing($uuid: UUID!) {
  deleteBriefing(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminDeleteBriefingMutation,
  AdminDeleteBriefingMutationVariables
>;
export const AdminCreateBriefingTemplateDocument = new TypedDocumentString(`
    mutation AdminCreateBriefingTemplate($input: CreateBriefingTemplateInput!) {
  createBriefingTemplate(input: $input) {
    uuid
    content
    tags
    state
  }
}
    `) as unknown as TypedDocumentString<
  AdminCreateBriefingTemplateMutation,
  AdminCreateBriefingTemplateMutationVariables
>;
export const AdminUpdateBriefingTemplateDocument = new TypedDocumentString(`
    mutation AdminUpdateBriefingTemplate($uuid: UUID!, $input: UpdateBriefingTemplateInput!) {
  updateBriefingTemplate(uuid: $uuid, input: $input) {
    uuid
    content
    tags
    state
  }
}
    `) as unknown as TypedDocumentString<
  AdminUpdateBriefingTemplateMutation,
  AdminUpdateBriefingTemplateMutationVariables
>;
export const AdminDeleteBriefingTemplateDocument = new TypedDocumentString(`
    mutation AdminDeleteBriefingTemplate($uuid: UUID!) {
  deleteBriefingTemplate(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminDeleteBriefingTemplateMutation,
  AdminDeleteBriefingTemplateMutationVariables
>;
export const AdminUpsertStationPropertyConfigDocument =
  new TypedDocumentString(`
    mutation AdminUpsertStationPropertyConfig($stationType: String!, $input: UpsertPropertyConfigInput!) {
  upsertStationPropertyConfig(stationType: $stationType, input: $input) {
    uuid
    propertyName
  }
}
    `) as unknown as TypedDocumentString<
    AdminUpsertStationPropertyConfigMutation,
    AdminUpsertStationPropertyConfigMutationVariables
  >;
export const AdminUpsertTaskPropertyConfigDocument = new TypedDocumentString(`
    mutation AdminUpsertTaskPropertyConfig($taskType: String!, $input: UpsertPropertyConfigInput!) {
  upsertTaskPropertyConfig(taskType: $taskType, input: $input) {
    uuid
    propertyName
  }
}
    `) as unknown as TypedDocumentString<
  AdminUpsertTaskPropertyConfigMutation,
  AdminUpsertTaskPropertyConfigMutationVariables
>;
export const AdminUpsertTicketPropertyConfigDocument = new TypedDocumentString(`
    mutation AdminUpsertTicketPropertyConfig($input: UpsertTicketPropertyConfigInput!) {
  upsertTicketPropertyConfig(input: $input) {
    uuid
    propertyName
  }
}
    `) as unknown as TypedDocumentString<
  AdminUpsertTicketPropertyConfigMutation,
  AdminUpsertTicketPropertyConfigMutationVariables
>;
export const AdminUpsertDisasterTypeDocument = new TypedDocumentString(`
    mutation AdminUpsertDisasterType($input: UpsertDisasterTypeInput!) {
  upsertDisasterType(input: $input) {
    uuid
    key
    label
  }
}
    `) as unknown as TypedDocumentString<
  AdminUpsertDisasterTypeMutation,
  AdminUpsertDisasterTypeMutationVariables
>;
export const AdminHazardousZoneSourceDocument = new TypedDocumentString(`
    query AdminHazardousZoneSource($uuid: UUID!) {
  hazardousZone(uuid: $uuid) {
    uuid
    informationSource
  }
}
    `) as unknown as TypedDocumentString<
  AdminHazardousZoneSourceQuery,
  AdminHazardousZoneSourceQueryVariables
>;
export const AdminCreateAreaDocument = new TypedDocumentString(`
    mutation AdminCreateArea($input: CreateAreaInput!) {
  createArea(input: $input) {
    uuid
    type
    name
  }
}
    `) as unknown as TypedDocumentString<
  AdminCreateAreaMutation,
  AdminCreateAreaMutationVariables
>;
export const AdminUpdateAreaDocument = new TypedDocumentString(`
    mutation AdminUpdateArea($uuid: UUID!, $input: UpdateAreaInput!) {
  updateArea(uuid: $uuid, input: $input) {
    uuid
    name
    note
    isPublic
  }
}
    `) as unknown as TypedDocumentString<
  AdminUpdateAreaMutation,
  AdminUpdateAreaMutationVariables
>;
export const AdminDeleteAreaDocument = new TypedDocumentString(`
    mutation AdminDeleteArea($uuid: UUID!) {
  deleteArea(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminDeleteAreaMutation,
  AdminDeleteAreaMutationVariables
>;
export const AdminAssignZoneToTeamDocument = new TypedDocumentString(`
    mutation AdminAssignZoneToTeam($input: ZoneTeamAssignmentInput!) {
  assignZoneToTeam(input: $input) {
    zoneUuid
    teamUuid
    assignedAt
  }
}
    `) as unknown as TypedDocumentString<
  AdminAssignZoneToTeamMutation,
  AdminAssignZoneToTeamMutationVariables
>;
export const AdminRemoveZoneFromTeamDocument = new TypedDocumentString(`
    mutation AdminRemoveZoneFromTeam($input: ZoneTeamAssignmentInput!) {
  removeZoneFromTeam(input: $input)
}
    `) as unknown as TypedDocumentString<
  AdminRemoveZoneFromTeamMutation,
  AdminRemoveZoneFromTeamMutationVariables
>;
export const AdminBuildingMapsDocument = new TypedDocumentString(`
    query AdminBuildingMaps($bounds: BoundsInput, $skip: Int! = 0, $limit: Int! = 200) {
  buildingMaps(bounds: $bounds, skip: $skip, limit: $limit) {
    items {
      ...AdminBuildingMapFields
    }
    pageInfo {
      ...AdminPageInfo
    }
  }
}
    fragment AdminPageInfo on PageInfo {
  totalCount
  hasNextPage
  hasPreviousPage
}
fragment AdminBuildingMapFields on BuildingMapType {
  uuid
  name
  geometry
  floorsAboveGround
  floorsBelowGround
  createdAt
  updatedAt
  floors {
    label
  }
  secondaryLocation {
    fullAddress
    normalizationStatus
  }
}`) as unknown as TypedDocumentString<
  AdminBuildingMapsQuery,
  AdminBuildingMapsQueryVariables
>;
export const AdminBuildingMapDocument = new TypedDocumentString(`
    query AdminBuildingMap($uuid: UUID!) {
  buildingMap(uuid: $uuid) {
    ...AdminBuildingMapFields
  }
}
    fragment AdminBuildingMapFields on BuildingMapType {
  uuid
  name
  geometry
  floorsAboveGround
  floorsBelowGround
  createdAt
  updatedAt
  floors {
    label
  }
  secondaryLocation {
    fullAddress
    normalizationStatus
  }
}`) as unknown as TypedDocumentString<
  AdminBuildingMapQuery,
  AdminBuildingMapQueryVariables
>;
export const AdminBuildingMapTicketsDocument = new TypedDocumentString(`
    query AdminBuildingMapTickets($buildingMapUuid: UUID!, $limit: Int! = 200) {
  buildingMapTickets(buildingMapUuid: $buildingMapUuid, limit: $limit) {
    ...AdminSpaceTicketFields
  }
}
    fragment AdminSpaceTicketFields on TicketType {
  uuid
  propertyName
  title
  status
  priority
  disasterTypes
  updatedAt
  secondaryLocation {
    county
    town
    floor
    room
  }
  responsibleTeams {
    uuid
  }
  tasks {
    uuid
    taskType
    status
    quantity
    assignedCount
  }
}`) as unknown as TypedDocumentString<
  AdminBuildingMapTicketsQuery,
  AdminBuildingMapTicketsQueryVariables
>;
export const AdminNormalizeAddressDocument = new TypedDocumentString(`
    query AdminNormalizeAddress($address: String!, $lat: Float, $lng: Float) {
  normalizeAddress(address: $address, lat: $lat, lng: $lng) {
    status
    fullAddress
    addressToken
    lat
    lng
    buildingSection
    floor
    room
  }
}
    `) as unknown as TypedDocumentString<
  AdminNormalizeAddressQuery,
  AdminNormalizeAddressQueryVariables
>;
export const AdminCreateBuildingMapDocument = new TypedDocumentString(`
    mutation AdminCreateBuildingMap($input: CreateBuildingMapInput!) {
  createBuildingMap(input: $input) {
    ...AdminBuildingMapFields
  }
}
    fragment AdminBuildingMapFields on BuildingMapType {
  uuid
  name
  geometry
  floorsAboveGround
  floorsBelowGround
  createdAt
  updatedAt
  floors {
    label
  }
  secondaryLocation {
    fullAddress
    normalizationStatus
  }
}`) as unknown as TypedDocumentString<
  AdminCreateBuildingMapMutation,
  AdminCreateBuildingMapMutationVariables
>;
export const AdminUpdateBuildingMapDocument = new TypedDocumentString(`
    mutation AdminUpdateBuildingMap($uuid: UUID!, $input: UpdateBuildingMapInput!) {
  updateBuildingMap(uuid: $uuid, input: $input) {
    ...AdminBuildingMapFields
  }
}
    fragment AdminBuildingMapFields on BuildingMapType {
  uuid
  name
  geometry
  floorsAboveGround
  floorsBelowGround
  createdAt
  updatedAt
  floors {
    label
  }
  secondaryLocation {
    fullAddress
    normalizationStatus
  }
}`) as unknown as TypedDocumentString<
  AdminUpdateBuildingMapMutation,
  AdminUpdateBuildingMapMutationVariables
>;
export const AdminDeleteBuildingMapDocument = new TypedDocumentString(`
    mutation AdminDeleteBuildingMap($uuid: UUID!) {
  deleteBuildingMap(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  AdminDeleteBuildingMapMutation,
  AdminDeleteBuildingMapMutationVariables
>;
export const SiteAnnouncementsDocument = new TypedDocumentString(`
    query SiteAnnouncements {
  announcements(filter: ACTIVE, placement: public_page) {
    uuid
    content
    publishedAt
  }
}
    `) as unknown as TypedDocumentString<
  SiteAnnouncementsQuery,
  SiteAnnouncementsQueryVariables
>;
export const CurrentBriefingDocument = new TypedDocumentString(`
    query CurrentBriefing {
  briefings(state: BRIEFING, status: PUBLISHED) {
    uuid
    content
    publishedAt
  }
}
    `) as unknown as TypedDocumentString<
  CurrentBriefingQuery,
  CurrentBriefingQueryVariables
>;
export const GetBuildingMapWithTicketsDocument = new TypedDocumentString(`
    query GetBuildingMapWithTickets($uuid: UUID!, $limit: Int! = 200) {
  buildingMap(uuid: $uuid) {
    uuid
    name
    floors {
      label
      areas
    }
    secondaryLocation {
      fullAddress
      landmarkNote
    }
  }
  buildingMapTickets(buildingMapUuid: $uuid, limit: $limit) {
    ...TicketFields
    secondaryLocation {
      floor
      room
    }
    tasks {
      ...TicketNeedFields
    }
  }
}
    fragment TicketFields on TicketType {
  uuid
  propertyName
  geometry
  locationCell
  buildingMapUuid
  title
  description
  contactName
  contactEmail
  contactPhone
  status
  priority
  taskType
  auditStatus
  createdBy
  createdAt
  updatedAt
}
fragment TicketNeedFields on TicketTaskType {
  uuid
  taskName
  taskType
  quantity
  status
  assignedCount
  myAssignment {
    uuid
  }
}`) as unknown as TypedDocumentString<
  GetBuildingMapWithTicketsQuery,
  GetBuildingMapWithTicketsQueryVariables
>;
export const GetBuildingMapsDocument = new TypedDocumentString(`
    query GetBuildingMaps($limit: Int! = 200) {
  buildingMaps(limit: $limit) {
    items {
      uuid
      name
      geometry
      floors {
        label
      }
      secondaryLocation {
        fullAddress
        landmarkNote
      }
      ticketCount
      shortfall
    }
    pageInfo {
      totalCount
    }
  }
}
    `) as unknown as TypedDocumentString<
  GetBuildingMapsQuery,
  GetBuildingMapsQueryVariables
>;
export const GetStationsDocument = new TypedDocumentString(`
    query GetStations($bounds: BoundsInput, $stationType: String, $skip: Int = 0, $limit: Int = 50) {
  stations(bounds: $bounds, stationType: $stationType, skip: $skip, limit: $limit) {
    items {
      ...StationFields
    }
    pageInfo {
      ...PageInfoFields
    }
  }
}
    fragment PageInfoFields on PageInfo {
  totalCount
  hasNextPage
  hasPreviousPage
}
fragment StationFields on StationType {
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
  isDuplicate
  isTemporary
  isOfficial
  operationalStatus
  supplyStatus
  supplyStatusUpdatedAt
  createdBy
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  GetStationsQuery,
  GetStationsQueryVariables
>;
export const GetStationDocument = new TypedDocumentString(`
    query GetStation($uuid: UUID!) {
  station(uuid: $uuid) {
    ...StationFields
    secondaryLocation {
      uuid
      locationType
      fullAddress
      county
      town
      village
      neighborhood
      road
      section
      lane
      alley
      no
      normalizationStatus
      floor
      room
      poleId
      poleType
      poleNote
    }
    properties {
      uuid
      stationUuid
      propertyType
      propertyName
      quantity
      comment
      status
      weightings
      createdBy
      createdAt
    }
  }
}
    fragment StationFields on StationType {
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
  isDuplicate
  isTemporary
  isOfficial
  operationalStatus
  supplyStatus
  supplyStatusUpdatedAt
  createdBy
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  GetStationQuery,
  GetStationQueryVariables
>;
export const GetMapAreasDocument = new TypedDocumentString(`
    query GetMapAreas($bounds: BoundsInput, $includePrivate: Boolean = false, $skip: Int = 0, $limit: Int = 50) {
  areas(
    bounds: $bounds
    includePrivate: $includePrivate
    skip: $skip
    limit: $limit
  ) {
    items {
      uuid
      type
      name
      note
      geometry
      isPublic
      assignedTeams {
        uuid
        name
      }
    }
    pageInfo {
      ...PageInfoFields
    }
  }
}
    fragment PageInfoFields on PageInfo {
  totalCount
  hasNextPage
  hasPreviousPage
}`) as unknown as TypedDocumentString<
  GetMapAreasQuery,
  GetMapAreasQueryVariables
>;
export const GetClosureAreaDocument = new TypedDocumentString(`
    query GetClosureArea($uuid: UUID!) {
  hazardousZone(uuid: $uuid) {
    ...ClosureAreaFields
  }
}
    fragment ClosureAreaFields on HazardousZoneType {
  uuid
  propertyName
  name
  geometry
  status
  informationSource
  note
  createdBy
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  GetClosureAreaQuery,
  GetClosureAreaQueryVariables
>;
export const ReverseGeocodeDocument = new TypedDocumentString(`
    query ReverseGeocode($lat: Float!, $lng: Float!) {
  reverseGeocode(lat: $lat, lng: $lng) {
    status
    fullAddress
    lat
    lng
    buildingSection
    floor
    room
    addressToken
  }
}
    `) as unknown as TypedDocumentString<
  ReverseGeocodeQuery,
  ReverseGeocodeQueryVariables
>;
export const NormalizeAddressDocument = new TypedDocumentString(`
    query NormalizeAddress($address: String!, $lat: Float, $lng: Float) {
  normalizeAddress(address: $address, lat: $lat, lng: $lng) {
    status
    fullAddress
    lat
    lng
    buildingSection
    floor
    room
    addressToken
  }
}
    `) as unknown as TypedDocumentString<
  NormalizeAddressQuery,
  NormalizeAddressQueryVariables
>;
export const UpdateStationDocument = new TypedDocumentString(`
    mutation UpdateStation($uuid: UUID!, $input: UpdateStationInput!) {
  updateStation(uuid: $uuid, input: $input) {
    ...StationFields
  }
}
    fragment StationFields on StationType {
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
  isDuplicate
  isTemporary
  isOfficial
  operationalStatus
  supplyStatus
  supplyStatusUpdatedAt
  createdBy
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  UpdateStationMutation,
  UpdateStationMutationVariables
>;
export const DeleteStationDocument = new TypedDocumentString(`
    mutation DeleteStation($uuid: UUID!) {
  deleteStation(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  DeleteStationMutation,
  DeleteStationMutationVariables
>;
export const CreateStationPropertyDocument = new TypedDocumentString(`
    mutation CreateStationProperty($input: CreateStationPropertyInput!) {
  createStationProperty(input: $input) {
    uuid
    stationUuid
    propertyType
    propertyName
    quantity
    status
    weightings
    createdBy
    createdAt
  }
}
    `) as unknown as TypedDocumentString<
  CreateStationPropertyMutation,
  CreateStationPropertyMutationVariables
>;
export const CreateCrowdSourcingDocument = new TypedDocumentString(`
    mutation CreateCrowdSourcing($input: CreateCrowdSourcingInput!) {
  createCrowdSourcing(input: $input) {
    uuid
    stationUuid
    itemUuid
    rating
    createdAt
  }
}
    `) as unknown as TypedDocumentString<
  CreateCrowdSourcingMutation,
  CreateCrowdSourcingMutationVariables
>;
export const GetStationForSuggestionDocument = new TypedDocumentString(`
    query GetStationForSuggestion($uuid: UUID!) {
  station(uuid: $uuid) {
    uuid
    name
    type
    description
    opHour
    operationalStatus
    supplyStatus
    pendingSuggestedFields
  }
}
    `) as unknown as TypedDocumentString<
  GetStationForSuggestionQuery,
  GetStationForSuggestionQueryVariables
>;
export const CreateStationSuggestionDocument = new TypedDocumentString(`
    mutation CreateStationSuggestion($input: CreateStationSuggestionInput!) {
  createStationSuggestion(input: $input) {
    uuid
    fieldName
    newValue
    status
  }
}
    `) as unknown as TypedDocumentString<
  CreateStationSuggestionMutation,
  CreateStationSuggestionMutationVariables
>;
export const MyStationSuggestionsDocument = new TypedDocumentString(`
    query MyStationSuggestions {
  myStationSuggestions {
    uuid
    targetType
    station {
      uuid
      name
    }
    fieldName
    previousValue
    newValue
    comment
    status
    appliedValue
    submittedAt
    decidedAt
  }
}
    `) as unknown as TypedDocumentString<
  MyStationSuggestionsQuery,
  MyStationSuggestionsQueryVariables
>;
export const MyRoleRequestsDocument = new TypedDocumentString(`
    query MyRoleRequests {
  myRoleRequests {
    hasBackofficeIdentity
    canApply
    requests {
      uuid
      requestedRole
      reason
      status
      reviewNote
      createdAt
      closedAt
      team {
        uuid
        name
      }
      newTeamName
      applicantName
      applicantPhone
    }
  }
}
    `) as unknown as TypedDocumentString<
  MyRoleRequestsQuery,
  MyRoleRequestsQueryVariables
>;
export const RoleRequestTeamsDocument = new TypedDocumentString(`
    query RoleRequestTeams($type: RoleRequestTeamType!) {
  roleRequestTeams(type: $type) {
    uuid
    name
  }
}
    `) as unknown as TypedDocumentString<
  RoleRequestTeamsQuery,
  RoleRequestTeamsQueryVariables
>;
export const SubmitRoleRequestDocument = new TypedDocumentString(`
    mutation SubmitRoleRequest($input: SubmitRoleRequestInput!) {
  submitRoleRequest(input: $input) {
    uuid
  }
}
    `) as unknown as TypedDocumentString<
  SubmitRoleRequestMutation,
  SubmitRoleRequestMutationVariables
>;
export const WithdrawRoleRequestDocument = new TypedDocumentString(`
    mutation WithdrawRoleRequest($uuid: UUID!) {
  withdrawRoleRequest(uuid: $uuid) {
    uuid
  }
}
    `) as unknown as TypedDocumentString<
  WithdrawRoleRequestMutation,
  WithdrawRoleRequestMutationVariables
>;
export const GetTicketsDocument = new TypedDocumentString(`
    query GetTickets($bounds: BoundsInput, $status: String, $statuses: [TicketStatus!], $priority: String, $skip: Int = 0, $limit: Int = 50, $zoom: Float) {
  tickets(
    bounds: $bounds
    status: $status
    statuses: $statuses
    priority: $priority
    skip: $skip
    limit: $limit
    zoom: $zoom
  ) {
    items {
      ...TicketFields
      suspectedDuplicateOf {
        uuid
        title
      }
    }
    pageInfo {
      totalCount
      hasNextPage
      hasPreviousPage
    }
  }
}
    fragment TicketFields on TicketType {
  uuid
  propertyName
  geometry
  locationCell
  buildingMapUuid
  title
  description
  contactName
  contactEmail
  contactPhone
  status
  priority
  taskType
  auditStatus
  createdBy
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  GetTicketsQuery,
  GetTicketsQueryVariables
>;
export const GetTicketCellsDocument = new TypedDocumentString(`
    query GetTicketCells($bounds: BoundsInput!, $zoom: Float, $statuses: [TicketStatus!]) {
  ticketCells(bounds: $bounds, zoom: $zoom, statuses: $statuses) {
    cell
    ticketCount
    urgentCount
  }
}
    `) as unknown as TypedDocumentString<
  GetTicketCellsQuery,
  GetTicketCellsQueryVariables
>;
export const GetCellTicketsDocument = new TypedDocumentString(`
    query GetCellTickets($locationCell: String!, $statuses: [TicketStatus!], $skip: Int = 0, $limit: Int = 200) {
  tickets(
    locationCell: $locationCell
    statuses: $statuses
    skip: $skip
    limit: $limit
  ) {
    items {
      ...TicketFields
    }
    pageInfo {
      hasNextPage
    }
  }
}
    fragment TicketFields on TicketType {
  uuid
  propertyName
  geometry
  locationCell
  buildingMapUuid
  title
  description
  contactName
  contactEmail
  contactPhone
  status
  priority
  taskType
  auditStatus
  createdBy
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  GetCellTicketsQuery,
  GetCellTicketsQueryVariables
>;
export const GetAdminMapTicketsDocument = new TypedDocumentString(`
    query GetAdminMapTickets($bounds: BoundsInput, $skip: Int = 0, $limit: Int = 50, $zoom: Float) {
  tickets(bounds: $bounds, skip: $skip, limit: $limit, zoom: $zoom) {
    items {
      ...TicketFields
      responsibleTeams {
        name
      }
    }
    pageInfo {
      totalCount
      hasNextPage
      hasPreviousPage
    }
  }
}
    fragment TicketFields on TicketType {
  uuid
  propertyName
  geometry
  locationCell
  buildingMapUuid
  title
  description
  contactName
  contactEmail
  contactPhone
  status
  priority
  taskType
  auditStatus
  createdBy
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  GetAdminMapTicketsQuery,
  GetAdminMapTicketsQueryVariables
>;
export const GetTicketsWithNeedsDocument = new TypedDocumentString(`
    query GetTicketsWithNeeds($bounds: BoundsInput, $status: String, $priority: String, $q: String, $skip: Int = 0, $limit: Int = 50, $zoom: Float, $order: TicketListOrder) {
  tickets(
    bounds: $bounds
    status: $status
    priority: $priority
    q: $q
    skip: $skip
    limit: $limit
    zoom: $zoom
    order: $order
  ) {
    items {
      ...TicketFields
      suspectedDuplicateOf {
        uuid
        title
      }
      tasks {
        ...TicketNeedFields
      }
    }
    pageInfo {
      totalCount
      hasNextPage
      hasPreviousPage
    }
  }
}
    fragment TicketFields on TicketType {
  uuid
  propertyName
  geometry
  locationCell
  buildingMapUuid
  title
  description
  contactName
  contactEmail
  contactPhone
  status
  priority
  taskType
  auditStatus
  createdBy
  createdAt
  updatedAt
}
fragment TicketNeedFields on TicketTaskType {
  uuid
  taskName
  taskType
  quantity
  status
  assignedCount
  myAssignment {
    uuid
  }
}`) as unknown as TypedDocumentString<
  GetTicketsWithNeedsQuery,
  GetTicketsWithNeedsQueryVariables
>;
export const GetTicketDocument = new TypedDocumentString(`
    query GetTicket($uuid: UUID!) {
  ticket(uuid: $uuid) {
    ...TicketFields
    suspectedDuplicateOf {
      uuid
      title
    }
    buildingMapUuid
    secondaryLocation {
      fullAddress
      county
      town
      village
      neighborhood
      road
      section
      lane
      alley
      no
      normalizationStatus
      buildingSection
      floor
      room
      landmarkNote
    }
    responsibleTeams {
      uuid
      name
    }
    photos {
      uuid
      url
      createdAt
    }
    tasks {
      ...TicketTaskFields
      ...TicketNeedFields
    }
  }
}
    fragment TicketFields on TicketType {
  uuid
  propertyName
  geometry
  locationCell
  buildingMapUuid
  title
  description
  contactName
  contactEmail
  contactPhone
  status
  priority
  taskType
  auditStatus
  createdBy
  createdAt
  updatedAt
}
fragment TicketTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  source
  progressNote
  createdAt
  updatedAt
}
fragment TicketNeedFields on TicketTaskType {
  uuid
  taskName
  taskType
  quantity
  status
  assignedCount
  myAssignment {
    uuid
  }
}`) as unknown as TypedDocumentString<GetTicketQuery, GetTicketQueryVariables>;
export const GetLinkedTicketDocument = new TypedDocumentString(`
    query GetLinkedTicket($uuid: UUID!) {
  ticket(uuid: $uuid) {
    ...TicketFields
  }
  ticketAvailability(uuid: $uuid) {
    status
    replacedByUuid
  }
}
    fragment TicketFields on TicketType {
  uuid
  propertyName
  geometry
  locationCell
  buildingMapUuid
  title
  description
  contactName
  contactEmail
  contactPhone
  status
  priority
  taskType
  auditStatus
  createdBy
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  GetLinkedTicketQuery,
  GetLinkedTicketQueryVariables
>;
export const GetTicketTasksDocument = new TypedDocumentString(`
    query GetTicketTasks($ticketUuid: String!, $status: String, $skip: Int = 0, $limit: Int = 50) {
  ticketTasks(
    ticketUuid: $ticketUuid
    status: $status
    skip: $skip
    limit: $limit
  ) {
    ...TicketTaskFields
    properties {
      uuid
      taskUuid
      propertyName
      propertyValue
      quantity
      status
      comment
      createdAt
    }
  }
}
    fragment TicketTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  source
  progressNote
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  GetTicketTasksQuery,
  GetTicketTasksQueryVariables
>;
export const CreateHelpRequestDocument = new TypedDocumentString(`
    mutation CreateHelpRequest($input: CreateHelpRequestInput!) {
  createHelpRequest(input: $input) {
    __typename
    ... on TicketCreated {
      ticket {
        ...TicketFields
      }
      tasks {
        ...TicketNeedFields
      }
    }
    ... on DuplicatesSuspected {
      suspects {
        draftRef
        relatedUuid
        relatedTicketUuid
      }
    }
  }
}
    fragment TicketFields on TicketType {
  uuid
  propertyName
  geometry
  locationCell
  buildingMapUuid
  title
  description
  contactName
  contactEmail
  contactPhone
  status
  priority
  taskType
  auditStatus
  createdBy
  createdAt
  updatedAt
}
fragment TicketNeedFields on TicketTaskType {
  uuid
  taskName
  taskType
  quantity
  status
  assignedCount
  myAssignment {
    uuid
  }
}`) as unknown as TypedDocumentString<
  CreateHelpRequestMutation,
  CreateHelpRequestMutationVariables
>;
export const UpdateTicketDocument = new TypedDocumentString(`
    mutation UpdateTicket($uuid: UUID!, $input: UpdateTicketInput!) {
  updateTicket(uuid: $uuid, input: $input) {
    ...TicketFields
  }
}
    fragment TicketFields on TicketType {
  uuid
  propertyName
  geometry
  locationCell
  buildingMapUuid
  title
  description
  contactName
  contactEmail
  contactPhone
  status
  priority
  taskType
  auditStatus
  createdBy
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  UpdateTicketMutation,
  UpdateTicketMutationVariables
>;
export const CreateTicketTaskDocument = new TypedDocumentString(`
    mutation CreateTicketTask($input: CreateTicketTaskInput!, $acknowledgedDuplicateOf: String) {
  createTicketTask(
    input: $input
    acknowledgedDuplicateOf: $acknowledgedDuplicateOf
  ) {
    __typename
    ... on TicketTaskCreated {
      task {
        ...TicketTaskFields
      }
    }
    ... on DuplicatesSuspected {
      suspects {
        relatedUuid
        relatedTicketUuid
      }
    }
  }
}
    fragment TicketTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  source
  progressNote
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  CreateTicketTaskMutation,
  CreateTicketTaskMutationVariables
>;
export const UpdateTicketTaskDocument = new TypedDocumentString(`
    mutation UpdateTicketTask($uuid: UUID!, $input: UpdateTicketTaskInput!) {
  updateTicketTask(uuid: $uuid, input: $input) {
    ...TicketTaskFields
  }
}
    fragment TicketTaskFields on TicketTaskType {
  uuid
  ticketUuid
  taskType
  taskName
  taskDescription
  quantity
  status
  source
  progressNote
  createdAt
  updatedAt
}`) as unknown as TypedDocumentString<
  UpdateTicketTaskMutation,
  UpdateTicketTaskMutationVariables
>;
export const ClaimNeedDocument = new TypedDocumentString(`
    mutation ClaimNeed($taskUuid: UUID!) {
  assignTaskActor(taskUuid: $taskUuid) {
    uuid
    taskUuid
  }
}
    `) as unknown as TypedDocumentString<
  ClaimNeedMutation,
  ClaimNeedMutationVariables
>;
export const ReleaseClaimDocument = new TypedDocumentString(`
    mutation ReleaseClaim($uuid: UUID!) {
  unassignTaskActor(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  ReleaseClaimMutation,
  ReleaseClaimMutationVariables
>;
export const StopRecruitingDocument = new TypedDocumentString(`
    mutation StopRecruiting($taskUuid: UUID!) {
  stopRecruiting(taskUuid: $taskUuid) {
    uuid
  }
}
    `) as unknown as TypedDocumentString<
  StopRecruitingMutation,
  StopRecruitingMutationVariables
>;
export const DeleteTicketTaskDocument = new TypedDocumentString(`
    mutation DeleteTicketTask($uuid: UUID!) {
  deleteTicketTask(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  DeleteTicketTaskMutation,
  DeleteTicketTaskMutationVariables
>;
export const DeleteTicketDocument = new TypedDocumentString(`
    mutation DeleteTicket($uuid: UUID!) {
  deleteTicket(uuid: $uuid)
}
    `) as unknown as TypedDocumentString<
  DeleteTicketMutation,
  DeleteTicketMutationVariables
>;
export const MyTaskAssignmentsDocument = new TypedDocumentString(`
    query MyTaskAssignments {
  myTaskAssignments {
    assignment {
      uuid
      assignedAt
    }
    task {
      uuid
      taskName
      recruitingStoppedAt
    }
    ticket {
      uuid
      title
      contactName
      contactPhone
      secondaryLocation {
        fullAddress
        county
        town
        village
        neighborhood
        road
        section
        lane
        alley
        no
        normalizationStatus
        buildingSection
        floor
        room
        landmarkNote
      }
    }
  }
}
    `) as unknown as TypedDocumentString<
  MyTaskAssignmentsQuery,
  MyTaskAssignmentsQueryVariables
>;
export const MyTicketsDocument = new TypedDocumentString(`
    query MyTickets {
  myTickets {
    uuid
    title
    status
    createdAt
    tasks {
      uuid
      status
    }
  }
}
    `) as unknown as TypedDocumentString<
  MyTicketsQuery,
  MyTicketsQueryVariables
>;
export const CreateTaskPropertyDocument = new TypedDocumentString(`
    mutation CreateTaskProperty($input: CreateTaskPropertyInput!) {
  createTaskProperty(input: $input) {
    uuid
    taskUuid
    propertyName
    propertyValue
    quantity
    status
    comment
    createdAt
  }
}
    `) as unknown as TypedDocumentString<
  CreateTaskPropertyMutation,
  CreateTaskPropertyMutationVariables
>;
