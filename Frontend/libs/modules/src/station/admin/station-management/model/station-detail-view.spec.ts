import { describe, expect, it } from 'vitest';

import { toStationDetailView, type DetailStation } from './station-detail-view';

const station = {
  uuid: 's-1',
  name: '光復加水站',
  operationalStatus: 'temporarily_closed',
  source: 'official',
  pendingSuggestedFields: ['name', 'opHour'],
  contactName: '王小明',
  contactPhone: '0912345678',
  contactEmail: null,
  secondaryLocation: {
    county: '花蓮縣',
    city: '光復鄉',
    lane: '中正路',
    alley: null,
    no: '12號',
    floor: null,
    room: null,
  },
  properties: [
    { uuid: 'p-1', propertyName: '飲用水', quantity: 40, comment: null },
    { uuid: 'p-2', propertyName: '尿布', quantity: null, comment: '尚有存量' },
  ],
} as unknown as DetailStation;

describe('toStationDetailView', () => {
  it('summarises the station for the shared detail drawer', () => {
    expect(toStationDetailView(station, { canViewPii: true })).toMatchObject({
      title: '光復加水站',
      address: '花蓮縣光復鄉中正路12號',
      status: { label: '暫時關閉', tone: 'warning' },
      isOfficial: true,
      pendingFieldCount: 2,
    });
  });

  it('falls back when the station has no name or address', () => {
    const view = toStationDetailView(
      { ...station, name: null, secondaryLocation: null },
      { canViewPii: true },
    );
    expect(view.title).toBe('（未命名站點）');
    expect(view.address).toBe('未提供地址');
  });

  it('maps every operational status onto a drawer tone', () => {
    const tone = (operationalStatus: string) =>
      toStationDetailView(
        { ...station, operationalStatus },
        { canViewPii: true },
      ).status.tone;
    expect(tone('active')).toBe('active');
    expect(tone('temporarily_closed')).toBe('warning');
    expect(tone('permanently_closed')).toBe('inactive');
  });

  it('lists only the contact methods the station has', () => {
    expect(toStationDetailView(station, { canViewPii: true }).contact).toEqual({
      name: '王小明',
      note: '聯絡資訊僅後台可見',
      methods: [{ id: 'phone', value: '0912345678' }],
    });
  });

  it('says the contact values are masked without view_pii', () => {
    expect(
      toStationDetailView(station, { canViewPii: false }).contact.note,
    ).toBe('無個資權限，顯示遮罩值');
  });

  it('turns each resource into a tile, with its comment beside the quantity', () => {
    expect(
      toStationDetailView(station, { canViewPii: true }).resources,
    ).toEqual([
      { id: 'p-1', label: '飲用水', value: '40' },
      { id: 'p-2', label: '尿布', value: '—（尚有存量）' },
    ]);
  });
});
