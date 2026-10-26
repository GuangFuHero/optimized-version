import { describe, expect, it } from 'vitest';

import {
  addableDisasterTypes,
  basicsBody,
  canRemoveDisasterType,
  disasterTypeLabel,
  fieldCountFor,
  fromDateTimeLocal,
  nameProblem,
  startedAtProblem,
  toDateTimeLocal,
} from './settings';

describe('名稱與簡稱', () => {
  it('asks for a name when it is blank or only spaces', () => {
    expect(nameProblem('')).toBe('名稱不能空白');
    expect(nameProblem('   ')).toBe('名稱不能空白');
    expect(nameProblem('花蓮馬太鞍溪堰塞湖專案')).toBeNull();
  });

  it('sends both trimmed, and a blank short name as null so the full name shows', () => {
    expect(
      basicsBody({
        name: ' 花蓮馬太鞍溪堰塞湖專案 ',
        shortName: ' 花蓮馬太鞍溪 ',
      }),
    ).toEqual({
      name: '花蓮馬太鞍溪堰塞湖專案',
      short_name: '花蓮馬太鞍溪',
    });
    expect(basicsBody({ name: '花蓮', shortName: '  ' })).toEqual({
      name: '花蓮',
      short_name: null,
    });
  });

  it('never carries map_view, so saving the name leaves the map where it was', () => {
    expect(basicsBody({ name: '花蓮', shortName: '' })).not.toHaveProperty(
      'map_view',
    );
  });
});

describe('起始時間', () => {
  const now = new Date(2026, 9, 27, 12, 0);

  it('asks for a time, then refuses one in the future', () => {
    expect(startedAtProblem('', now)).toBe('請選擇時間');
    expect(startedAtProblem('2026-10-27T12:01', now)).toBe(
      '起始時間不能是未來',
    );
    expect(startedAtProblem('2026-10-27T12:00', now)).toBeNull();
    expect(startedAtProblem('2026-10-04T06:30', now)).toBeNull();
  });

  it('round-trips through the datetime-local field in the browser’s zone', () => {
    const iso = fromDateTimeLocal('2026-10-04T06:30');
    expect(new Date(iso).getTime()).toBe(new Date(2026, 9, 4, 6, 30).getTime());
    expect(toDateTimeLocal(iso)).toBe('2026-10-04T06:30');
  });

  it('leaves the field empty when nothing is set', () => {
    expect(toDateTimeLocal(null)).toBe('');
    expect(toDateTimeLocal(undefined)).toBe('');
    expect(toDateTimeLocal('not a date')).toBe('');
  });
});

describe('這次用到的災害類型', () => {
  const vocab = [
    { key: 'flood', label: '水災', isActive: true },
    { key: 'landslide', label: '土石流', isActive: true },
    { key: 'radiation', label: '輻射', isActive: false },
  ];

  it('offers the active types not already chosen', () => {
    expect(
      addableDisasterTypes(vocab, ['flood']).map((type) => type.key),
    ).toEqual(['landslide']);
    expect(addableDisasterTypes(vocab, [])).toHaveLength(2);
  });

  it('names a chosen type by its label, or by its key when the list has none for it', () => {
    expect(disasterTypeLabel(vocab, 'landslide')).toBe('土石流');
    expect(disasterTypeLabel(vocab, 'fire')).toBe('fire');
  });

  it('keeps the last type: the event always has at least one', () => {
    expect(canRemoveDisasterType(['flood'])).toBe(false);
    expect(canRemoveDisasterType(['flood', 'landslide'])).toBe(true);
  });

  it('counts only the fields scoped to that type, not the universal ones the query also returns', () => {
    const configs = [
      { disasterTypes: ['flood'] },
      { disasterTypes: ['flood', 'landslide'] },
      { disasterTypes: [] },
    ];
    expect(fieldCountFor(configs, 'flood')).toBe(2);
    expect(fieldCountFor(configs, 'landslide')).toBe(1);
    expect(fieldCountFor(configs, 'fire')).toBe(0);
  });
});
