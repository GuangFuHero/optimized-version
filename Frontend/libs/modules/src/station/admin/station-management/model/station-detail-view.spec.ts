import { describe, expect, it } from 'vitest';

import {
  readOnlyCaption,
  toStationDetailView,
  type DetailStation,
} from './station-detail-view';

const station = {
  uuid: 's-1',
  name: '光復加水站',
  type: 'water',
  geometry: { type: 'Point', coordinates: [121.42, 23.67] },
  verificationStatus: 'human_verified',
  createdAt: '2024-09-25T17:30:00Z',
  operationalStatus: 'temporarily_closed',
  source: 'official',
  pendingSuggestedFields: ['name', 'opHour'],
  contactName: '王小明',
  contactPhone: '0912345678',
  contactEmail: null,
  secondaryLocation: {
    fullAddress: '花蓮縣光復鄉中正路12號',
    county: '花蓮縣',
    town: '光復鄉',
    floor: null,
    room: null,
  },
  properties: [
    {
      uuid: 'p-1',
      propertyName: '飲用水',
      quantity: 40,
      comment: null,
    },
    {
      uuid: 'p-2',
      propertyName: '尿布',
      quantity: null,
      comment: '尚有存量',
    },
  ],
} as unknown as DetailStation;

describe('toStationDetailView', () => {
  it('summarises the station for the detail sheet', () => {
    expect(toStationDetailView(station, { canViewPii: true })).toMatchObject({
      title: '光復加水站',
      district: '花蓮縣光復鄉',
      address: '花蓮縣光復鄉中正路12號',
      coordinates: '23.670, 121.420',
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
    expect(view.district).toBe('—');
    expect(view.address).toBe('未提供地址');
  });

  it('has no coordinates without a point', () => {
    expect(
      toStationDetailView({ ...station, geometry: null }, { canViewPii: true })
        .coordinates,
    ).toBeNull();
  });

  it('reads the verification state', () => {
    const verification = (verificationStatus: string | null) =>
      toStationDetailView(
        { ...station, verificationStatus },
        { canViewPii: true },
      ).verification;
    expect(verification('human_verified')).toEqual({
      verified: true,
      label: '人工驗證',
    });
    expect(verification('ai_verified')).toEqual({
      verified: true,
      label: 'AI 驗證',
    });
    expect(verification('unverified')).toEqual({
      verified: false,
      label: '未驗證',
    });
    expect(verification(null)).toEqual({ verified: false, label: '未驗證' });
  });

  it('joins whichever of the contact name and phone the station has', () => {
    const contact = (patch: Partial<DetailStation>) =>
      toStationDetailView({ ...station, ...patch }, { canViewPii: true })
        .contact;
    expect(contact({})).toEqual({
      line: '王小明 ・ 0912345678',
      email: null,
      maskedNote: null,
    });
    expect(contact({ contactName: null }).line).toBe('0912345678');
    expect(contact({ contactPhone: null }).line).toBe('王小明');
    expect(contact({ contactName: null, contactPhone: null }).line).toBeNull();
    expect(contact({ contactEmail: 'a@b.tw' }).email).toBe('a@b.tw');
  });

  it('says the contact values are masked without view_pii', () => {
    expect(
      toStationDetailView(station, { canViewPii: false }).contact.maskedNote,
    ).toBe('無個資權限，顯示遮罩值');
  });

  it('dates the station in Taipei time', () => {
    expect(toStationDetailView(station, { canViewPii: true }).createdDate).toBe(
      '2024-09-26',
    );
    expect(
      toStationDetailView(
        { ...station, createdAt: null } as unknown as DetailStation,
        {
          canViewPii: true,
        },
      ).createdDate,
    ).toBe('—');
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

describe('readOnlyCaption', () => {
  it('names the team when the role edits stations, just not this one', () => {
    expect(
      readOnlyCaption({ canEditStations: true, teamName: '壯闊台灣' }),
    ).toBe('此站點未指派給 壯闊台灣，僅可檢視');
  });

  it('falls back to the role caption when the role edits no station', () => {
    expect(
      readOnlyCaption({ canEditStations: false, teamName: '壯闊台灣' }),
    ).toBe('此角色為唯讀檢視');
  });

  it('falls back to the role caption without a team to name', () => {
    expect(readOnlyCaption({ canEditStations: true, teamName: null })).toBe(
      '此角色為唯讀檢視',
    );
  });
});
