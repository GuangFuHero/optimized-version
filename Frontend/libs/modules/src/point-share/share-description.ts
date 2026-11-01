/**
 * What a shared ticket or station says of itself — in a chat's link preview and in the message the
 * share sheet sends: the platform, then what it still needs (WG-002-2, the designer's 2026-10-10
 * test), or what the station is.
 *
 * Never the ticket's description. That is the reporter's own account, which the backend keeps from
 * a guest (ADR-281); a signed-in volunteer pressing 分享 would otherwise post it to a public group.
 */

import { readOpHour } from '../station/availability';
import {
  STATION_TYPE_OPTIONS,
  normalizeStationType,
} from '../station/type-options';
import { isNeedFull, type TicketNeed } from '../ticket/needs/need-claim';
import { formatTicketTypeLabel } from '../ticket/status';

const PLATFORM = '島嶼守望';

/** How many needs to name before counting the rest — a chat preview shows two lines at most. */
const MAX_NAMED_NEEDS = 3;

function isStillShort(need: TicketNeed): boolean {
  return (
    need.status !== 'fulfilled' &&
    !need.status.startsWith('cancel') &&
    !isNeedFull(need)
  );
}

function describeNeed(need: TicketNeed): string {
  return need.quantity == null
    ? need.taskName
    : `${need.taskName} 缺 ${need.quantity - need.assignedCount} 人`;
}

export function describeTicketForShare({
  needs,
  taskType,
}: {
  needs?: readonly TicketNeed[] | null;
  taskType?: string | null;
}): string {
  const short = (needs ?? []).filter(isStillShort);

  if (short.length === 0) {
    return `${PLATFORM}｜${taskType?.trim() ? formatTicketTypeLabel(taskType) : '救災任務'}`;
  }

  const named = short.slice(0, MAX_NAMED_NEEDS).map(describeNeed).join('、');
  const rest = short.length > MAX_NAMED_NEEDS ? ` 等 ${short.length} 項` : '';

  return `${PLATFORM}｜需要：${named}${rest}`;
}

/**
 * A station's own words, which the site shows anyone; with none, the platform, what kind of station
 * it is and its hours, in a sentence (WG-137). Never its level: the site does not show it, and a
 * station with nothing else read 「等級 0」.
 */
export function describeStationForShare({
  type,
  description,
  opHour,
}: {
  type?: string | null;
  description?: string | null;
  opHour?: string | null;
}): string {
  const own = description?.trim();

  if (own) {
    return own;
  }

  const normalizedType = normalizeStationType(type);
  const label = STATION_TYPE_OPTIONS.find(
    (option) => option.value === normalizedType,
  )?.label;
  const hours = readOpHour(opHour);

  return `${PLATFORM}｜${label ? `${label}站點` : '救災站點'}${hours ? `，服務時間 ${hours}` : ''}`;
}
