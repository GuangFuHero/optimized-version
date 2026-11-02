import { describe, expect, it } from 'vitest';

import { getOperationalStatusMeta } from '../operational-status';
import {
  STATION_SUGGESTION_FIELDS,
  describeSuggestedValue,
  describeSuggestionValue,
  hasPendingSuggestion,
  startSuggestion,
  stationSuggestionField,
  suggestionProblem,
  toCreateStationSuggestionInput,
  type StationSuggestionSnapshot,
} from './fields';

const STATION: StationSuggestionSnapshot = {
  uuid: 'f0000000-0000-4000-8000-000000000001',
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

  it('names the supply line for what it holds, 目前缺少, and says to clear it once nothing is short', () => {
    expect(stationSuggestionField('supply_status')).toMatchObject({
      label: '目前缺少',
      placeholder: '例：沐浴乳、毛巾；嬰兒尿布 M、L',
      helper: '只寫現在缺的東西。都補齊了就清空。',
    });
  });

  it("names a station's status in the site's words, and takes the backend's values", () => {
    expect(stationSuggestionField('operational_status').choices).toEqual([
      { value: 'active', label: '開設中' },
      { value: 'temporarily_closed', label: '暫停服務' },
      { value: 'permanently_closed', label: '已關閉' },
    ]);
  });

  it('calls an open station 開設中, as the back office does', () => {
    expect(
      describeSuggestionValue(
        stationSuggestionField('operational_status'),
        'active',
      ),
    ).toBe(getOperationalStatusMeta('active').label);
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
    expect(
      startSuggestion(
        { ...STATION, operationalStatus: '' },
        'operational_status',
      ).value,
    ).toBe('active');
    expect(
      startSuggestion({ ...STATION, supplyStatus: null }, 'supply_status')
        .value,
    ).toBe('');
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

  it('sends a blank 目前缺少 that clears the line, once nothing is short', () => {
    expect(
      suggestionProblem(STATION, {
        field: 'supply_status',
        value: '   ',
        note: '',
      }),
    ).toBeNull();
  });

  it('holds back any other blank, and a 目前缺少 with no line to clear', () => {
    expect(
      suggestionProblem(
        { ...STATION, supplyStatus: null },
        { field: 'supply_status', value: '', note: '' },
      ),
    ).toBe('請填寫目前缺少');
    expect(
      suggestionProblem(STATION, { field: 'type', value: '', note: '' }),
    ).toBe('請選擇站點類型');
    expect(
      suggestionProblem(STATION, { field: 'op_hour', value: ' ', note: '' }),
    ).toBe('請填寫服務時間');
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

describe('describeSuggestedValue', () => {
  it('says a blank 目前缺少 clears the line, and that any other blank is still to fill', () => {
    const supply = stationSuggestionField('supply_status');

    expect(describeSuggestedValue(supply, '飲用水見底', ' ')).toBe(
      '清空（都補齊了）',
    );
    expect(describeSuggestedValue(supply, '', '')).toBe('尚未填寫');
    expect(
      describeSuggestedValue(
        stationSuggestionField('op_hour'),
        '08:00-18:00',
        '',
      ),
    ).toBe('尚未填寫');
    expect(
      describeSuggestedValue(
        stationSuggestionField('operational_status'),
        'active',
        'temporarily_closed',
      ),
    ).toBe('暫停服務');
  });
});

describe('hasPendingSuggestion', () => {
  it('knows which fields already wait for review', () => {
    expect(hasPendingSuggestion(STATION, 'op_hour')).toBe(true);
    expect(hasPendingSuggestion(STATION, 'supply_status')).toBe(false);
    expect(
      hasPendingSuggestion(
        { ...STATION, pendingSuggestedFields: [] },
        'op_hour',
      ),
    ).toBe(false);
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

  it('sends a cleared 目前缺少 as an empty value, which the backend stores as none', () => {
    expect(
      toCreateStationSuggestionInput('station-1', {
        field: 'supply_status',
        value: '  ',
        note: '',
      }).newValue,
    ).toBe('');
  });
});
