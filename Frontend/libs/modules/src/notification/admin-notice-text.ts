/**
 * The back office's notice sentences, written here in zh-TW from the notice's `params` rather than
 * shown from the backend's `title` and `body`. A notice whose `params` is missing, or lacks a value
 * its sentence names, shows the backend's own text, so the bell never reads 「null」 or 「」.
 */

import { ROLE_REQUEST_LABELS } from '../role-request/form';
import type { NotificationRow } from './site-notices';

type Params = Record<string, unknown>;
type Text = { summary: string; detail: string | null };

/** The backend's `_FIELD_LABELS` for a suggestion's field (`Backend/app/services/suggestion.py`). */
const FIELD_LABELS: Record<string, string> = {
  operational_status: '營運狀態',
  op_hour: '服務時間',
  name: '站點名稱',
  description: '地址／位置說明',
  type: '站點類型',
  supply_status: '目前缺少',
  property_name: '項目名稱',
  quantity: '數量',
};

const MEMBER_ROLE_LABELS: Record<string, string> = {
  member: '成員',
  admin: '管理員',
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

function has(map: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
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

      return {
        summary:
          station === null
            ? '有一筆站點修改建議待審'
            : `「${station}」有一筆修改建議待審`,
        detail: has(FIELD_LABELS, field) ? FIELD_LABELS[field] : field,
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

      if (
        applicant === null ||
        role === null ||
        !has(ROLE_REQUEST_LABELS, role)
      ) {
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
        summary: `${applicant}申請成為${ROLE_REQUEST_LABELS[role as keyof typeof ROLE_REQUEST_LABELS]}`,
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
            detail: `你的身分：${has(MEMBER_ROLE_LABELS, role) ? MEMBER_ROLE_LABELS[role] : role}`,
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
        return { summary: `「${station}」營運狀態更新`, detail: null };
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
