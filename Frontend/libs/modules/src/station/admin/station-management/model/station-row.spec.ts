import type { AdminStationFieldsFragment } from '@rescue-frontend/data-access/admin';
import { describe, expect, it } from 'vitest';

import { toStationRow } from './station-row';

const base = {
  __typename: 'StationType',
  uuid: 's1',
  type: 'water',
  name: '光復加水站',
  description: null,
  geometry: { type: 'Point', coordinates: [121.42, 23.67] },
  opHour: null,
  level: 0,
  comment: null,
  source: 'official',
  visibility: 'public',
  verificationStatus: null,
  operationalStatus: 'active',
  statusChangedAt: null,
  supplyStatus: null,
  pendingSuggestedFields: ['name', 'op_hour'],
  isDuplicate: false,
  isTemporary: false,
  isOfficial: false,
  createdBy: null,
  createdAt: null,
  updatedAt: '2026-10-21T00:00:00Z',
  assignedTeam: {
    __typename: 'AssignedTeamType',
    uuid: 't1',
    name: '慈濟',
    type: 'ngo',
  },
  secondaryLocation: {
    __typename: 'SecondaryLocationType',
    county: '花蓮縣',
    city: '光復鄉',
  },
} as unknown as AdminStationFieldsFragment;

describe('toStationRow', () => {
  it('maps a full station', () => {
    expect(toStationRow(base)).toMatchObject({
      uuid: 's1',
      name: '光復加水站',
      typeLabel: '加水',
      area: '花蓮縣光復鄉',
      teamName: '慈濟',
      isOfficial: true,
      position: [23.67, 121.42],
      pendingFieldCount: 2,
    });
  });

  it('survives nulls', () => {
    const row = toStationRow({
      ...base,
      name: null,
      type: null,
      geometry: null,
      assignedTeam: null,
      secondaryLocation: null,
      source: 'user',
      updatedAt: null,
      pendingSuggestedFields: [],
    } as unknown as AdminStationFieldsFragment);
    expect(row).toMatchObject({
      name: '（未命名站點）',
      typeLabel: '站點',
      area: '',
      teamName: null,
      isOfficial: false,
      position: null,
      pendingFieldCount: 0,
    });
  });
});
