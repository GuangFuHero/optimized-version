/**
 * The back office's notice sentences, written here in zh-TW from the notice's `params` rather than
 * shown from the backend's `title` and `body`. A notice whose `params` is missing, or lacks a value
 * its sentence names, shows the backend's own text, so the bell never reads 「null」 or 「」.
 */

import {
  ROLE_DISPLAY_NAMES,
  TEAM_TYPE_DISPLAY_NAMES,
} from '../constants/roles';
import { ROLE_REQUEST_LABELS } from '../role-request/form';
import { suggestionFieldLabel } from '../station/suggestion/fields';
import {
  normalizeStationType,
  STATION_TYPE_OPTIONS,
} from '../station/type-options';
import type { NotificationRow } from './site-notices';

type Params = Record<string, unknown>;
type Text = { summary: string; detail: string | null };

/** The roles an applicant asks for, by name; any other code is not one this sentence knows. */
const REQUESTED_ROLES: Partial<Record<string, string>> = ROLE_REQUEST_LABELS;

/** A request to join a team names the team's kind as the back office does (政府、非政府組織). */
const JOIN_KINDS: Partial<Record<string, string>> = {
  government: TEAM_TYPE_DISPLAY_NAMES.get('gov'),
  ngo: TEAM_TYPE_DISPLAY_NAMES.get('ngo'),
};

/** A station type by name (加水); a type outside the list says none. */
const STATION_TYPES: ReadonlyMap<string, string> = new Map(
  STATION_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

/** A team role by name (成員、管理員); a role this list lacks shows its code. */
const MEMBER_ROLES: ReadonlyMap<string, string> = ROLE_DISPLAY_NAMES;

/**
 * The live-status properties whose change sends `resource_station_updated` with `change: "status"`
 * (`OPERATIONAL_PROPERTY_NAMES`, `Backend/app/services/station.py`), named as the backend names
 * them there. The station's own 營運狀態 sends no such notice.
 */
const LIVE_STATUS_LABELS: Partial<Record<string, string>> = {
  beds_available: '剩餘床位',
  capacity_available: '可收治量',
  water_level: '供水充足程度',
  is_open: '是否營業',
  supply_rationed: '是否限量',
  power_stable: '供電是否穩定',
};

/** A value a sentence may name: a non-empty string or a finite number. Anything else is null. */
function named(params: Params, key: string): string | null {
  const value = params[key];

  if (typeof value === 'string') {
    return value === '' ? null : value;
  }

  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : null;
}

/** The sentence for a type, or null when `params` lacks what it names. */
function write(type: string, params: Params): Text | null {
  switch (type) {
    case 'station_suggestion_created': {
      const field = named(params, 'field');

      if (field === null) {
        return null;
      }

      const station = named(params, 'station_name');
      // A live-status item is named (要改：可收治量); any other item has no name here but its field's.
      const item = named(params, 'property_name');
      const liveStatus = item === null ? undefined : LIVE_STATUS_LABELS[item];

      return {
        summary:
          station === null
            ? '有一筆站點修改建議待審'
            : `站點「${station}」有一筆修改建議待審`,
        detail: `要改：${liveStatus ?? suggestionFieldLabel(field)}`,
      };
    }
    case 'dedup_review_pending': {
      // The count is of pairs, hence 組; the backend does not say whether they are tickets or stations.
      const count = named(params, 'count');

      return count === null
        ? null
        : {
            summary: `有 ${count} 組資料疑似重複，待審`,
            detail: '可能是任務單或站點，到「重複審核」判斷',
          };
    }
    case 'role_request_submitted': {
      const applicant = named(params, 'applicant_name');
      const role = named(params, 'requested_role');

      if (applicant === null || role === null) {
        return null;
      }

      const team = named(params, 'team_name');
      const kind = JOIN_KINDS[role];

      // Mostly that team's admins read it, so it says which team first.
      if (team !== null && kind !== undefined) {
        return {
          summary: `${applicant}申請加入團隊「${team}」`,
          detail: `身分：${kind}`,
        };
      }

      const newTeam = named(params, 'new_team_name');

      if (newTeam !== null) {
        return {
          summary: `${applicant}申請成立團隊「${newTeam}」`,
          detail: '通過後他是這一隊的管理員',
        };
      }

      const roleLabel = REQUESTED_ROLES[role];

      return roleLabel === undefined
        ? null
        : { summary: `${applicant}申請成為${roleLabel}`, detail: null };
    }
    // The team by name, not 你的團隊: one person can be in several, and the bell is not per identity.
    case 'station_assigned':
    case 'station_unassigned': {
      const station = named(params, 'station_name');
      const team = named(params, 'team_name');

      if (station === null || team === null) {
        return null;
      }

      return type === 'station_assigned'
        ? {
            summary: `「${team}」被指派負責站點「${station}」`,
            detail: '可以編輯這個站點、審修改建議',
          }
        : { summary: `「${team}」不再負責站點「${station}」`, detail: null };
    }
    case 'zone_assigned':
    case 'zone_unassigned': {
      const zone = named(params, 'zone_name');
      const team = named(params, 'team_name');

      if (zone === null || team === null) {
        return null;
      }

      return type === 'zone_assigned'
        ? {
            summary: `「${team}」被指派負責責任區「${zone}」`,
            detail: '點這裡看範圍',
          }
        : { summary: `「${team}」不再負責責任區「${zone}」`, detail: null };
    }
    case 'team_member_added': {
      const team = named(params, 'team_name');
      const role = named(params, 'role');

      // Someone already in another team sees this one only after switching to it.
      return team === null || role === null
        ? null
        : {
            summary: `你已加入團隊「${team}」，身分是${MEMBER_ROLES.get(role) ?? role}`,
            detail: '從右上角的名字切換到這一隊',
          };
    }
    case 'team_suspended': {
      const team = named(params, 'team_name');

      return team === null
        ? null
        : {
            summary: `團隊「${team}」已暫停`,
            detail: '你在這一隊的身分暫時不能用',
          };
    }
    case 'resource_station_updated': {
      const station = named(params, 'station_name');
      const change = named(params, 'change');

      if (station === null) {
        return null;
      }

      if (change === 'status') {
        const property = named(params, 'property_name');
        const label =
          property === null ? undefined : LIVE_STATUS_LABELS[property];

        return {
          summary: `站點「${station}」的${label ?? '狀態'}有更新`,
          detail: null,
        };
      }

      if (change !== 'created') {
        return null;
      }

      const stationType = normalizeStationType(named(params, 'station_type'));
      const typeLabel = stationType
        ? STATION_TYPES.get(stationType)
        : undefined;

      return {
        summary: `新增了站點「${station}」`,
        detail: typeLabel === undefined ? null : `類型：${typeLabel}`,
      };
    }
    default:
      return null;
  }
}

/** What the bell shows for a notice: our sentence, or the backend's `title` and `body`. */
export function adminNoticeText(
  row: Pick<NotificationRow, 'type' | 'title' | 'body' | 'params'>,
): Text {
  const written = row.params ? write(row.type, row.params) : null;

  return written ?? { summary: row.title, detail: row.body };
}
