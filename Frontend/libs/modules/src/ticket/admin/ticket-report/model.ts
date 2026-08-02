import type {
  TicketListRowItem,
  TicketPriority,
  TicketRowStatus,
} from '../ticket-list/types';

export type TicketReporterRole =
  | 'affected-person'
  | 'volunteer'
  | 'agency'
  | 'other';

export type TicketReportTaskType =
  | 'cleanup'
  | 'medical'
  | 'supply'
  | 'rescue'
  | 'road-clearance'
  | 'other';

export type TicketReportSeverity = 'low' | 'medium' | 'high' | 'critical';

export type TicketContactVisibility = 'restricted' | 'dispatch-only' | 'public';

export interface TicketReportFormValues {
  reporterName: string;
  reporterRole: TicketReporterRole;
  reporterContact: string;
  reporterEmail: string;
  contactVisibility: TicketContactVisibility;
  submittedAt: string;
  taskType: TicketReportTaskType;
  severity: TicketReportSeverity;
  impactScope: string;
  address: string;
  landmark: string;
  description: string;
  photoUrls: string;
  referenceLinks: string;
}

export interface TicketReportAttachment {
  id: string;
  type: 'photo' | 'link';
  label: string;
  url: string;
}

export interface TicketActionLogEntry {
  id: string;
  ticketId: string;
  action: 'created' | 'viewed' | 'updated';
  actorName: string;
  actorRole: string;
  occurredAt: string;
  summary: string;
}

export interface TicketReportRecord {
  id: string;
  code: string;
  title: string;
  reporterName: string;
  reporterRole: string;
  reporterContact: string;
  reporterEmail?: string;
  contactVisibility: string;
  submittedAt: string;
  taskType: string;
  severity: TicketReportSeverity;
  impactScope: string;
  address: string;
  landmark?: string;
  description: string;
  attachments: TicketReportAttachment[];
  actionLog: TicketActionLogEntry[];
}

export const reporterRoleOptions: readonly {
  value: TicketReporterRole;
  label: string;
}[] = [
  { value: 'affected-person', label: '提出需求者' },
  { value: 'volunteer', label: '志工' },
  { value: 'agency', label: '政府/協作單位' },
  { value: 'other', label: '其他' },
];

export const taskTypeOptions: readonly {
  value: TicketReportTaskType;
  label: string;
  disasterType: string;
  disasterGlyph?: string;
}[] = [
  {
    value: 'cleanup',
    label: '清潔',
    disasterType: '瓦礫',
    disasterGlyph: '🌪️',
  },
  {
    value: 'medical',
    label: '醫療',
    disasterType: '醫療',
    disasterGlyph: '⚕️',
  },
  { value: 'supply', label: '物資', disasterType: '物資', disasterGlyph: '📦' },
  { value: 'rescue', label: '救援', disasterType: '救援' },
  {
    value: 'road-clearance',
    label: '道路清理',
    disasterType: '交通',
    disasterGlyph: '🚧',
  },
  { value: 'other', label: '其他', disasterType: '其他' },
];

export const severityOptions: readonly {
  value: TicketReportSeverity;
  label: string;
  rowStatus: TicketRowStatus;
  priority: TicketPriority;
}[] = [
  { value: 'low', label: '低度', rowStatus: 'pending', priority: 'low' },
  { value: 'medium', label: '中度', rowStatus: 'pending', priority: 'medium' },
  { value: 'high', label: '高度', rowStatus: 'inProgress', priority: 'high' },
  { value: 'critical', label: '緊急', rowStatus: 'critical', priority: 'high' },
];

export const contactVisibilityOptions: readonly {
  value: TicketContactVisibility;
  label: string;
}[] = [
  { value: 'restricted', label: '限內部調度可見' },
  { value: 'dispatch-only', label: '限受派遣人員可見' },
  { value: 'public', label: '可公開聯絡' },
];

export const defaultTicketReportFormValues: TicketReportFormValues = {
  reporterName: '',
  reporterRole: 'affected-person',
  reporterContact: '',
  reporterEmail: '',
  contactVisibility: 'restricted',
  submittedAt: '',
  taskType: 'cleanup',
  severity: 'medium',
  impactScope: '',
  address: '',
  landmark: '',
  description: '',
  photoUrls: '',
  referenceLinks: '',
};

