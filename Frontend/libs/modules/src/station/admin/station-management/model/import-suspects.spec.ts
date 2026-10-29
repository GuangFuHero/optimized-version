import type { components } from '@rescue-frontend/data-access/openapi';
import { describe, expect, it } from 'vitest';

import {
  decisionsField,
  describeSuspect,
  fileAll,
  heldThoughFiled,
  keepFiled,
} from './import-suspects';

type Suspect = components['schemas']['SuspectedRowResponse'];

function suspect(line: number, relatedUuid: string): Suspect {
  return {
    line,
    row_title: '光復國民小學收容所',
    row_task_name: null,
    related_kind: 'station',
    related_uuid: relatedUuid,
    related_ticket_uuid: null,
    title: '光復國小臨時收容所',
    task_name: null,
    type: 'shelter',
    status: 'active',
    distance_m: 51,
    created_at: '2026-10-27T06:05:00Z',
  };
}

describe('keepFiled', () => {
  it('keeps a row filed anyway only while the same line still looks like the same station', () => {
    const filed = { 3: 'station-a', 14: 'station-b', 22: 'station-c' };

    expect(
      keepFiled(filed, [suspect(3, 'station-a'), suspect(14, 'station-x')]),
    ).toEqual({ 3: 'station-a' });
  });
});

describe('fileAll', () => {
  it('files every suspected row against the station it looks like', () => {
    expect(
      fileAll([suspect(3, 'station-a'), suspect(14, 'station-b')]),
    ).toEqual({ 3: 'station-a', 14: 'station-b' });
  });
});

describe('describeSuspect', () => {
  it('says what the row is, and what the station is, how far away and when it was made, in Taiwan time', () => {
    expect(describeSuspect(suspect(14, 'station-a'))).toEqual({
      row: '光復國民小學收容所',
      title: '光復國小臨時收容所',
      kind: '避難・開設中',
      distance: '相距 51 公尺',
      created: '2026/10/27 14:05 建立',
    });
  });

  it('gives a kilometre and more in kilometres', () => {
    expect(
      describeSuspect({ ...suspect(14, 'station-a'), distance_m: 1249 })
        .distance,
    ).toBe('相距 1.2 公里');
  });

  it('leaves out what the backend could not say', () => {
    expect(
      describeSuspect({
        ...suspect(14, 'station-a'),
        row_title: null,
        title: null,
        status: null,
        distance_m: null,
        created_at: null,
      }),
    ).toEqual({
      row: null,
      title: '（沒有名稱）',
      kind: '避難',
      distance: null,
      created: null,
    });
  });
});

describe('heldThoughFiled', () => {
  it('names the lines filed anyway that the commit still held, as it found another station', () => {
    const filed = { 3: 'station-a', 22: 'station-c' };
    const held = [suspect(14, 'station-b'), suspect(22, 'station-x')];

    expect(heldThoughFiled(filed, held)).toEqual(new Set([22]));
  });
});

describe('decisionsField', () => {
  it('sends the rows filed anyway, in line order, as the backend reads them', () => {
    expect(
      JSON.parse(decisionsField({ 22: 'station-c', 3: 'station-a' }) ?? ''),
    ).toEqual([
      { line: 3, acknowledged_duplicate_of: 'station-a' },
      { line: 22, acknowledged_duplicate_of: 'station-c' },
    ]);
  });

  it('leaves the field out when no row is filed anyway', () => {
    expect(decisionsField({})).toBeUndefined();
  });
});
