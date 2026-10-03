import type { Geometry } from 'geojson';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
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
  UUID: { input: string; output: string };
};

export const AccessStatus = {
  Accessible: 'accessible',
  Inaccessible: 'inaccessible',
  Restricted: 'restricted',
  Unknown: 'unknown',
} as const;

export type AccessStatus = (typeof AccessStatus)[keyof typeof AccessStatus];
export const AnnouncementFilter = {
  Active: 'ACTIVE',
  All: 'ALL',
} as const;

export type AnnouncementFilter =
  (typeof AnnouncementFilter)[keyof typeof AnnouncementFilter];
export const AnnouncementMoveDirection = {
  Down: 'DOWN',
  Up: 'UP',
} as const;

export type AnnouncementMoveDirection =
  (typeof AnnouncementMoveDirection)[keyof typeof AnnouncementMoveDirection];
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

export const BriefingState = {
  Briefing: 'BRIEFING',
  Debrief: 'DEBRIEF',
  InField: 'IN_FIELD',
} as const;

export type BriefingState = (typeof BriefingState)[keyof typeof BriefingState];
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
  /** UUID of the user who created this briefing */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** Lifecycle phase: 'briefing', 'in_field', or 'debrief' */
  state: Scalars['String']['output'];
  /** Free-form categorization tags */
  tags: Array<Scalars['String']['output']>;
  /** UUID of the source template, or null for ad-hoc briefings */
  templateUuid?: Maybe<Scalars['UUID']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  uuid: Scalars['UUID']['output'];
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

