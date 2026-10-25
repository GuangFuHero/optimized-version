import { describe, expect, it } from 'vitest';

import {
  applyReverseGeocode,
  buildCreateInput,
  buildUpdateInput,
  emptyStationForm,
  formPosition,
  stationToForm,
  updateStationForm,
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
  const found = {
    status: 'found',
    fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
    floor: null,
    room: null,
    addressToken: 'token-1',
  };

  it('creates the station with its address line as the secondary location', () => {
    const input = buildCreateInput({
      ...filled,
      fullAddress: ' 花蓮縣光復鄉中正路一段31號 ',
      floor: '2F',
    });
    expect(input.secondaryLocation).toEqual({
      locationType: 'address',
      fullAddress: '花蓮縣光復鄉中正路一段31號',
      floor: '2F',
    });
  });

  it('sends the lookup token with the line it confirmed, so the backend stores it verified', () => {
    const form = applyReverseGeocode(filled, found);
    expect(buildCreateInput(form).secondaryLocation).toEqual({
      locationType: 'address',
      fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
      addressToken: 'token-1',
    });
  });

  it('drops the token once the line is edited, so the backend stores it unverified', () => {
    const form = updateStationForm(
      applyReverseGeocode(filled, found),
      'fullAddress',
      '花蓮縣光復鄉糖廠街21號',
    );
    expect(form.addressToken).toBe('');
    expect(buildCreateInput(form).secondaryLocation).toEqual({
      locationType: 'address',
      fullAddress: '花蓮縣光復鄉糖廠街21號',
    });
  });

  it('keeps the token while other fields change', () => {
    const form = updateStationForm(
      applyReverseGeocode(filled, found),
      'name',
      '新名字',
    );
    expect(form.addressToken).toBe('token-1');
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
    expect(
      buildUpdateInput({ ...filled, fullAddress: '台東縣池上鄉' }, filled),
    ).toEqual({});
  });

  it('reads the address line back from a station', () => {
    const form = stationToForm({
      ...stationFixture,
      secondaryLocation: {
        fullAddress: '花蓮縣光復鄉中正路12號',
        floor: '3F',
        room: null,
        poleId: null,
        poleType: null,
        poleNote: null,
      },
    });
    expect(form).toMatchObject({
      fullAddress: '花蓮縣光復鄉中正路12號',
      floor: '3F',
      room: '',
      addressToken: '',
      locationType: 'address',
    });
  });

  it('fills the line and its token from a lookup only while the line is blank', () => {
    expect(applyReverseGeocode(filled, found)).toMatchObject({
      fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
      addressToken: 'token-1',
    });
    const typed = { ...filled, fullAddress: '我打的地址' };
    expect(applyReverseGeocode(typed, found)).toEqual(typed);
  });

  it('fills a 樓 or 室 the lookup split off, unless one is already typed', () => {
    const next = applyReverseGeocode(
      { ...filled, floor: '1F' },
      { ...found, floor: '5樓', room: '502室' },
    );
    expect(next).toMatchObject({ floor: '1F', room: '502室' });
  });

  it('ignores a lookup that found nothing', () => {
    expect(
      applyReverseGeocode(filled, {
        status: 'not_found',
        fullAddress: null,
        floor: null,
        room: null,
        addressToken: null,
      }),
    ).toEqual(filled);
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
