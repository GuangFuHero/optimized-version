import type {
  AdminTaskFieldsFragment,
  AdminTicketMapPinsQuery,
  AdminTicketsQuery,
  AuditStatus,
} from '@rescue-frontend/data-access/admin';
import type { BadgeTone } from '@rescue-frontend/ui';

import { stationPoint } from '../../../../station/station-point';
import { formatTicketStreet } from '../../../address';
import { formatTicketTypeLabel } from '../../../status';

export type { AuditStatus };

export type TicketStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
/** Priorities, most urgent first: the order every picker, legend and filter lists them in. */
export const TICKET_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/**
 * The task types a need can be (`CreateTicketTaskInput.taskType`, see formatTicketTypeLabel), and
 * so the types a ticket import or export is cut by (the backend's `task_type`).
 */
export const NEED_TYPES = ['rescue', 'supply', 'medical', 'hr'] as const;
export type NeedType = (typeof NEED_TYPES)[number];

/**
 * A need type as the admin board words it (the design's task kinds): 搜救 where the public site,
 * through `formatTicketTypeLabel`, says 救援. 醫療 has no label in the design; it keeps the shared one.
 */
export function needTypeLabel(value?: string | null): string {
  return value?.trim().toLowerCase() === 'rescue'
    ? '搜救'
    : formatTicketTypeLabel(value);
}

/** A ticket's audit state as the board badges it. */
export const AUDIT_BADGES: Record<
  AuditStatus,
  { label: string; tone: BadgeTone }
> = {
  no_audit: { label: '免審核', tone: 'neutral' },
  need_audit: { label: '待審核', tone: 'warning' },
  audited: { label: '已審核', tone: 'success' },
  audit_issue: { label: '有問題', tone: 'danger' },
};

/** Shown wherever a ticket has no title. */
export const UNTITLED_TICKET = '（未命名任務單）';

/**
 * Need statuses that still take people: the backend's `OPEN_NEED_STATUSES`. `in_progress` is a
 * legacy status (ADR-293 left old rows unmigrated) and is still open.
 */
export const OPEN_TASK_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'in_progress',
]);

export interface TaskRow {
  uuid: string;
  taskType: string;
  taskName: string;
  /** `in_progress` only on legacy rows. */
  status: 'pending' | 'in_progress' | 'fulfilled' | 'canceled';
  quantity: number | null;
  assignedCount: number;
  /** People still missing: only an open need with a quantity has one. */
  gap: number;
}

/** What `TaskRow` reads of a need: the list's fragment and the drawer's ticket both carry it. */
export type TaskRowFields = Pick<
  AdminTaskFieldsFragment,
  'uuid' | 'taskType' | 'taskName' | 'status' | 'quantity' | 'assignedCount'
>;

/** One ticket of the board's `tickets` page, as the list query selects it. */
export type TicketListItem = AdminTicketsQuery['tickets']['items'][number];

export interface TicketRow {
  uuid: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  auditStatus: AuditStatus;
  disasterTypes: string[];
  county: string;
  town: string;
  area: string;
  /** [lat, lng] for Leaflet, or null when the ticket has no point. */
  position: [number, number] | null;
  locationCell: string | null;
  /** The 開啟空間 space it was filed in (BE-036); null outside one, or to a viewer without detail. */
  buildingMapUuid: string | null;
  /** The point is a coarse cell, not an exact address. */
  isCoarse: boolean;
  updatedAt: string | null;
  /** The street line under the title; null when there is none or it is withheld (`isCoarse`). */
  address: string | null;
  /** How many photo links it has: the row shows a count, never the images. */
  photoCount: number;
  /** The 責任區 teams' names (`responsibleTeams`); empty when none, and when withheld. */
  teamNames: string[];
  tasks: TaskRow[];
  volunteerGap: number;
  raw: TicketListItem;
}

function toTaskRow(task: TaskRowFields): TaskRow {
  const quantity = task.quantity ?? null;
  const gap =
    OPEN_TASK_STATUSES.has(task.status) && quantity !== null
      ? Math.max(0, quantity - task.assignedCount)
      : 0;
  return {
    uuid: task.uuid,
    taskType: task.taskType,
    taskName: task.taskName,
    status: task.status as TaskRow['status'],
    quantity,
    assignedCount: task.assignedCount,
    gap,
  };
}

/** A ticket's needs as the board models them, from the list row or the drawer's ticket alike. */
export function toTaskRows(tasks: readonly TaskRowFields[]): TaskRow[] {
  return tasks.map(toTaskRow);
}