function findLabel<TValue extends string>(
  options: readonly { value: TValue; label: string }[],
  value: TValue,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function parseAttachmentUrls(
  value: string,
  type: TicketReportAttachment['type'],
): TicketReportAttachment[] {
  return value
    .split(/\n|,/)
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url, index) => ({
      id: `${type}-${index + 1}`,
      type,
      label: type === 'photo' ? `照片 ${index + 1}` : `連結 ${index + 1}`,
      url,
    }));
}

export function formatTicketReportDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function createTicketReportRecord(
  values: TicketReportFormValues,
  sequence: number,
  now = new Date(),
): TicketReportRecord {
  const taskType = taskTypeOptions.find(
    (option) => option.value === values.taskType,
  );
  const severity = severityOptions.find(
    (option) => option.value === values.severity,
  );
  const ticketId = `report-${now.getTime()}`;
  const code = `#INC-${String(sequence).padStart(4, '0')}`;
  const submittedAt = values.submittedAt || now.toISOString();
  const actorRole = findLabel(reporterRoleOptions, values.reporterRole);
  const contactVisibility = findLabel(
    contactVisibilityOptions,
    values.contactVisibility,
  );
  const taskTypeLabel = taskType?.label ?? values.taskType;
  const severityLabel = severity?.label ?? values.severity;
  const title = `${taskTypeLabel}需求回報`;

  return {
    id: ticketId,
    code,
    title,
    reporterName: values.reporterName.trim(),
    reporterRole: actorRole,
    reporterContact: values.reporterContact.trim(),
    reporterEmail: values.reporterEmail.trim() || undefined,
    contactVisibility,
    submittedAt,
    taskType: taskTypeLabel,
    severity: values.severity,
    impactScope: values.impactScope.trim(),
    address: values.address.trim(),
    landmark: values.landmark.trim() || undefined,
    description: values.description.trim(),
    attachments: [
      ...parseAttachmentUrls(values.photoUrls, 'photo'),
      ...parseAttachmentUrls(values.referenceLinks, 'link'),
    ],
    actionLog: [
      {
        id: `${ticketId}-log-created`,
        ticketId,
        action: 'created',
        actorName: values.reporterName.trim(),
        actorRole,
        occurredAt: now.toISOString(),
        summary: `建立任務單 ${code}，需求類型：${taskTypeLabel}，程度：${severityLabel}，聯絡資訊：${contactVisibility}`,
      },
    ],
  };
}

export function createTicketRowFromReport(
  report: TicketReportRecord,
): TicketListRowItem {
  const taskType = taskTypeOptions.find(
    (option) => option.label === report.taskType,
  );
  const severity = severityOptions.find(
    (option) => option.value === report.severity,
  );

  return {
    id: report.id,
    status: severity?.rowStatus ?? 'pending',
    code: report.code,
    title: report.title,
    taskType: report.taskType,
    disasterType: taskType?.disasterType ?? '其他',
    disasterGlyph: taskType?.disasterGlyph,
    region: 'central',
    location: report.landmark
      ? `${report.address}（${report.landmark}）`
      : report.address,
    priority: severity?.priority ?? 'medium',
    verification: 'unverified',
    createdAt: formatTicketReportDate(report.submittedAt),
  };
}

export function createTicketReportRecordFromRow(
  row: TicketListRowItem,
): TicketReportRecord {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    reporterName: '現場回報者',
    reporterRole: '未標示',
    reporterContact: '未提供',
    contactVisibility: '限內部調度可見',
    submittedAt: row.createdAt,
    taskType: row.taskType,
    severity: row.status === 'critical' ? 'critical' : row.priority,
    impactScope: '既有任務資料尚未補充分級範圍',
    address: row.location,
    description: row.title,
    attachments: [],
    actionLog: [
      {
        id: `${row.id}-existing-log-created`,
        ticketId: row.id,
        action: 'created',
        actorName: '系統匯入',
        actorRole: '資料來源',
        occurredAt: row.createdAt,
        summary: `既有任務 ${row.code} 已納入回報清單`,
      },
    ],
  };
}
