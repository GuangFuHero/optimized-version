import { describe, expect, it } from 'vitest';

import {
  applyReverseGeocode,
  buildCreateInput,
  buildUpdateInput,
  emptyStationForm,
  formPosition,
  stationToForm,
  validateStationForm,
} from './station-form-model';

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

describe('station form address', () => {
  const filled = {
    ...emptyStationForm([23.67, 121.42]),
    name: '光復加水站',
    type: 'water',
  };

  it('creates the station with its address as the secondary location', () => {
    const input = buildCreateInput({
      ...filled,
      county: ' 花蓮縣 ',
      city: '光復鄉',
      lane: '中正路',
    });
    expect(input.secondaryLocation).toEqual({
      locationType: 'address',
      county: '花蓮縣',
      city: '光復鄉',
      lane: '中正路',
    });
  });

  it('sends the pole fields only for a pole location', () => {
    const pole = { ...filled, poleId: 'P-12', poleType: '電桿' };
    expect(buildCreateInput(pole).secondaryLocation).toBeUndefined();
    expect(
      buildCreateInput({ ...pole, locationType: 'pole' }).secondaryLocation,
    ).toEqual({ locationType: 'pole', poleId: 'P-12', poleType: '電桿' });
  });

  it('leaves the secondary location out when no part of it is filled', () => {
    expect(buildCreateInput(filled)).not.toHaveProperty('secondaryLocation');
  });

  it('never sends the address on update, which the backend cannot change', () => {
    expect(buildUpdateInput({ ...filled, county: '台東縣' }, filled)).toEqual(
      {},
    );
  });

  it('reads the address back from a station', () => {
    const form = stationToForm({
      ...stationFixture,
      secondaryLocation: {
        county: '花蓮縣',
        city: '光復鄉',
        lane: null,
        alley: null,
        no: '12',
        floor: null,
        room: null,
        poleId: null,
        poleType: null,
        poleNote: null,
      },
    });
    expect(form).toMatchObject({
      county: '花蓮縣',
      city: '光復鄉',
      no: '12',
      lane: '',
      locationType: 'address',
    });
  });

  it('fills only the blank address parts from a reverse geocode', () => {
    const next = applyReverseGeocode(
      { ...filled, county: '花蓮縣' },
      {
        address: '台東縣池上鄉中山路 3 號',
        county: '台東縣',
        city: '池上鄉',
        lane: '中山路',
        alley: '',
        no: '3',
        floor: '',
        room: '',
      },
    );
    expect(next).toMatchObject({
      county: '花蓮縣',
      city: '池上鄉',
      lane: '中山路',
      no: '3',
    });
  });
});

describe('formPosition', () => {
  it('reads [lat, lng] only once both coordinates are valid', () => {
    const form = emptyStationForm([23.67, 121.42]);
    expect(formPosition(form)).toEqual([23.67, 121.42]);
    expect(formPosition({ ...form, longitude: '' })).toBeNull();
    expect(formPosition({ ...form, latitude: '91' })).toBeNull();
  });
});

const stationFixture = {
  uuid: 's-1',
  name: '光復加水站',
  type: 'water',
  description: null,
  opHour: null,
  operationalStatus: 'active',
  supplyStatus: null,
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  geometry: { type: 'Point', coordinates: [121.42, 23.67] },
  secondaryLocation: null,
} as unknown as Parameters<typeof stationToForm>[0];
