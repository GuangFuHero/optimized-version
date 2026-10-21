import { describe, expect, it } from 'vitest';

import {
  buildCreateInput,
  buildUpdateInput,
  emptyStationForm,
  validateStationForm,
} from './station-form';

describe('station form', () => {
  const filled = {
    ...emptyStationForm([23.67, 121.42]),
    name: '光復加水站',
    type: 'water',
  };

  it('requires a name, a type and valid coordinates', () => {
    expect(validateStationForm(emptyStationForm())).toMatchObject({
      name: '請輸入站點名稱',
      type: '請選擇類型',
      latitude: '請輸入有效的緯度',
      longitude: '請輸入有效的經度',
    });
    expect(validateStationForm({ ...filled, latitude: '95' }).latitude).toBe(
      '請輸入有效的緯度',
    );
    expect(validateStationForm({ ...filled, longitude: 'abc' }).longitude).toBe(
      '請輸入有效的經度',
    );
    expect(validateStationForm(filled)).toEqual({});
  });

  it('creates an official station with a [lng, lat] point', () => {
    expect(buildCreateInput(filled)).toMatchObject({
      name: '光復加水站',
      type: 'water',
      source: 'official',
      visibility: 'public',
      operationalStatus: 'active',
      geometry: { type: 'Point', coordinates: [121.42, 23.67] },
    });
  });

  it('leaves blank optional fields out of the create input', () => {
    const input = buildCreateInput(filled);
    expect(input).not.toHaveProperty('description');
    expect(input).not.toHaveProperty('contactPhone');
  });

  it('updates only changed fields and never resends untouched (possibly masked) contact values', () => {
    const original = { ...filled, contactPhone: '09******78' };
    const changed = {
      ...original,
      name: '新名字',
      operationalStatus: 'temporarily_closed' as const,
    };
    expect(buildUpdateInput(changed, original)).toEqual({
      name: '新名字',
      operationalStatus: 'temporarily_closed',
    });
  });

  it('sends the point again when a coordinate changes', () => {
    expect(buildUpdateInput({ ...filled, latitude: '23.7' }, filled)).toEqual({
      geometry: { type: 'Point', coordinates: [121.42, 23.7] },
    });
  });
});
