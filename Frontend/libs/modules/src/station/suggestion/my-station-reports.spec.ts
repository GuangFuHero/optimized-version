import { describe, expect, it } from 'vitest';

import type { MyStationSuggestionsQuery } from '@rescue-frontend/data-access';

import {
  openReportedStation,
  readMyStationReports,
  stationReportOutcome,
} from './my-station-reports';

type Row = MyStationSuggestionsQuery['myStationSuggestions'][number];

const NOW = new Date('2026-11-02T12:00:00Z');

function row(overrides: Partial<Row> = {}): Row {
  return {
    uuid: 'suggestion-1',
    targetType: 'station',
    station: { uuid: 'station-1', name: '光復國小加水站' },
    fieldName: 'operational_status',
    previousValue: 'active',
    newValue: 'temporarily_closed',
    comment: null,
    status: 'pending',
    submittedAt: '2026-10-30T12:00:00Z',
    decidedAt: null,
    ...overrides,
  };
}

describe('stationReportOutcome', () => {
  it('reads six statuses as three', () => {
    expect(
      [
        'pending',
        'approved',
        'adopted_edited',
        'revoked',
        'rejected',
        'not_adopted',
      ].map(stationReportOutcome),
    ).toEqual([
      'pending',
      'adopted',
      'adopted',
      'adopted',
      'not-adopted',
      'not-adopted',
    ]);
  });

  it('reads a status it does not know as still waiting', () => {
    expect(stationReportOutcome('something_new')).toBe('pending');
  });
});

describe('readMyStationReports', () => {
  it('names the field and its values as the suggestion form does', () => {
    const [report] = readMyStationReports([row()], NOW);

    expect(report).toMatchObject({
      stationUuid: 'station-1',
      stationName: '光復國小加水站',
      fieldLabel: '營運狀態',
      previous: '開設中',
      suggested: '暫停服務',
      outcome: 'pending',
      sentAgo: '3 天前送出',
    });
  });

  it('shows an empty value before as 未提供, and none on record as no arrow', () => {
    const [empty, unknown] = readMyStationReports(
      [
        row({
          fieldName: 'op_hour',
          previousValue: '',
          newValue: '08:00–18:00',
        }),
        row({ uuid: 'suggestion-2', previousValue: null }),
      ],
      NOW,
    );

    expect(empty.previous).toBe('未提供');
    expect(unknown.previous).toBeNull();
  });

  it('says a station is gone and gives no link to it', () => {
    const [report] = readMyStationReports([row({ station: null })], NOW);

    expect(report.stationUuid).toBeNull();
    expect(report.stationName).toBe('這個站點已經下架');
  });

  it('names a station property field the site form does not offer', () => {
    const [report] = readMyStationReports(
      [
        row({
          targetType: 'station_property',
          fieldName: 'quantity',
          previousValue: '3',
          newValue: '10',
        }),
      ],
      NOW,
    );

    expect(report).toMatchObject({
      fieldLabel: '數量',
      previous: '3',
      suggested: '10',
    });
  });
});

describe('openReportedStation', () => {
  it('selects the station in place on the station list', () => {
    expect(
      openReportedStation(
        { module: 'list', state: { dataType: 'station' } },
        'station-1',
      ),
    ).toEqual({
      select: { dataType: 'station', selectedMarkerId: 'station-1' },
    });
  });

  it('goes to the station list from anywhere else', () => {
    const opening = openReportedStation(
      { module: 'map', state: { dataType: 'ticket' } },
      'station-1',
    );

    expect('href' in opening && opening.href).toContain('station-1');
  });
});
