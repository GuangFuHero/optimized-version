/**
 * The back office's notice sentences, written here in zh-TW from the notice's `params` rather than
 * shown from the backend's `title` and `body`. A notice whose `params` is missing, or lacks a value
 * its sentence names, shows the backend's own text, so the bell never reads 「null」 or 「」.
 */

import { ROLE_DISPLAY_NAMES } from '../constants/roles';
import { ROLE_REQUEST_LABELS } from '../role-request/form';
import { suggestionFieldLabel } from '../station/suggestion/fields';
import type { NotificationRow } from './site-notices';

type Params = Record<string, unknown>;
type Text = { summary: string; detail: string | null };

/** The roles an applicant asks for, by name; any other code is not one this sentence knows. */
const REQUESTED_ROLES: Partial<Record<string, string>> = ROLE_REQUEST_LABELS;

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
      // A suggestion on one of the station's items says which: 「礦泉水」的數量.
      const item = named(params, 'property_name');
      const fieldLabel = suggestionFieldLabel(field);

      return {
        summary:
          station === null
            ? '有一筆站點修改建議待審'
            : `「${station}」有一筆修改建議待審`,
        detail:
          item === null
            ? fieldLabel
            : `「${LIVE_STATUS_LABELS[item] ?? item}」的${fieldLabel}`,
      };
    }
    case 'dedup_review_pending': {
      const count = named(params, 'count');

      return count === null
        ? null
        : {
            summary: `${count} 筆資料疑似重複，待審核`,
            detail: '照樣建立的資料和既有的項目很像，請到「重複審核」判斷',
          };
    }
    case 'role_request_submitted': {
      const applicant = named(params, 'applicant_name');
      const role = named(params, 'requested_role');
      const roleLabel = role === null ? undefined : REQUESTED_ROLES[role];

      if (applicant === null || roleLabel === undefined) {
        return null;
      }

      const team = named(params, 'team_name');
      const newTeam = named(params, 'new_team_name');
      let detail: string | null = null;

      if (team !== null) {
        detail = `申請加入：${team}`;
      } else if (newTeam !== null) {
        // Not in the prototype; for the designer to confirm.
        detail = `申請成立團隊：${newTeam}`;
      }

      return {
        summary: `${applicant}申請成為${roleLabel}`,
        detail,
      };
    }
    case 'station_assigned': {
      const station = named(params, 'station_name');

      return station === null
        ? null
        : {
            summary: `你的團隊被指派負責站點「${station}」`,
            detail: '可以編輯這個站點、處理它的修改建議',
          };
    }
    case 'station_unassigned': {
      const station = named(params, 'station_name');

      return station === null
        ? null
        : { summary: `你的團隊不再負責站點「${station}」`, detail: null };
    }
    case 'zone_assigned': {
      const zone = named(params, 'zone_name');

      return zone === null
        ? null
        : {
            summary: `你的團隊被指派負責責任區「${zone}」`,
            detail: '請到任務管理篩選你的團隊，看區域內的任務',
          };
    }
    case 'zone_unassigned': {
      const zone = named(params, 'zone_name');

      return zone === null
        ? null
        : { summary: `你的團隊不再負責責任區「${zone}」`, detail: null };
    }
    case 'team_member_added': {
      const team = named(params, 'team_name');
      const role = named(params, 'role');

      return team === null || role === null
        ? null
        : {
            summary: `歡迎加入團隊「${team}」`,
            detail: `你的身分：${MEMBER_ROLES.get(role) ?? role}`,
          };
    }
    case 'team_suspended': {
      const team = named(params, 'team_name');

      return team === null
        ? null
        : { summary: `團隊「${team}」已暫停`, detail: null };
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

        // 🚨 Not the prototype's 「營運狀態更新」: what changed is one of these properties.
        return {
          summary: label
            ? `「${station}」的「${label}」已更新`
            : `「${station}」狀態更新`,
          detail: null,
        };
      }

      return change === 'created'
        ? { summary: `新建站點「${station}」`, detail: null }
        : null;
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
