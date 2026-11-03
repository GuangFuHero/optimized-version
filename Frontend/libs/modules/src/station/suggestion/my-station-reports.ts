/**
 * 我回報的站點: the suggestions the viewer sent, as the drawer shows them (prototype
 * `Design/前台/js/site/site-actions.jsx`, `StationReportsDrawer`).
 */

import type { MyStationSuggestionsQuery } from '@rescue-frontend/data-access';

import {
  createSiteHref,
  SITE_FALLBACK_DATA_TYPE,
  type SiteModule,
  type SiteRouteState,
} from '../../route';
import { timeAgo } from '../../time';
import {
  describeSuggestionValue,
  STATION_SUGGESTION_FIELDS,
  type StationSuggestionField,
} from './fields';

type SuggestionRow = MyStationSuggestionsQuery['myStationSuggestions'][number];

/**
 * A card answers one thing: how the viewer's report came out, not what the station became after.
 * The backend's six statuses read as three. Approved, adopted with the reviewer's own wording, and
 * revoked all read 已採用: the report was taken, and a value put back later is the station's
 * business, which 看這個站點 shows. Rejected and not adopted (another person's value was taken)
 * both read 未採用: in the second case the station changed anyway, and the station shows it.
 */
export type StationReportOutcome = 'pending' | 'adopted' | 'not-adopted';

const OUTCOMES: Partial<Record<string, StationReportOutcome>> = {
  pending: 'pending',
  approved: 'adopted',
  adopted_edited: 'adopted',
  revoked: 'adopted',
  rejected: 'not-adopted',
  not_adopted: 'not-adopted',
};

export const STATION_REPORT_OUTCOME_LOOKS: Record<
  StationReportOutcome,
  { label: string; tone: 'warning' | 'success' | 'neutral' }
> = {
  pending: { label: '等待審核', tone: 'warning' },
  adopted: { label: '已採用', tone: 'success' },
  'not-adopted': { label: '未採用', tone: 'neutral' },
};

/**
 * A status the site does not know yet reads as still waiting, rather than as a result nobody
 * gave.
 */
export function stationReportOutcome(status: string): StationReportOutcome {
  return OUTCOMES[status] ?? 'pending';
}

// A station property's fields: the backend takes them, the site's form does not offer them. Named
// as the backend's notices name them.
const PROPERTY_FIELD_LABELS: Partial<Record<string, string>> = {
  property_name: '項目名稱',
  quantity: '數量',
};

function suggestionField(name: string): StationSuggestionField | null {
  return STATION_SUGGESTION_FIELDS.find((field) => field.name === name) ?? null;
}

function describeValue(
  field: StationSuggestionField | null,
  value: string,
): string {
  if (field) {
    return describeSuggestionValue(field, value);
  }

  return value.trim() || '未提供';
}

export interface StationReport {
  uuid: string;
  /** Null once the station is gone or out of the viewer's view: no link then. */
  stationUuid: string | null;
  /** The station's name, or what to say in its place once it is gone. */
  stationName: string;
  fieldLabel: string;
  /**
   * The field's value when the report was sent, as the form shows values. Null when the backend has
   * none on record: the card then shows the suggested value alone, with no arrow.
   */
  previous: string | null;
  suggested: string;
  comment: string | null;
  outcome: StationReportOutcome;
  /** 「3 天前送出」, or null for a time that cannot be read. */
  sentAgo: string | null;
}

export function readMyStationReports(
  rows: readonly SuggestionRow[],
  now: Date = new Date(),
): StationReport[] {
  return rows.map((row) => {
    const field = suggestionField(row.fieldName);
    const ago = timeAgo(row.submittedAt, now);

    return {
      uuid: row.uuid,
      stationUuid: row.station?.uuid ?? null,
      stationName: row.station?.name?.trim() || '這個站點已經下架',
      fieldLabel:
        field?.label ?? PROPERTY_FIELD_LABELS[row.fieldName] ?? row.fieldName,
      previous:
        row.previousValue == null
          ? null
          : describeValue(field, row.previousValue),
      suggested: describeValue(field, row.newValue),
      comment: row.comment?.trim() || null,
      outcome: stationReportOutcome(row.status),
      sentAgo: ago ? `${ago}送出` : null,
    };
  });
}

/**
 * Where 看這個站點 takes the viewer: the station on the list, whose drawer opens even when the
 * station is past the pages loaded, as 我的任務's 查看 does for a ticket.
 */
export function reportedStationHref(stationUuid: string): string {
  return createSiteHref('list', {
    dataType: 'station',
    selectedMarkerId: stationUuid,
  });
}

/**
 * On the station list already, the station is selected in place, with the list's filters kept: a
 * link differing only in `?id=` would leave the drawer shut (`SiteRouteProvider` rereads the
 * address only when its path changes).
 */
export function openReportedStation(
  current: { module: SiteModule; state: SiteRouteState },
  stationUuid: string,
): { select: SiteRouteState } | { href: string } {
  const onStationList =
    current.module === 'list' &&
    (current.state.dataType ?? SITE_FALLBACK_DATA_TYPE) === 'station';

  return onStationList
    ? { select: { ...current.state, selectedMarkerId: stationUuid } }
    : { href: reportedStationHref(stationUuid) };
}