/**
 * What the map reads of a ticket: its pin, the side list (title, street line, priority, status),
 * the cell's ticket list, and a picked pin's ticket.
 */
export type TicketPin = Pick<
  TicketRow,
  | 'uuid'
  | 'title'
  | 'status'
  | 'priority'
  | 'area'
  | 'position'
  | 'locationCell'
  | 'isCoarse'
  | 'address'
  | 'buildingMapUuid'
>;

type TicketPinFields = AdminTicketMapPinsQuery['tickets']['items'][number];

export function toTicketPin(ticket: TicketPinFields): TicketPin {
  const county = ticket.secondaryLocation?.county?.trim() ?? '';
  const town = ticket.secondaryLocation?.town?.trim() ?? '';
  return {
    uuid: ticket.uuid,
    title: ticket.title?.trim() || UNTITLED_TICKET,
    // The schema types these as plain strings; the backend only stores the listed values.
    status: ticket.status as TicketStatus,
    priority: ticket.priority as TicketPriority,
    area: `${county}${town}`,
    position: stationPoint(ticket.geometry),
    locationCell: ticket.locationCell ?? null,
    isCoarse: !!ticket.locationCell,
    address: formatTicketStreet(ticket.secondaryLocation),
    buildingMapUuid: ticket.buildingMapUuid ?? null,
  };
}

/**
 * The line under a ticket's title in the list and the map's side list: its street line; for a
 * coarse ticket, a note that the address is withheld, never a blank that reads as 未提供.
 */
export function ticketAddressLine(
  row: Pick<TicketPin, 'isCoarse' | 'address'>,
): string {
  if (row.isCoarse) return '約略位置（無檢視詳細位置權限）';
  return row.address ?? '未提供地址';
}

export function toTicketRow(ticket: TicketListItem): TicketRow {
  const county = ticket.secondaryLocation?.county?.trim() ?? '';
  const town = ticket.secondaryLocation?.town?.trim() ?? '';
  const tasks = toTaskRows(ticket.tasks);
  return {
    ...toTicketPin(ticket),
    auditStatus: ticket.auditStatus as AuditStatus,
    disasterTypes: ticket.disasterTypes,
    county,
    town,
    updatedAt: ticket.updatedAt ?? null,
    photoCount: ticket.photos.length,
    teamNames: ticket.responsibleTeams.map((team) => team.name),
    tasks,
    volunteerGap: tasks.reduce((sum, t) => sum + t.gap, 0),
    raw: ticket,
  };
}

/** 需求 · 承接進度 for one row: how many of its needs still wait for someone, and the bar's fill. */
export interface NeedProgress {
  /** Needs counted: every one but a cancelled one. */
  total: number;
  /** Still waiting: missing people (`gap`), or open with no quantity and nobody on it yet. */
  waiting: number;
  /** Needs with everyone they asked for (`fulfilled`). */
  fulfilled: number;
  /** The line over the bar; null when there is no need to count. */
  label: string | null;
  /** The bar's fill, 0–1: the share of needs not waiting. */
  ratio: number;
}

/**
 * The row's progress line, after the prototype's `fillState` (待承接 → 在途 → all done), on the
 * board's own gap rule: a need waits while it is short of people. A cancelled need is left out,
 * so it never holds a ticket at 在途 for good. `fulfilled` is 已滿足 (everyone it asked for, who
 * may have yet to go), so the last stage says 已滿足, not 完成.
 */
export function needProgress(tasks: readonly TaskRow[]): NeedProgress {
  const live = tasks.filter((task) => task.status !== 'canceled');
  const total = live.length;
  const waiting = live.filter(
    (task) =>
      task.gap > 0 ||
      (OPEN_TASK_STATUSES.has(task.status) &&
        task.quantity === null &&
        task.assignedCount === 0),
  ).length;
  const fulfilled = live.filter((task) => task.status === 'fulfilled').length;
  let label: string | null = null;
  if (total > 0) {
    if (waiting > 0) label = `待承接 ${waiting}／${total}`;
    else if (fulfilled < total) label = `在途 ${total - fulfilled}／${total}`;
    else label = `${total}／${total} 已滿足`;
  }
  return {
    total,
    waiting,
    fulfilled,
    label,
    ratio: total > 0 ? (total - waiting) / total : 0,
  };
}

/** A need as its chip names it: 「清淤人力 ×4」, or the name alone without a quantity. */
export function needChipLabel(task: Pick<TaskRow, 'taskName' | 'quantity'>) {
  return task.quantity ? `${task.taskName} ×${task.quantity}` : task.taskName;
}
