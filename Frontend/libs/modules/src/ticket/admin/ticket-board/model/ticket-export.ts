import type { components } from '@rescue-frontend/data-access/openapi';

import { taiwanDateParts } from '../../../../time';
import { UNASSIGNED_TEAM } from './ticket-filters';
import { needTypeLabel, type NeedType } from './ticket-row';

/** 全部種類: every need type in one file, with the fixed columns only (no type's own fields). */
export const ALL_NEED_TYPES = 'all';

/** What 匯出 can export: one need type, or 全部種類. */
export type ExportType = NeedType | typeof ALL_NEED_TYPES;

/** 全部組織: no 組織分配, every ticket in the caller's scope. */
export const ALL_TEAMS = 'all';

/** 哪個組織: ALL_TEAMS, a team's uuid (its 責任區), or UNASSIGNED_TEAM (in nobody's). */
export type ExportOrg = string;

/** A team 哪個組織 can name: the filter panel's 組織分配 teams. */
export interface ExportTeam {
  uuid: string;
  name: string;
}

/** The prototype's three kinds, in its order; 醫療 (not in the prototype) joins only once it has rows. */
const LISTED_TYPES: NeedType[] = ['rescue', 'hr', 'supply'];

/**
 * 匯出哪一種需求's choices, the default first (BK-8b). With the board's 需求 filter on a type, that
 * type leads and 全部種類 goes last; otherwise 全部種類 leads. 醫療 is listed once it has rows, or
 * when the board is filtered to it.
 */
export function exportTypeOrder(
  boardType: string | null,
  hasMedical: boolean,
): ExportType[] {
  const listed: NeedType[] =
    hasMedical || boardType === 'medical'
      ? [...LISTED_TYPES, 'medical']
      : LISTED_TYPES;
  const lead = listed.find((type) => type === boardType);
  return lead
    ? [lead, ...listed.filter((type) => type !== lead), ALL_NEED_TYPES]
    : [ALL_NEED_TYPES, ...listed];
}

export function exportTypeLabel(type: ExportType): string {
  return type === ALL_NEED_TYPES ? '全部種類' : needTypeLabel(type);
}

/** 哪個組織's choices, as the board's 組織分配 lists them, between 全部組織 and 未指派. */
export function exportOrgOptions(
  teams: readonly ExportTeam[],
): [value: ExportOrg, label: string][] {
  return [
    [ALL_TEAMS, '全部組織'],
    ...teams.map((team): [string, string] => [team.uuid, team.name]),
    [UNASSIGNED_TEAM, '未指派'],
  ];
}

/** The board's 組織分配 choice as 哪個組織's (none is 全部組織). */
export function exportOrgOf(boardTeam: string | null): ExportOrg {
  return boardTeam ?? ALL_TEAMS;
}

/** What the note, the file name and the toast call the organisation; null for a team not loaded yet. */
export function exportOrgLabel(
  org: ExportOrg,
  teams: readonly ExportTeam[],
): string | null {
  if (org === ALL_TEAMS) return '全部組織';
  if (org === UNASSIGNED_TEAM) return '未指派';
  return teams.find((team) => team.uuid === org)?.name ?? null;
}

/** 哪個組織 as the export's and the counts' query parameters. */
export function exportScopeParams(org: ExportOrg): {
  responsible_team_uuid?: string;
  unassigned_only?: boolean;
} {
  if (org === ALL_TEAMS) return {};
  if (org === UNASSIGNED_TEAM) return { unassigned_only: true };
  return { responsible_team_uuid: org };
}

/** Characters a file name cannot hold on Windows or macOS, as a team name might. */
const UNSAFE_FILENAME = /[\\/:*?"<>|]/g;

/**
 * The prototype's name (tk-import.jsx): 任務單_{type}[_{organisation}]_{yyyymmdd-HHmm}_{n}筆, in
 * Taipei time, as the station export stamps its files. The organisation is left out for 全部組織
 * (`orgLabel` null). The count says on paper how many rows the file holds.
 */
export function ticketExportFilename(
  taskType: ExportType,
  format: 'csv' | 'xlsx',
  now: Date,
  orgLabel: string | null,
  count: number,
): string {
  const { year, month, day, hour, minute } = taiwanDateParts(now);
  const parts = [
    '任務單',
    exportTypeLabel(taskType),
    ...(orgLabel ? [orgLabel.replace(UNSAFE_FILENAME, '_')] : []),
    `${year}${month}${day}-${hour}${minute}`,
    `${count}筆`,
  ];
  return `${parts.join('_')}.${format}`;
}

/** The note under the choices (BK-8b, BK-8c, BK-8d). */
export function exportNote(orgLabel: string, type: ExportType): string {
  return (
    `匯出「${orgLabel}」的「${exportTypeLabel(type)}」需求。一列＝一筆需求，表頭第一列中文、第二列欄位代號。聯絡資料依權限可能遮罩。` +
    (type === ALL_NEED_TYPES
      ? '全部種類的檔案不含各種需求的細項欄位。'
      : '這個檔案改完可以直接匯入：標題＋電話相同的會更新原本的單。')
  );
}

export function exportToast(
  orgLabel: string,
  type: ExportType,
  rows: number,
): string {
  return `已匯出「${orgLabel}」的「${exportTypeLabel(type)}」需求 ${rows} 筆`;
}

/** 下載範本's file: one type's header row, named as the station import's template is. */
export function ticketImportTemplateFilename(taskType: NeedType): string {
  return `任務單匯入範本_${needTypeLabel(taskType)}.csv`;
}

/** `GET /bulk/tickets/export/counts`: rows per type (a type with none is absent), and the cap. */
type TicketExportCounts = components['schemas']['TicketExportCountsResponse'];

/**
 * One type's line in 匯出: its rows (null until the counts arrive), and whether they pass the cap,
 * past which the backend refuses that type's export. 全部種類 is every type's rows together.
 */
export function exportTypeCount(
  answer: Pick<TicketExportCounts, 'counts' | 'max_rows'> | undefined,
  type: ExportType,
): { count: number | null; overCap: boolean } {
  if (!answer) return { count: null, overCap: false };
  const count =
    type === ALL_NEED_TYPES
      ? Object.values(answer.counts).reduce((sum, n) => sum + n, 0)
      : (answer.counts[type] ?? 0);
  return { count, overCap: count > answer.max_rows };
}

/** What a type past the cap says in place of its count. */
export function exportCapLabel(maxRows: number): string {
  return `超過 ${maxRows.toLocaleString('en-US')} 筆，無法匯出`;
}
