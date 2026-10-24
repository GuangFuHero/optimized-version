import { describe, expect, it } from 'vitest';

import {
  STATION_SUGGESTION_FIELDS,
  describeSuggestionValue,
  hasPendingSuggestion,
  startSuggestion,
  stationSuggestionField,
  suggestionProblem,
  toCreateStationSuggestionInput,
  type StationSuggestionSnapshot,
} from './fields';

const STATION: StationSuggestionSnapshot = {
  name: '光復國小收容所',
  type: 'shelter',
  description: '體育館正門',
  opHour: '08:00-18:00',
  operationalStatus: 'active',
  supplyStatus: '飲用水見底',
  pendingSuggestedFields: ['op_hour'],
};

describe('STATION_SUGGESTION_FIELDS', () => {
  it('offers the six fields the public can judge, whether it still runs first', () => {
    expect(STATION_SUGGESTION_FIELDS.map((field) => field.name)).toEqual([
      'operational_status',
      'op_hour',
      'name',
      'description',
      'type',
      'supply_status',
    ]);
  });

  it("names a station's status in the site's words, and takes the backend's values", () => {
    expect(stationSuggestionField('operational_status').choices).toEqual([
      { value: 'active', label: '營運中' },
      { value: 'temporarily_closed', label: '暫停服務' },
      { value: 'permanently_closed', label: '已關閉' },
    ]);
  });
});

describe('startSuggestion', () => {
  it('opens a field on its value now', () => {
    expect(startSuggestion(STATION, 'supply_status')).toEqual({
      field: 'supply_status',
      value: '飲用水見底',
      note: '',
    });
    expect(startSuggestion(STATION, 'type', '路過看到').note).toBe('路過看到');
  });

  it('reads a station without a status as running, and a missing value as empty', () => {
    expect(startSuggestion({}, 'operational_status').value).toBe('active');
    expect(startSuggestion({ supplyStatus: null }, 'supply_status').value).toBe(
      '',
    );
  });
});

describe('describeSuggestionValue', () => {
  it('shows a choice by its label, typed text as typed, and nothing as 未提供', () => {
    expect(
      describeSuggestionValue(stationSuggestionField('type'), 'shelter'),
    ).toBe('避難');
    expect(
      describeSuggestionValue(
        stationSuggestionField('operational_status'),
        'temporarily_closed',
      ),
    ).toBe('暫停服務');
    expect(
      describeSuggestionValue(stationSuggestionField('op_hour'), ' 24小時 '),
    ).toBe('24小時');
    expect(
      describeSuggestionValue(stationSuggestionField('supply_status'), '  '),
    ).toBe('未提供');
  });

  it('shows a type the site does not know as the backend wrote it', () => {
    expect(
      describeSuggestionValue(stationSuggestionField('type'), 'kitchen'),
    ).toBe('kitchen');
  });
});

describe('suggestionProblem', () => {
  it('sends a value that changes the station', () => {
    expect(
      suggestionProblem(STATION, {
        field: 'supply_status',
        value: '尿布不足',
        note: '',
      }),
    ).toBeNull();
    expect(
      suggestionProblem(STATION, {
        field: 'operational_status',
        value: 'temporarily_closed',
        note: '大門貼了公告',
      }),
    ).toBeNull();
  });

  it('holds back a value left as it is, spaces aside', () => {
    expect(
      suggestionProblem(STATION, {
        field: 'supply_status',
        value: ' 飲用水見底 ',
        note: '',
      }),
    ).toBe('和目前一樣，改了才能送出');
  });

  it('holds back a blank, a supply status included', () => {
    expect(
      suggestionProblem(STATION, {
        field: 'supply_status',
        value: '   ',
        note: '',
      }),
    ).toBe('請填寫物資狀況');
    expect(
      suggestionProblem(STATION, { field: 'type', value: '', note: '' }),
    ).toBe('請選擇站點類型');
  });

  it('holds back text past what the backend takes', () => {
    expect(
      suggestionProblem(STATION, {
        field: 'name',
        value: '站'.repeat(1001),
        note: '',
      }),
    ).toBe('站點名稱最多 1000 字');
    expect(
      suggestionProblem(STATION, {
        field: 'name',
        value: '新名稱',
        note: '說'.repeat(1001),
      }),
    ).toBe('補充說明最多 1000 字');
  });
});

describe('hasPendingSuggestion', () => {
  it('knows which fields already wait for review', () => {
    expect(hasPendingSuggestion(STATION, 'op_hour')).toBe(true);
    expect(hasPendingSuggestion(STATION, 'supply_status')).toBe(false);
    expect(hasPendingSuggestion({}, 'op_hour')).toBe(false);
  });
});

describe('toCreateStationSuggestionInput', () => {
  it('sends the field trimmed, and no note rather than a blank one', () => {
    expect(
      toCreateStationSuggestionInput('station-1', {
        field: 'supply_status',
        value: ' 尿布不足 ',
        note: '  ',
      }),
    ).toEqual({
      targetType: 'station',
      targetUuid: 'station-1',
      fieldName: 'supply_status',
      newValue: '尿布不足',
      comment: null,
    });
    expect(
      toCreateStationSuggestionInput('station-1', {
        field: 'name',
        value: '新名稱',
        note: ' 路過看到 ',
      }).comment,
    ).toBe('路過看到');
  });
});
