import type { RescueMapMarkerItem } from '../../map/types';

export const SITE_STATION_REPORT_STORAGE_KEY = 'rescue-site:station-reports';

export type StationOperationalStatus =
  | 'operating'
  | 'limited'
  | 'closed'
  | 'unknown';

export interface StationReportFormValues {
  stationId: string;
  suggestedStatus: StationOperationalStatus;
  comment: string;
  reporterName: string;
}

export interface StationReportRecord {
  id: string;
  stationId: string;
  stationTitle: string;
  stationLabel: string;
  suggestedStatus: StationOperationalStatus;
  suggestedStatusLabel: string;
  comment: string;
  reporterName: string;
  submittedAt: string;
}

export const stationOperationalStatusOptions: readonly {
  value: StationOperationalStatus;
  label: string;
  tone: 'success' | 'warning' | 'error' | 'neutral';
}[] = [
  { value: 'operating', label: '仍在運作', tone: 'success' },
  { value: 'limited', label: '部分運作', tone: 'warning' },
  { value: 'closed', label: '已停止營運', tone: 'error' },
  { value: 'unknown', label: '現況不明', tone: 'neutral' },
];

export const defaultStationReportFormValues: StationReportFormValues = {
  stationId: '',
  suggestedStatus: 'closed',
  comment: '',
  reporterName: '',
};

function isStationOperationalStatus(
  value: unknown,
): value is StationOperationalStatus {
  return stationOperationalStatusOptions.some(
    (option) => option.value === value,
  );
}

export function getStationStatusOption(status: StationOperationalStatus) {
  return (
    stationOperationalStatusOptions.find((option) => option.value === status) ??
    stationOperationalStatusOptions[3]
  );
}

function normalizeStationReportRecord(
  value: unknown,
): StationReportRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<StationReportRecord>;

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.stationId !== 'string' ||
    typeof candidate.stationTitle !== 'string' ||
    typeof candidate.stationLabel !== 'string' ||
    typeof candidate.comment !== 'string' ||
    typeof candidate.submittedAt !== 'string' ||
    !isStationOperationalStatus(candidate.suggestedStatus)
  ) {
    return null;
  }

  const statusOption = getStationStatusOption(candidate.suggestedStatus);

  return {
    id: candidate.id,
    stationId: candidate.stationId,
    stationTitle: candidate.stationTitle,
    stationLabel: candidate.stationLabel,
    suggestedStatus: candidate.suggestedStatus,
    suggestedStatusLabel: statusOption.label,
    comment: candidate.comment,
    reporterName:
      typeof candidate.reporterName === 'string' &&
      candidate.reporterName.trim()
        ? candidate.reporterName
        : '現場回報者',
    submittedAt: candidate.submittedAt,
  };
}

export function readStationReports(): StationReportRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const storedValue = window.localStorage.getItem(
    SITE_STATION_REPORT_STORAGE_KEY,
  );

  if (!storedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(storedValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeStationReportRecord(item))
      .filter((item): item is StationReportRecord => item !== null);
  } catch {
    return [];
  }
}

export function writeStationReports(reports: readonly StationReportRecord[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    SITE_STATION_REPORT_STORAGE_KEY,
    JSON.stringify(reports),
  );
}

export function createStationReportRecord(
  station: RescueMapMarkerItem,
  values: StationReportFormValues,
  now = new Date(),
): StationReportRecord {
  const statusOption = getStationStatusOption(values.suggestedStatus);

  return {
    id: `station-report-${station.id}-${now.getTime()}`,
    stationId: station.id,
    stationTitle: station.title,
    stationLabel: station.label,
    suggestedStatus: values.suggestedStatus,
    suggestedStatusLabel: statusOption.label,
    comment: values.comment.trim(),
    reporterName: values.reporterName.trim() || '現場回報者',
    submittedAt: now.toISOString(),
  };
}

export function groupStationReportsByStationId(
  reports: readonly StationReportRecord[],
) {
  return reports.reduce<Record<string, StationReportRecord[]>>(
    (groupedReports, report) => {
      const stationReports = groupedReports[report.stationId] ?? [];

      groupedReports[report.stationId] = [...stationReports, report];

      return groupedReports;
    },
    {},
  );
}

export function formatStationReportDate(value: string | Date) {
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

export function createStationReportSummary(report: StationReportRecord) {
  return `${report.suggestedStatusLabel}｜${report.comment}`;
}