export type CreateBriefingTemplateInput = {
  /** The template body text */
  content: Scalars['String']['input'];
  /** Lifecycle phase this template targets */
  state?: BriefingState;
  /** Categorization tags */
  tags?: Array<Scalars['String']['input']>;
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
  /** Whether the station is open: 'active' (default), 'temporarily_closed', or 'permanently_closed' */
  operationalStatus?: StationOperationalStatus;
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
  /** Disaster type keys, e.g. ['flood', 'landslide']. Each must be an active key from `disasterTypes`; an unknown one is rejected rather than stored, because a ticket filed under a disaster that does not exist would show the reporter an empty form */
  disasterTypes?: InputMaybe<Array<Scalars['String']['input']>>;
  /** GeoJSON Point for the location where help is needed — [longitude, latitude] */
  geometry: Scalars['GeoJSON']['input'];
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

export type Mutation = {
  __typename?: 'Mutation';
  assignStationToTeam: StationType;
  assignTaskActor: TaskAssignmentType;
  assignZoneToTeam: ZoneAssignmentType;
  attachStationPhoto: PhotoType;
  createAnnouncement: AnnouncementType;
  createBriefingTemplate: BriefingTemplateType;
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
  deleteBriefing: Scalars['Boolean']['output'];
  deleteBriefingTemplate: Scalars['Boolean']['output'];
  deleteClosureArea: Scalars['Boolean']['output'];
  deleteStation: Scalars['Boolean']['output'];
  deleteTicket: Scalars['Boolean']['output'];
  deleteWorkZone: Scalars['Boolean']['output'];
  detachStationPhoto: Scalars['Boolean']['output'];
  generateBriefing: BriefingType;
  moveAnnouncement: AnnouncementType;
  removeZoneFromTeam: Scalars['Boolean']['output'];
  reviewStationSuggestion: StationSuggestionType;
  reviewTicket: TicketType;
  setAnnouncementActive: AnnouncementType;
  setTicketDisasterDetails: Array<TicketDisasterDetailType>;
  unassignStation: StationType;
  unassignTaskActor: Scalars['Boolean']['output'];
  updateAnnouncement: AnnouncementType;
  updateBriefing: BriefingType;
  updateBriefingTemplate: BriefingTemplateType;
  updateClosureArea: ClosureAreaType;
  updateStation: StationType;
  updateStationProperty: StationPropertyType;
  updateTaskAssignment: TaskAssignmentType;
  updateTaskProperty: TaskPropertyType;
  updateTicket: TicketType;
  updateTicketTask: TicketTaskType;
  updateWorkZone: WorkZoneType;
  upsertDisasterType: DisasterTypeType;
  upsertStationPropertyConfig: StationPropertyConfigType;
  upsertTaskPropertyConfig: TaskPropertyConfigType;
  upsertTicketPropertyConfig: TicketPropertyConfigType;
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

export type MutationCreateAnnouncementArgs = {
  input: CreateAnnouncementInput;
};

export type MutationCreateBriefingTemplateArgs = {
  input: CreateBriefingTemplateInput;
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

export type MutationDeleteBriefingArgs = {
  uuid: Scalars['UUID']['input'];
};

export type MutationDeleteBriefingTemplateArgs = {
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

export type MutationGenerateBriefingArgs = {
  input: GenerateBriefingInput;
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

export type MutationSetTicketDisasterDetailsArgs = {
  details: Array<TicketDisasterDetailInput>;
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

export type MutationUpdateBriefingArgs = {
  input: UpdateBriefingInput;
  uuid: Scalars['UUID']['input'];
};

export type MutationUpdateBriefingTemplateArgs = {
  input: UpdateBriefingTemplateInput;
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
  briefing?: Maybe<BriefingType>;
  briefingTemplate?: Maybe<BriefingTemplateType>;
  briefingTemplates: Array<BriefingTemplateType>;
  briefings: Array<BriefingType>;
  closureArea?: Maybe<ClosureAreaType>;
  closureAreas: ClosureAreaConnection;
  disasterTypes: Array<DisasterTypeType>;
  station?: Maybe<StationType>;
  stationPropertyConfigs: Array<StationPropertyConfigType>;
  stationSuggestions: Array<StationSuggestionType>;
  stations: StationConnection;
  suggestableFields: Array<SuggestableFieldType>;
  taskProperties: Array<TaskPropertyType>;
  taskPropertyConfigs: Array<TaskPropertyConfigType>;
  ticket?: Maybe<TicketType>;
  ticketPropertyConfigs: Array<TicketPropertyConfigType>;
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
  tag?: InputMaybe<Scalars['String']['input']>;
};

export type QueryClosureAreaArgs = {
  uuid: Scalars['UUID']['input'];
};

export type QueryClosureAreasArgs = {
  bounds?: InputMaybe<BoundsInput>;
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
};

export type QueryDisasterTypesArgs = {
  includeInactive?: Scalars['Boolean']['input'];
};

export type QueryStationArgs = {
  uuid: Scalars['UUID']['input'];
};

export type QueryStationPropertyConfigsArgs = {
  includeInactive?: Scalars['Boolean']['input'];
  stationType: Scalars['String']['input'];
};

export type QueryStationSuggestionsArgs = {
  limit?: Scalars['Int']['input'];
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  targetUuid?: InputMaybe<Scalars['String']['input']>;
};

export type QueryStationsArgs = {
  assignedTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  bounds?: InputMaybe<BoundsInput>;
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
  bounds?: InputMaybe<BoundsInput>;
  limit?: Scalars['Int']['input'];
  priority?: InputMaybe<Scalars['String']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
  skip?: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  zoom?: InputMaybe<Scalars['Float']['input']>;
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

export type SecondaryLocationInput = {
  /** Whether the space can be entered right now */
  accessStatus?: InputMaybe<AccessStatus>;
  alley?: InputMaybe<Scalars['String']['input']>;
  /** 樓棟／區域, e.g. 'A棟'; leave empty if unknown */
  buildingSection?: InputMaybe<Scalars['String']['input']>;
  city?: InputMaybe<Scalars['String']['input']>;
  county?: InputMaybe<Scalars['String']['input']>;
  /** Floor label: 'B1', '1F', 'RF'. Free text on purpose */
  floor?: InputMaybe<Scalars['String']['input']>;
  /** 地標補充 — entrance, landmark, building, which side of the road */
  landmarkNote?: InputMaybe<Scalars['String']['input']>;
  lane?: InputMaybe<Scalars['String']['input']>;
  /** Type of secondary location: 'address' (default) or 'pole' */
  locationType?: Scalars['String']['input'];
  no?: InputMaybe<Scalars['String']['input']>;
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
  alley?: Maybe<Scalars['String']['output']>;
  /** 樓棟／區域, e.g. 'A棟', '東翼' */
  buildingSection?: Maybe<Scalars['String']['output']>;
  city?: Maybe<Scalars['String']['output']>;
  county?: Maybe<Scalars['String']['output']>;
  /** Floor label as spoken: 'B1', '1F', 'RF' — never coerced to a number */
  floor?: Maybe<Scalars['String']['output']>;
  /** UUID of the parent station or ticket this location belongs to */
  geometryUuid: Scalars['String']['output'];
  /** 地標補充 — how to find the entrance when coordinates are not enough */
  landmarkNote?: Maybe<Scalars['String']['output']>;
  lane?: Maybe<Scalars['String']['output']>;
  /** Type of secondary location: 'address' or 'pole' */
  locationType: Scalars['String']['output'];
  no?: Maybe<Scalars['String']['output']>;
  /** Utility pole identifier (only set when location_type is 'pole') */
  poleId?: Maybe<Scalars['String']['output']>;
  /** Additional notes about the pole location */
  poleNote?: Maybe<Scalars['String']['output']>;
  /** Type of utility pole, e.g. '電線桿' (electricity pole), '電話線桿' (telephone pole) */
  poleType?: Maybe<Scalars['String']['output']>;
  /** 房號／空間, e.g. '302', '樓梯間' */
  room?: Maybe<Scalars['String']['output']>;
  /** 空間描述, e.g. '三房兩廳' */
  spaceDescription?: Maybe<Scalars['String']['output']>;
  uuid: Scalars['UUID']['output'];
  /** 求救者所在空間, e.g. '主臥衣櫃' */
  victimSpace?: Maybe<Scalars['String']['output']>;
};

export type StationConnection = {
  __typename?: 'StationConnection';
  items: Array<StationType>;
  pageInfo: PageInfo;
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
  photos: Array<PhotoType>;
  properties: Array<StationPropertyType>;
  /** Internal polymorphic discriminator — always 'station' */
  propertyName: Scalars['String']['output'];
  secondaryLocation?: Maybe<SecondaryLocationType>;
  /** Data source of this record: 'user' or 'official' */
  source?: Maybe<Scalars['String']['output']>;
  /** When operational_status last changed */
  statusChangedAt?: Maybe<Scalars['DateTime']['output']>;
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
  EnRoute: 'en_route',
} as const;

export type TaskAssignmentStatus =
  (typeof TaskAssignmentStatus)[keyof typeof TaskAssignmentStatus];
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

export type TicketConnection = {
  __typename?: 'TicketConnection';
  items: Array<TicketType>;
  pageInfo: PageInfo;
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

export type TicketTaskType = {
  __typename?: 'TicketTaskType';
  assignedCount: Scalars['Int']['output'];
  assignments: Array<TaskAssignmentType>;
  completedCount: Scalars['Int']['output'];
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** UUID of the user who created this task. Null to a caller without ticket.view_detail on the parent ticket */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** Review state: 'pending_review', 'approved', or 'rejected' */
  moderationStatus: Scalars['String']['output'];
  progress?: Maybe<Scalars['Float']['output']>;
  /** Current progress update written by the assignee. Null to a caller without ticket.view_detail on the parent ticket */
  progressNote?: Maybe<Scalars['String']['output']>;
  properties: Array<TaskPropertyType>;
  /** Number of people or units needed — null means unspecified */
  quantity?: Maybe<Scalars['Int']['output']>;
  /** Moderator's notes explaining the review decision. Null to a caller without ticket.view_detail on the parent ticket */
  reviewNote?: Maybe<Scalars['String']['output']>;
  /** Origin of this task: 'user' or 'official' */
  source: Scalars['String']['output'];
  /** Lifecycle state: 'pending', 'in_progress', 'fulfilled', or 'canceled' */
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
  /** UUID of the user who submitted this ticket. Null to a caller without ticket.view_detail here */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** The reporter's own account. Null to a caller without ticket.view_detail here — free text can name a door number the address field withholds */
  description?: Maybe<Scalars['String']['output']>;
  disasterDetails: Array<TicketDisasterDetailType>;
  /** Disaster type keys this ticket is filed under, e.g. ['flood', 'landslide']. Plural because one incident is routinely two disasters at once. Drives which fields `ticketPropertyConfigs` returns for it */
  disasterTypes: Array<Scalars['String']['output']>;
  /** GeoJSON Point indicating where help is needed. To a caller without ticket.view_detail here, the centre of the H3 cell the point falls in — at most resolution 8 (about 1 km across), coarser when `zoom` asks for it */
  geometry?: Maybe<Scalars['GeoJSON']['output']>;
  /** Reporter's answer to 立即生命危險: 'yes', 'no', 'unknown'. Null when nobody was asked — and also null to a caller without ticket.view_pii here. Not a triage grade and not a risk classification */
  immediateDangerReported?: Maybe<Scalars['String']['output']>;
  /** The H3 cell `geometry` stands in for, as its hex index (e.g. '884ba0a511fffff'), when the caller is shown the coarse location; null when `geometry` is the exact point. Tickets sharing a value share a location on the map — group by it, and draw the cell from it (h3-js `cellToBoundary`); its resolution is in the index */
  locationCell?: Maybe<Scalars['String']['output']>;
  /** Reporter's answer to 災民受困／無法自行離開: 'yes', 'no', 'unknown'. Null when nobody was asked — and also null to a caller without ticket.view_pii here. What the person said, not a professional assessment */
  personTrappedReported?: Maybe<Scalars['String']['output']>;
  /** Photos attached to this ticket. Empty to a caller without ticket.view_detail here */
  photos: Array<PhotoType>;
  /** Urgency level: 'low', 'medium', 'high', or 'critical' */
  priority: Scalars['String']['output'];
  /** Internal polymorphic discriminator — always 'request' */
  propertyName: Scalars['String']['output'];
  /** Moderator's notes about the verification decision. Null to a caller without ticket.view_detail here */
  reviewNote?: Maybe<Scalars['String']['output']>;
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
  /** Review state: 'unverified', 'ai_verified', 'human_verified', or 'disputed' */
  verificationStatus?: Maybe<Scalars['String']['output']>;
  /** Who can see this ticket: 'public', 'restricted', or 'internal' */
  visibility?: Maybe<Scalars['String']['output']>;
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
  /** Updated operational status: 'active', 'temporarily_closed', or 'permanently_closed' */
  operationalStatus?: InputMaybe<StationOperationalStatus>;
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
  /** Moderator's review notes — pass null to clear */
  reviewNote?: InputMaybe<Scalars['String']['input']>;
  /** Replace the ticket's street address and space detail, creating it if the ticket was filed without one. A whole-input replacement, not a patch — omitted members are written as null */
  secondaryLocation?: InputMaybe<SecondaryLocationInput>;
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

export const Visibility = {
  Internal: 'internal',
  Public: 'public',
  Restricted: 'restricted',
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];
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
  visibility?: string | null;
  verificationStatus?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
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
  reviewNote?: string | null;
  source: string;
  visibility: string;
  moderationStatus: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  assignments: Array<{
    __typename?: 'TaskAssignmentType';
    uuid: string;
    actorUuid: string;
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
  isDuplicate: boolean;
  isTemporary: boolean;
  isOfficial: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
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
      visibility?: string | null;
      verificationStatus?: string | null;
      contactName?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      createdBy?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
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
        reviewNote?: string | null;
        source: string;
        visibility: string;
        moderationStatus: string;
        createdAt?: string | null;
        updatedAt?: string | null;
        assignments: Array<{
          __typename?: 'TaskAssignmentType';
          uuid: string;
          actorUuid: string;
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
    visibility?: string | null;
    verificationStatus?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      county?: string | null;
      city?: string | null;
      lane?: string | null;
      alley?: string | null;
      no?: string | null;
      floor?: string | null;
      room?: string | null;
      landmarkNote?: string | null;
    } | null;
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
      progressNote?: string | null;
      reviewNote?: string | null;
      source: string;
      visibility: string;
      moderationStatus: string;
      createdAt?: string | null;
      updatedAt?: string | null;
      properties: Array<{
        __typename?: 'TaskPropertyType';
        uuid: string;
        propertyName: string;
        propertyValue: string;
        quantity?: number | null;
        status?: string | null;
        comment?: string | null;
      }>;
      assignments: Array<{
        __typename?: 'TaskAssignmentType';
        uuid: string;
        actorUuid: string;
        role?: string | null;
        status: string;
        assignedAt?: string | null;
        updatedAt?: string | null;
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
    reviewNote?: string | null;
    source: string;
    visibility: string;
    moderationStatus: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    assignments: Array<{
      __typename?: 'TaskAssignmentType';
      uuid: string;
      actorUuid: string;
      role?: string | null;
      status: string;
      assignedAt?: string | null;
      updatedAt?: string | null;
    }>;
  }>;
};

export type AdminStationsQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  stationType?: InputMaybe<Scalars['String']['input']>;
  operationalStatus?: InputMaybe<StationOperationalStatus>;
  q?: InputMaybe<Scalars['String']['input']>;
  assignedTeamUuid?: InputMaybe<Scalars['UUID']['input']>;
  unassignedOnly?: InputMaybe<Scalars['Boolean']['input']>;
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
      isDuplicate: boolean;
      isTemporary: boolean;
      isOfficial: boolean;
      createdBy?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
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

export type AdminStationQueryVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminStationQuery = {
  __typename?: 'Query';
  station?: {
    __typename?: 'StationType';
    contactName?: string | null;
    contactPhone?: string | null;
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
    isDuplicate: boolean;
    isTemporary: boolean;
    isOfficial: boolean;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    secondaryLocation?: {
      __typename?: 'SecondaryLocationType';
      county?: string | null;
      city?: string | null;
      lane?: string | null;
      alley?: string | null;
      no?: string | null;
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

export type AdminAnnouncementsQueryVariables = Exact<{
  filter?: InputMaybe<AnnouncementFilter>;
}>;

export type AdminAnnouncementsQuery = {
  __typename?: 'Query';
  announcements: Array<{
    __typename?: 'AnnouncementType';
    uuid: string;
    content: string;
    active: boolean;
    order?: number | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }>;
};

export type AdminBriefingsQueryVariables = Exact<{
  state?: InputMaybe<BriefingState>;
  tag?: InputMaybe<Scalars['String']['input']>;
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
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
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
    createdBy?: string | null;
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

export type AdminWorkZonesQueryVariables = Exact<{
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type AdminWorkZonesQuery = {
  __typename?: 'Query';
  workZones: {
    __typename?: 'WorkZoneConnection';
    items: Array<{
      __typename?: 'WorkZoneType';
      uuid: string;
      name: string;
      geometry?: Geometry | null;
      createdAt?: string | null;
      updatedAt?: string | null;
      assignedTeams: Array<{
        __typename?: 'AssignedTeamType';
        uuid: string;
        name: string;
        type: string;
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

export type AdminClosureAreasQueryVariables = Exact<{
  bounds?: InputMaybe<BoundsInput>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type AdminClosureAreasQuery = {
  __typename?: 'Query';
  closureAreas: {
    __typename?: 'ClosureAreaConnection';
    items: Array<{
      __typename?: 'ClosureAreaType';
      uuid: string;
      geometry?: Geometry | null;
      status: string;
      informationSource?: string | null;
      comment?: string | null;
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

export type AdminCreateTicketMutationVariables = Exact<{
  input: CreateTicketInput;
}>;

export type AdminCreateTicketMutation = {
  __typename?: 'Mutation';
  createTicket: {
    __typename?: 'TicketType';
    uuid: string;
    title: string;
    description?: string | null;
    geometry?: Geometry | null;
    status: string;
    priority: string;
    taskType?: string | null;
    visibility?: string | null;
    verificationStatus?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
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
    visibility?: string | null;
    verificationStatus?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
};

export type AdminDeleteTicketMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteTicketMutation = {
  __typename?: 'Mutation';
  deleteTicket: boolean;
};

export type AdminReviewTicketMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  verificationStatus: Scalars['String']['input'];
  reviewNote?: InputMaybe<Scalars['String']['input']>;
}>;

export type AdminReviewTicketMutation = {
  __typename?: 'Mutation';
  reviewTicket: {
    __typename?: 'TicketType';
    uuid: string;
    title: string;
    description?: string | null;
    geometry?: Geometry | null;
    status: string;
    priority: string;
    taskType?: string | null;
    visibility?: string | null;
    verificationStatus?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
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
}>;

export type AdminCreateTicketTaskMutation = {
  __typename?: 'Mutation';
  createTicketTask: {
    __typename?: 'TicketTaskType';
    uuid: string;
    ticketUuid: string;
    taskType: string;
    taskName: string;
    taskDescription?: string | null;
    quantity?: number | null;
    status: string;
    progressNote?: string | null;
    reviewNote?: string | null;
    source: string;
    visibility: string;
    moderationStatus: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    assignments: Array<{
      __typename?: 'TaskAssignmentType';
      uuid: string;
      actorUuid: string;
      role?: string | null;
      status: string;
      assignedAt?: string | null;
      updatedAt?: string | null;
    }>;
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
    reviewNote?: string | null;
    source: string;
    visibility: string;
    moderationStatus: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    assignments: Array<{
      __typename?: 'TaskAssignmentType';
      uuid: string;
      actorUuid: string;
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

export type AdminUnassignTaskActorMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminUnassignTaskActorMutation = {
  __typename?: 'Mutation';
  unassignTaskActor: boolean;
};

export type AdminCreateStationMutationVariables = Exact<{
  input: CreateStationInput;
}>;

export type AdminCreateStationMutation = {
  __typename?: 'Mutation';
  createStation: {
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
    isDuplicate: boolean;
    isTemporary: boolean;
    isOfficial: boolean;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    assignedTeam?: {
      __typename?: 'AssignedTeamType';
      uuid: string;
      name: string;
      type: string;
    } | null;
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
    isDuplicate: boolean;
    isTemporary: boolean;
    isOfficial: boolean;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
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
    isDuplicate: boolean;
    isTemporary: boolean;
    isOfficial: boolean;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
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
    isDuplicate: boolean;
    isTemporary: boolean;
    isOfficial: boolean;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
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
    order?: number | null;
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
    order?: number | null;
  };
};

export type AdminDeleteAnnouncementMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteAnnouncementMutation = {
  __typename?: 'Mutation';
  deleteAnnouncement: boolean;
};

export type AdminMoveAnnouncementMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  direction: AnnouncementMoveDirection;
}>;

export type AdminMoveAnnouncementMutation = {
  __typename?: 'Mutation';
  moveAnnouncement: {
    __typename?: 'AnnouncementType';
    uuid: string;
    order?: number | null;
  };
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
    order?: number | null;
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
    content: string;
    tags: Array<string>;
    state: string;
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

export type AdminCreateWorkZoneMutationVariables = Exact<{
  input: CreateWorkZoneInput;
}>;

export type AdminCreateWorkZoneMutation = {
  __typename?: 'Mutation';
  createWorkZone: {
    __typename?: 'WorkZoneType';
    uuid: string;
    name: string;
    geometry?: Geometry | null;
  };
};

export type AdminUpdateWorkZoneMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateWorkZoneInput;
}>;

export type AdminUpdateWorkZoneMutation = {
  __typename?: 'Mutation';
  updateWorkZone: {
    __typename?: 'WorkZoneType';
    uuid: string;
    name: string;
    geometry?: Geometry | null;
  };
};

export type AdminDeleteWorkZoneMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteWorkZoneMutation = {
  __typename?: 'Mutation';
  deleteWorkZone: boolean;
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

export type AdminCreateClosureAreaMutationVariables = Exact<{
  input: CreateClosureAreaInput;
}>;

export type AdminCreateClosureAreaMutation = {
  __typename?: 'Mutation';
  createClosureArea: {
    __typename?: 'ClosureAreaType';
    uuid: string;
    geometry?: Geometry | null;
    status: string;
  };
};

export type AdminUpdateClosureAreaMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
  input: UpdateClosureAreaInput;
}>;

export type AdminUpdateClosureAreaMutation = {
  __typename?: 'Mutation';
  updateClosureArea: {
    __typename?: 'ClosureAreaType';
    uuid: string;
    geometry?: Geometry | null;
    status: string;
  };
};

export type AdminDeleteClosureAreaMutationVariables = Exact<{
  uuid: Scalars['UUID']['input'];
}>;

export type AdminDeleteClosureAreaMutation = {
  __typename?: 'Mutation';
  deleteClosureArea: boolean;
};

export const AdminPageInfoFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminPageInfo' },
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
} as unknown as DocumentNode<AdminPageInfoFragment, unknown>;
export const AdminTicketFieldsFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminTicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AdminTicketFieldsFragment, unknown>;
export const AdminTaskFieldsFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminTaskFields' },
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
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'reviewNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          { kind: 'Field', name: { kind: 'Name', value: 'moderationStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'actorUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'assignedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AdminTaskFieldsFragment, unknown>;
export const AdminStationFieldsFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminStationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'comment' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignedTeam' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AdminStationFieldsFragment, unknown>;
export const AdminTicketsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminTickets' },
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
                        name: { kind: 'Name', value: 'AdminTicketFields' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'tasks' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'FragmentSpread',
                              name: { kind: 'Name', value: 'AdminTaskFields' },
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
                        name: { kind: 'Name', value: 'AdminPageInfo' },
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
      name: { kind: 'Name', value: 'AdminTicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminTaskFields' },
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
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'reviewNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          { kind: 'Field', name: { kind: 'Name', value: 'moderationStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'actorUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'assignedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminPageInfo' },
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
} as unknown as DocumentNode<AdminTicketsQuery, AdminTicketsQueryVariables>;
export const AdminTicketDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminTicket' },
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
                  name: { kind: 'Name', value: 'AdminTicketFields' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'secondaryLocation' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'county' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lane' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'alley' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'no' } },
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
                        name: { kind: 'Name', value: 'AdminTaskFields' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'properties' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'uuid' },
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
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'disasterDetails' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'propertyName' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'value' } },
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
      name: { kind: 'Name', value: 'AdminTicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminTaskFields' },
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
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'reviewNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          { kind: 'Field', name: { kind: 'Name', value: 'moderationStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'actorUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'assignedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AdminTicketQuery, AdminTicketQueryVariables>;
export const AdminTicketTasksDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminTicketTasks' },
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
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'AdminTaskFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminTaskFields' },
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
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'reviewNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          { kind: 'Field', name: { kind: 'Name', value: 'moderationStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'actorUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'assignedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminTicketTasksQuery,
  AdminTicketTasksQueryVariables
>;
export const AdminStationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminStations' },
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
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'operationalStatus' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'StationOperationalStatus' },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'q' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'assignedTeamUuid' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'unassignedOnly' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
          defaultValue: { kind: 'BooleanValue', value: false },
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
                name: { kind: 'Name', value: 'operationalStatus' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'operationalStatus' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'q' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'q' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'assignedTeamUuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'assignedTeamUuid' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'unassignedOnly' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'unassignedOnly' },
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
                        name: { kind: 'Name', value: 'AdminStationFields' },
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
                        name: { kind: 'Name', value: 'AdminPageInfo' },
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
      name: { kind: 'Name', value: 'AdminStationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'comment' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignedTeam' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminPageInfo' },
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
} as unknown as DocumentNode<AdminStationsQuery, AdminStationsQueryVariables>;
export const AdminStationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminStation' },
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
                  name: { kind: 'Name', value: 'AdminStationFields' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
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
                        name: { kind: 'Name', value: 'county' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'city' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'lane' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'alley' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'no' } },
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
                  name: { kind: 'Name', value: 'properties' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
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
      name: { kind: 'Name', value: 'AdminStationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'comment' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignedTeam' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AdminStationQuery, AdminStationQueryVariables>;
export const AdminAnnouncementsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminAnnouncements' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'filter' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'AnnouncementFilter' },
          },
          defaultValue: { kind: 'EnumValue', value: 'ALL' },
        },
      ],
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
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'filter' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'active' } },
                { kind: 'Field', name: { kind: 'Name', value: 'order' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminAnnouncementsQuery,
  AdminAnnouncementsQueryVariables
>;
export const AdminBriefingsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminBriefings' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'state' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'BriefingState' },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'tag' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
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
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'state' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'tag' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'tag' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'templateUuid' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'tags' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AdminBriefingsQuery, AdminBriefingsQueryVariables>;
export const AdminBriefingTemplatesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminBriefingTemplates' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'state' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'BriefingState' },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'tag' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'briefingTemplates' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'state' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'state' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'tag' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'tag' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'tags' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminBriefingTemplatesQuery,
  AdminBriefingTemplatesQueryVariables
>;
export const AdminStationPropertyConfigsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminStationPropertyConfigs' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'stationType' },
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
            name: { kind: 'Name', value: 'includeInactive' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
          defaultValue: { kind: 'BooleanValue', value: true },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'stationPropertyConfigs' },
            arguments: [
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
                name: { kind: 'Name', value: 'includeInactive' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'includeInactive' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'stationType' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyName' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'dataType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'enumOptions' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'displayLabel' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'sortOrder' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isActive' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminStationPropertyConfigsQuery,
  AdminStationPropertyConfigsQueryVariables
>;
export const AdminTaskPropertyConfigsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminTaskPropertyConfigs' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'taskType' },
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
            name: { kind: 'Name', value: 'includeInactive' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
          defaultValue: { kind: 'BooleanValue', value: true },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'taskPropertyConfigs' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'taskType' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'taskType' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'includeInactive' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'includeInactive' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyName' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'dataType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'enumOptions' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unit' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'disasterTypes' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'displayLabel' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'sortOrder' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isActive' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminTaskPropertyConfigsQuery,
  AdminTaskPropertyConfigsQueryVariables
>;
export const AdminTicketPropertyConfigsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminTicketPropertyConfigs' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'disasterTypes' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: {
                  kind: 'NamedType',
                  name: { kind: 'Name', value: 'String' },
                },
              },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'includeInactive' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
          defaultValue: { kind: 'BooleanValue', value: true },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ticketPropertyConfigs' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'disasterTypes' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'disasterTypes' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'includeInactive' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'includeInactive' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyName' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'dataType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'enumOptions' } },
                { kind: 'Field', name: { kind: 'Name', value: 'unit' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'disasterTypes' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'displayLabel' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'hint' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isActive' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminTicketPropertyConfigsQuery,
  AdminTicketPropertyConfigsQueryVariables
>;
export const AdminDisasterTypesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminDisasterTypes' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'includeInactive' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
          defaultValue: { kind: 'BooleanValue', value: true },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'disasterTypes' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'includeInactive' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'includeInactive' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'key' } },
                { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isActive' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminDisasterTypesQuery,
  AdminDisasterTypesQueryVariables
>;
export const AdminWorkZonesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminWorkZones' },
      variableDefinitions: [
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
            name: { kind: 'Name', value: 'workZones' },
            arguments: [
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
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'geometry' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'createdAt' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'updatedAt' },
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
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'type' },
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
                        name: { kind: 'Name', value: 'AdminPageInfo' },
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
      name: { kind: 'Name', value: 'AdminPageInfo' },
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
} as unknown as DocumentNode<AdminWorkZonesQuery, AdminWorkZonesQueryVariables>;
export const AdminClosureAreasDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'AdminClosureAreas' },
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
            name: { kind: 'Name', value: 'closureAreas' },
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
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'geometry' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'status' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'informationSource' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'comment' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'createdAt' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'updatedAt' },
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
                        name: { kind: 'Name', value: 'AdminPageInfo' },
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
      name: { kind: 'Name', value: 'AdminPageInfo' },
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
} as unknown as DocumentNode<
  AdminClosureAreasQuery,
  AdminClosureAreasQueryVariables
>;
export const AdminCreateTicketDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminCreateTicket' },
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
              name: { kind: 'Name', value: 'CreateTicketInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createTicket' },
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
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'AdminTicketFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminTicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminCreateTicketMutation,
  AdminCreateTicketMutationVariables
>;
export const AdminUpdateTicketDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateTicket' },
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
                  name: { kind: 'Name', value: 'AdminTicketFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminTicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateTicketMutation,
  AdminUpdateTicketMutationVariables
>;
export const AdminDeleteTicketDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminDeleteTicket' },
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
  AdminDeleteTicketMutation,
  AdminDeleteTicketMutationVariables
>;
export const AdminReviewTicketDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminReviewTicket' },
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
            name: { kind: 'Name', value: 'verificationStatus' },
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
            name: { kind: 'Name', value: 'reviewNote' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'reviewTicket' },
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
                name: { kind: 'Name', value: 'verificationStatus' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'verificationStatus' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'reviewNote' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'reviewNote' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'AdminTicketFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminTicketFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'TicketType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'status' } },
          { kind: 'Field', name: { kind: 'Name', value: 'priority' } },
          { kind: 'Field', name: { kind: 'Name', value: 'taskType' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'contactName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactEmail' } },
          { kind: 'Field', name: { kind: 'Name', value: 'contactPhone' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminReviewTicketMutation,
  AdminReviewTicketMutationVariables
>;
export const AdminSetTicketDisasterDetailsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminSetTicketDisasterDetails' },
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
            name: { kind: 'Name', value: 'details' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: {
                  kind: 'NamedType',
                  name: { kind: 'Name', value: 'TicketDisasterDetailInput' },
                },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setTicketDisasterDetails' },
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
                name: { kind: 'Name', value: 'details' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'details' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyName' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'value' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminSetTicketDisasterDetailsMutation,
  AdminSetTicketDisasterDetailsMutationVariables
>;
export const AdminCreateTicketTaskDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminCreateTicketTask' },
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
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'AdminTaskFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminTaskFields' },
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
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'reviewNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          { kind: 'Field', name: { kind: 'Name', value: 'moderationStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'actorUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'assignedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminCreateTicketTaskMutation,
  AdminCreateTicketTaskMutationVariables
>;
export const AdminUpdateTicketTaskDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateTicketTask' },
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
                  name: { kind: 'Name', value: 'AdminTaskFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminTaskFields' },
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
          { kind: 'Field', name: { kind: 'Name', value: 'progressNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'reviewNote' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          { kind: 'Field', name: { kind: 'Name', value: 'moderationStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignments' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'actorUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'assignedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateTicketTaskMutation,
  AdminUpdateTicketTaskMutationVariables
>;
export const AdminAssignTaskActorDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminAssignTaskActor' },
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
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'actorUuid' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'role' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
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
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'actorUuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'actorUuid' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'role' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'role' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'taskUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'actorUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'assignedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminAssignTaskActorMutation,
  AdminAssignTaskActorMutationVariables
>;
export const AdminUpdateTaskAssignmentDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateTaskAssignment' },
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
              name: { kind: 'Name', value: 'UpdateTaskAssignmentInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateTaskAssignment' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'taskUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'actorUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateTaskAssignmentMutation,
  AdminUpdateTaskAssignmentMutationVariables
>;
export const AdminUnassignTaskActorDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUnassignTaskActor' },
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
  AdminUnassignTaskActorMutation,
  AdminUnassignTaskActorMutationVariables
>;
export const AdminCreateStationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminCreateStation' },
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
              name: { kind: 'Name', value: 'CreateStationInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createStation' },
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
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'AdminStationFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminStationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'comment' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignedTeam' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminCreateStationMutation,
  AdminCreateStationMutationVariables
>;
export const AdminUpdateStationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateStation' },
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
                  name: { kind: 'Name', value: 'AdminStationFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminStationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'comment' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignedTeam' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateStationMutation,
  AdminUpdateStationMutationVariables
>;
export const AdminDeleteStationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminDeleteStation' },
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
  AdminDeleteStationMutation,
  AdminDeleteStationMutationVariables
>;
export const AdminAssignStationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminAssignStation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'stationUuid' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'teamUuid' },
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
            name: { kind: 'Name', value: 'assignStationToTeam' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'stationUuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'stationUuid' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'teamUuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'teamUuid' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'AdminStationFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminStationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'comment' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignedTeam' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminAssignStationMutation,
  AdminAssignStationMutationVariables
>;
export const AdminUnassignStationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUnassignStation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'stationUuid' },
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
            name: { kind: 'Name', value: 'unassignStation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'stationUuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'stationUuid' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'AdminStationFields' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'AdminStationFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StationType' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
          { kind: 'Field', name: { kind: 'Name', value: 'type' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'description' } },
          { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
          { kind: 'Field', name: { kind: 'Name', value: 'opHour' } },
          { kind: 'Field', name: { kind: 'Name', value: 'level' } },
          { kind: 'Field', name: { kind: 'Name', value: 'comment' } },
          { kind: 'Field', name: { kind: 'Name', value: 'source' } },
          { kind: 'Field', name: { kind: 'Name', value: 'visibility' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verificationStatus' },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'operationalStatus' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isDuplicate' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTemporary' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isOfficial' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdBy' } },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignedTeam' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUnassignStationMutation,
  AdminUnassignStationMutationVariables
>;
export const AdminAttachStationPhotoDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminAttachStationPhoto' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'stationUuid' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UUID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'url' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'attachStationPhoto' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'stationUuid' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'stationUuid' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'url' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'url' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminAttachStationPhotoMutation,
  AdminAttachStationPhotoMutationVariables
>;
export const AdminDetachStationPhotoDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminDetachStationPhoto' },
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
            name: { kind: 'Name', value: 'detachStationPhoto' },
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
  AdminDetachStationPhotoMutation,
  AdminDetachStationPhotoMutationVariables
>;
export const AdminCreateStationPropertyDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminCreateStationProperty' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'comment' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminCreateStationPropertyMutation,
  AdminCreateStationPropertyMutationVariables
>;
export const AdminUpdateStationPropertyDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateStationProperty' },
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
              name: { kind: 'Name', value: 'UpdateStationPropertyInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateStationProperty' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'comment' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateStationPropertyMutation,
  AdminUpdateStationPropertyMutationVariables
>;
export const AdminCreateTaskPropertyDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminCreateTaskProperty' },
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
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminCreateTaskPropertyMutation,
  AdminCreateTaskPropertyMutationVariables
>;
export const AdminUpdateTaskPropertyDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateTaskProperty' },
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
              name: { kind: 'Name', value: 'UpdateTaskPropertyInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateTaskProperty' },
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
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateTaskPropertyMutation,
  AdminUpdateTaskPropertyMutationVariables
>;
export const AdminCreateAnnouncementDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminCreateAnnouncement' },
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
              name: { kind: 'Name', value: 'CreateAnnouncementInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createAnnouncement' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'active' } },
                { kind: 'Field', name: { kind: 'Name', value: 'order' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminCreateAnnouncementMutation,
  AdminCreateAnnouncementMutationVariables
>;
export const AdminUpdateAnnouncementDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateAnnouncement' },
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
              name: { kind: 'Name', value: 'UpdateAnnouncementInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateAnnouncement' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'active' } },
                { kind: 'Field', name: { kind: 'Name', value: 'order' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateAnnouncementMutation,
  AdminUpdateAnnouncementMutationVariables
>;
export const AdminDeleteAnnouncementDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminDeleteAnnouncement' },
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
            name: { kind: 'Name', value: 'deleteAnnouncement' },
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
  AdminDeleteAnnouncementMutation,
  AdminDeleteAnnouncementMutationVariables
>;
export const AdminMoveAnnouncementDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminMoveAnnouncement' },
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
            name: { kind: 'Name', value: 'direction' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'AnnouncementMoveDirection' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'moveAnnouncement' },
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
                name: { kind: 'Name', value: 'direction' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'direction' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'order' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminMoveAnnouncementMutation,
  AdminMoveAnnouncementMutationVariables
>;
export const AdminSetAnnouncementActiveDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminSetAnnouncementActive' },
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
            name: { kind: 'Name', value: 'active' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'Boolean' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setAnnouncementActive' },
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
                name: { kind: 'Name', value: 'active' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'active' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'active' } },
                { kind: 'Field', name: { kind: 'Name', value: 'order' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminSetAnnouncementActiveMutation,
  AdminSetAnnouncementActiveMutationVariables
>;
export const AdminGenerateBriefingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminGenerateBriefing' },
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
              name: { kind: 'Name', value: 'GenerateBriefingInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'generateBriefing' },
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
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'templateUuid' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'tags' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminGenerateBriefingMutation,
  AdminGenerateBriefingMutationVariables
>;
export const AdminUpdateBriefingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateBriefing' },
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
              name: { kind: 'Name', value: 'UpdateBriefingInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateBriefing' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'tags' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateBriefingMutation,
  AdminUpdateBriefingMutationVariables
>;
export const AdminDeleteBriefingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminDeleteBriefing' },
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
            name: { kind: 'Name', value: 'deleteBriefing' },
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
  AdminDeleteBriefingMutation,
  AdminDeleteBriefingMutationVariables
>;
export const AdminCreateBriefingTemplateDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminCreateBriefingTemplate' },
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
              name: { kind: 'Name', value: 'CreateBriefingTemplateInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createBriefingTemplate' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'tags' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminCreateBriefingTemplateMutation,
  AdminCreateBriefingTemplateMutationVariables
>;
export const AdminUpdateBriefingTemplateDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateBriefingTemplate' },
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
              name: { kind: 'Name', value: 'UpdateBriefingTemplateInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateBriefingTemplate' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'tags' } },
                { kind: 'Field', name: { kind: 'Name', value: 'state' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateBriefingTemplateMutation,
  AdminUpdateBriefingTemplateMutationVariables
>;
export const AdminDeleteBriefingTemplateDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminDeleteBriefingTemplate' },
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
            name: { kind: 'Name', value: 'deleteBriefingTemplate' },
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
  AdminDeleteBriefingTemplateMutation,
  AdminDeleteBriefingTemplateMutationVariables
>;
export const AdminUpsertStationPropertyConfigDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpsertStationPropertyConfig' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'stationType' },
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
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpsertPropertyConfigInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'upsertStationPropertyConfig' },
            arguments: [
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
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyName' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpsertStationPropertyConfigMutation,
  AdminUpsertStationPropertyConfigMutationVariables
>;
export const AdminUpsertTaskPropertyConfigDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpsertTaskPropertyConfig' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'taskType' },
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
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpsertPropertyConfigInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'upsertTaskPropertyConfig' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'taskType' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'taskType' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyName' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpsertTaskPropertyConfigMutation,
  AdminUpsertTaskPropertyConfigMutationVariables
>;
export const AdminUpsertTicketPropertyConfigDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpsertTicketPropertyConfig' },
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
              name: { kind: 'Name', value: 'UpsertTicketPropertyConfigInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'upsertTicketPropertyConfig' },
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
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'propertyName' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpsertTicketPropertyConfigMutation,
  AdminUpsertTicketPropertyConfigMutationVariables
>;
export const AdminUpsertDisasterTypeDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpsertDisasterType' },
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
              name: { kind: 'Name', value: 'UpsertDisasterTypeInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'upsertDisasterType' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'key' } },
                { kind: 'Field', name: { kind: 'Name', value: 'label' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpsertDisasterTypeMutation,
  AdminUpsertDisasterTypeMutationVariables
>;
export const AdminCreateWorkZoneDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminCreateWorkZone' },
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
              name: { kind: 'Name', value: 'CreateWorkZoneInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createWorkZone' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminCreateWorkZoneMutation,
  AdminCreateWorkZoneMutationVariables
>;
export const AdminUpdateWorkZoneDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateWorkZone' },
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
              name: { kind: 'Name', value: 'UpdateWorkZoneInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateWorkZone' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateWorkZoneMutation,
  AdminUpdateWorkZoneMutationVariables
>;
export const AdminDeleteWorkZoneDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminDeleteWorkZone' },
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
            name: { kind: 'Name', value: 'deleteWorkZone' },
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
  AdminDeleteWorkZoneMutation,
  AdminDeleteWorkZoneMutationVariables
>;
export const AdminAssignZoneToTeamDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminAssignZoneToTeam' },
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
              name: { kind: 'Name', value: 'ZoneTeamAssignmentInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'assignZoneToTeam' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'zoneUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'teamUuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'assignedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminAssignZoneToTeamMutation,
  AdminAssignZoneToTeamMutationVariables
>;
export const AdminRemoveZoneFromTeamDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminRemoveZoneFromTeam' },
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
              name: { kind: 'Name', value: 'ZoneTeamAssignmentInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'removeZoneFromTeam' },
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
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminRemoveZoneFromTeamMutation,
  AdminRemoveZoneFromTeamMutationVariables
>;
export const AdminCreateClosureAreaDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminCreateClosureArea' },
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
              name: { kind: 'Name', value: 'CreateClosureAreaInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createClosureArea' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminCreateClosureAreaMutation,
  AdminCreateClosureAreaMutationVariables
>;
export const AdminUpdateClosureAreaDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminUpdateClosureArea' },
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
              name: { kind: 'Name', value: 'UpdateClosureAreaInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateClosureArea' },
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
                { kind: 'Field', name: { kind: 'Name', value: 'uuid' } },
                { kind: 'Field', name: { kind: 'Name', value: 'geometry' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AdminUpdateClosureAreaMutation,
  AdminUpdateClosureAreaMutationVariables
>;
export const AdminDeleteClosureAreaDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AdminDeleteClosureArea' },
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
            name: { kind: 'Name', value: 'deleteClosureArea' },
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
  AdminDeleteClosureAreaMutation,
  AdminDeleteClosureAreaMutationVariables
>;
