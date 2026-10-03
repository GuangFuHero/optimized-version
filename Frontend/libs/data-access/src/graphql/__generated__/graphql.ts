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

export const AccessStatus = {
  Accessible: 'accessible',
  Inaccessible: 'inaccessible',
  Restricted: 'restricted',
  Unknown: 'unknown'
} as const;

export type AccessStatus = typeof AccessStatus[keyof typeof AccessStatus];
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

export const BriefingState = {
  Briefing: 'BRIEFING',
  Debrief: 'DEBRIEF',
  InField: 'IN_FIELD'
} as const;

export type BriefingState = typeof BriefingState[keyof typeof BriefingState];
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
  Text: 'text'
} as const;

export type FieldDataType = typeof FieldDataType[keyof typeof FieldDataType];
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
  bounds?: InputMaybe<BoundsInput>;
  limit?: Scalars['Int']['input'];
  operationalStatus?: InputMaybe<StationOperationalStatus>;
  q?: InputMaybe<Scalars['String']['input']>;
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
  TemporarilyClosed: 'temporarily_closed'
} as const;

export type StationOperationalStatus = typeof StationOperationalStatus[keyof typeof StationOperationalStatus];
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
  Pending: 'pending'
} as const;

export type TaskPropertyStatus = typeof TaskPropertyStatus[keyof typeof TaskPropertyStatus];
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
  Yes: 'yes'
} as const;

export type TriState = typeof TriState[keyof typeof TriState];
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

export type PageInfoFieldsFragment = { __typename?: 'PageInfo', totalCount: number, hasNextPage: boolean, hasPreviousPage: boolean } & { ' $fragmentName'?: 'PageInfoFieldsFragment' };

export type StationFieldsFragment = { __typename?: 'StationType', uuid: string, propertyName: string, geometry?: Geometry | null, type?: string | null, name?: string | null, description?: string | null, opHour?: string | null, level: number, comment?: string | null, source?: string | null, visibility?: string | null, verificationStatus?: string | null, isDuplicate: boolean, isTemporary: boolean, isOfficial: boolean, createdBy?: string | null, createdAt?: any | null, updatedAt?: any | null } & { ' $fragmentName'?: 'StationFieldsFragment' };

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
    { __typename?: 'StationType', secondaryLocation?: { __typename?: 'SecondaryLocationType', uuid: string, locationType: string, county?: string | null, city?: string | null, lane?: string | null, alley?: string | null, no?: string | null, floor?: string | null, room?: string | null, poleId?: string | null, poleType?: string | null, poleNote?: string | null } | null, properties: Array<{ __typename?: 'StationPropertyType', uuid: string, stationUuid: string, propertyType: string, propertyName: string, quantity?: number | null, comment?: string | null, status: string, weightings: number, createdBy?: string | null, createdAt?: any | null }> }
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
export const StationFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"StationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StationType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"opHour"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"isDuplicate"}},{"kind":"Field","name":{"kind":"Name","value":"isTemporary"}},{"kind":"Field","name":{"kind":"Name","value":"isOfficial"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<StationFieldsFragment, unknown>;
export const ClosureAreaFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ClosureAreaFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ClosureAreaType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"informationSource"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<ClosureAreaFieldsFragment, unknown>;
export const TicketFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"contactName"}},{"kind":"Field","name":{"kind":"Name","value":"contactEmail"}},{"kind":"Field","name":{"kind":"Name","value":"contactPhone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"priority"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<TicketFieldsFragment, unknown>;
export const TicketTaskFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TicketTaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TicketTaskType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"ticketUuid"}},{"kind":"Field","name":{"kind":"Name","value":"taskType"}},{"kind":"Field","name":{"kind":"Name","value":"taskName"}},{"kind":"Field","name":{"kind":"Name","value":"taskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"progressNote"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"moderationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"reviewNote"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<TicketTaskFieldsFragment, unknown>;
export const GetStationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetStations"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"bounds"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"BoundsInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"stationType"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"skip"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"50"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"stations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"bounds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"bounds"}}},{"kind":"Argument","name":{"kind":"Name","value":"stationType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"stationType"}}},{"kind":"Argument","name":{"kind":"Name","value":"skip"},"value":{"kind":"Variable","name":{"kind":"Name","value":"skip"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"StationFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PageInfoFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PageInfoFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PageInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"StationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StationType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"opHour"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"isDuplicate"}},{"kind":"Field","name":{"kind":"Name","value":"isTemporary"}},{"kind":"Field","name":{"kind":"Name","value":"isOfficial"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetStationsQuery, GetStationsQueryVariables>;
export const GetStationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetStation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"station"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"StationFields"}},{"kind":"Field","name":{"kind":"Name","value":"secondaryLocation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"locationType"}},{"kind":"Field","name":{"kind":"Name","value":"county"}},{"kind":"Field","name":{"kind":"Name","value":"city"}},{"kind":"Field","name":{"kind":"Name","value":"lane"}},{"kind":"Field","name":{"kind":"Name","value":"alley"}},{"kind":"Field","name":{"kind":"Name","value":"no"}},{"kind":"Field","name":{"kind":"Name","value":"floor"}},{"kind":"Field","name":{"kind":"Name","value":"room"}},{"kind":"Field","name":{"kind":"Name","value":"poleId"}},{"kind":"Field","name":{"kind":"Name","value":"poleType"}},{"kind":"Field","name":{"kind":"Name","value":"poleNote"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"stationUuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyType"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"weightings"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"StationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StationType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"opHour"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"isDuplicate"}},{"kind":"Field","name":{"kind":"Name","value":"isTemporary"}},{"kind":"Field","name":{"kind":"Name","value":"isOfficial"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetStationQuery, GetStationQueryVariables>;
export const GetClosureAreasDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetClosureAreas"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"bounds"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"BoundsInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"skip"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"50"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"closureAreas"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"bounds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"bounds"}}},{"kind":"Argument","name":{"kind":"Name","value":"skip"},"value":{"kind":"Variable","name":{"kind":"Name","value":"skip"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ClosureAreaFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PageInfoFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PageInfoFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PageInfo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ClosureAreaFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ClosureAreaType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"informationSource"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetClosureAreasQuery, GetClosureAreasQueryVariables>;
export const GetClosureAreaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetClosureArea"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"closureArea"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ClosureAreaFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ClosureAreaFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ClosureAreaType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"informationSource"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<GetClosureAreaQuery, GetClosureAreaQueryVariables>;
export const CreateStationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateStation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateStationInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createStation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"StationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"StationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StationType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"opHour"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"isDuplicate"}},{"kind":"Field","name":{"kind":"Name","value":"isTemporary"}},{"kind":"Field","name":{"kind":"Name","value":"isOfficial"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CreateStationMutation, CreateStationMutationVariables>;
export const UpdateStationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateStation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateStationInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateStation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"StationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"StationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"StationType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"propertyName"}},{"kind":"Field","name":{"kind":"Name","value":"geometry"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"opHour"}},{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"verificationStatus"}},{"kind":"Field","name":{"kind":"Name","value":"isDuplicate"}},{"kind":"Field","name":{"kind":"Name","value":"isTemporary"}},{"kind":"Field","name":{"kind":"Name","value":"isOfficial"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateStationMutation, UpdateStationMutationVariables>;
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