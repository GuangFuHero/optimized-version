import type {
  AdminTaskFieldsFragment,
  AdminTicketFieldsFragment,
  AdminTicketMapPinsQuery,
  AuditStatus,
} from '@rescue-frontend/data-access/admin';
import type { BadgeTone } from '@rescue-frontend/ui';

import { stationPoint } from '../../../../station/station-point';

export type { AuditStatus };

export type TicketStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

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
export const UNTITLED_TICKET = '（未命名求助單）';

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
  raw: AdminTaskFieldsFragment;
}

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
  /** The point is a coarse cell, not an exact address. */
  isCoarse: boolean;
  updatedAt: string | null;
  tasks: TaskRow[];
  volunteerGap: number;
  raw: AdminTicketFieldsFragment & { tasks: AdminTaskFieldsFragment[] };
}

function toTaskRow(task: AdminTaskFieldsFragment): TaskRow {
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
    raw: task,
  };
}

/** What the map reads of a ticket: its pin, the cell's ticket list, and a picked pin's ticket. */
export type TicketPin = Pick<
  TicketRow,
  | 'uuid'
  | 'title'
  | 'status'
  | 'priority'
  | 'area'
  | 'position'
  | 'locationCell'
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
  };
}

export function toTicketRow(
  ticket: AdminTicketFieldsFragment & { tasks: AdminTaskFieldsFragment[] },
): TicketRow {
  const county = ticket.secondaryLocation?.county?.trim() ?? '';
  const town = ticket.secondaryLocation?.town?.trim() ?? '';
  const tasks = ticket.tasks.map(toTaskRow);
  return {
    ...toTicketPin(ticket),
    auditStatus: ticket.auditStatus as AuditStatus,
    disasterTypes: ticket.disasterTypes,
    county,
    town,
    isCoarse: !!ticket.locationCell,
    updatedAt: ticket.updatedAt ?? null,
    tasks,
    volunteerGap: tasks.reduce((sum, t) => sum + t.gap, 0),
    raw: ticket,
  };
}
