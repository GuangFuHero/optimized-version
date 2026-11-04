import type { HistoryLabels } from '@rescue-frontend/ui';

import { getOperationalStatusMeta } from '../../../station/operational-status';
import { STATION_TYPE_OPTIONS } from '../../../station/type-options';
import { adminTicketPriorityLabel } from '../../../ticket/admin/ticket-board/model/ticket-priority';
import { needTypeLabel } from '../../../ticket/admin/ticket-board/model/ticket-row';
import { formatTicketStatusLabel } from '../../../ticket/status';
import { formatTaiwanDateTime } from '../../../time';

/** Every field a history timeline can show (`history_fields.py`), the main ones first. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  title: '標題',
  name: '名稱',
  type: '站點類型',
  task_name: '需求名稱',
  task_type: '需求種類',
  quantity: '數量',
  status: '狀態',
  operational_status: '營運狀態',
  priority: '優先級',
  disaster_types: '災害類型',
  description: '說明',
  task_description: '需求說明',
  progress_note: '進度備註',
  supply_status: '目前缺少',
  op_hour: '服務時間',
  geometry: '位置',
  location_type: '位置類型',
  full_address: '地址',
  county: '縣市',
  town: '鄉鎮市區',
  village: '村里',
  neighborhood: '鄰',
  road: '路街',
  section: '段',
  lane: '巷',
  alley: '弄',
  no: '號',
  building_section: '樓棟或區域',
  floor: '樓層',
  room: '戶室',
  space_description: '空間描述',
  victim_space: '求救者所在空間',
  access_status: '可否進入',
  landmark_note: '地標補充',
  normalization_status: '地址確認',
  pole_id: '電線桿編號',
  pole_type: '電線桿類型',
  pole_note: '電線桿備註',
  contact_name: '聯絡人',
  contact_phone: '聯絡電話',
  contact_email: '聯絡信箱',
  person_trapped_reported: '有人受困',
  immediate_danger_reported: '有立即危險',
  actor_uuid: '承接人',
  role: '角色',
  team_uuid: '指派團隊',
  property_type: '項目類型',
  property_name: '項目',
  property_value: '內容',
  comment: '備註',
  audit_status: '資料檢核',
  audit_note: '檢核備註',
  verification_status: '驗證狀態',
  source: '來源',
  visibility: '能見度',
  level: '層級',
  is_official: '官方站點',
  is_temporary: '臨時站點',
  expires_at: '到期時間',
};

const VALUE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> =
  {
    audit_status: {
      no_audit: '未檢核',
      need_audit: '待檢核',
      audited: '已檢核',
      audit_issue: '有問題',
    },
    verification_status: {
      unverified: '未驗證',
      ai_verified: 'AI 驗證',
      human_verified: '人工驗證',
      disputed: '疑似重複',
    },
    source: { user: '民眾', official: '官方' },
    visibility: { public: '公開' },
    location_type: { address: '地址', pole: '電線桿' },
    normalization_status: {
      verified: '已確認門牌',
      pin_mismatch: '門牌與地圖位置不符',
      unverified: '未確認門牌',
    },
    access_status: {
      accessible: '可進入',
      restricted: '進入受限',
      inaccessible: '無法進入',
      unknown: '不確定',
    },
    person_trapped_reported: { yes: '是', no: '否', unknown: '不確定' },
    immediate_danger_reported: { yes: '是', no: '否', unknown: '不確定' },
  };

/**
 * Words for a history timeline, the board's own for what the board also shows. A value with no
 * word here stays as stored: a raw value says less, but a guessed word would say something false.
 * `disasters` maps a disaster type's key to its name, which only the backend knows.
 */
export function historyLabels(
  disasters: Readonly<Record<string, string>> = {},
): HistoryLabels {
  return {
    fields: FIELD_LABELS,
    value(entity, field, value) {
      switch (field) {
        case 'status':
          return entity === 'ticket' || entity === 'task'
            ? formatTicketStatusLabel(value)
            : value;
        case 'priority':
          return adminTicketPriorityLabel(value) ?? value;
        case 'task_type':
          return needTypeLabel(value);
        case 'operational_status':
          return getOperationalStatusMeta(value).label;
        case 'type':
          return (
            STATION_TYPE_OPTIONS.find((option) => option.value === value)
              ?.label ?? value
          );
        case 'disaster_types':
          return disasters[value] ?? value;
        case 'expires_at':
          return formatTaiwanDateTime(value) ?? value;
        default:
          return VALUE_LABELS[field]?.[value] ?? value;
      }
    },
    hideOnCreate(field, value) {
      return (
        (field === 'audit_status' && value === 'no_audit') ||
        (field === 'verification_status' && value === 'unverified')
      );
    },
  };
}
