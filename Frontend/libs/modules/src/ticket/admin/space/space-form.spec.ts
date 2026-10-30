import type { AdminBuildingMapFieldsFragment } from '@rescue-frontend/data-access/admin';
import { describe, expect, it } from 'vitest';

import { floorLabelsFor } from './floors';
import type { SpaceTicket } from './space-analysis';
import {
  emptySpaceForm,
  nearbySpace,
  spaceFormErrors,
  strandedTickets,
  toCreateBuildingMapInput,
  toUpdateBuildingMapInput,
  type SpaceFormValues,
} from './space-form';

function valid(): SpaceFormValues {
  return {
    ...emptySpaceForm(),
    pin: { lat: 23.6, lng: 121.4 },
    address: '花蓮縣光復鄉中正路二段120號',
    name: '中正路社區大樓',
    above: '12',
    below: '0',
  };
}

function building(
  overrides: Partial<AdminBuildingMapFieldsFragment> = {},
): AdminBuildingMapFieldsFragment {
  return {
    uuid: 'b1',
    name: '中正路社區大樓',
    geometry: { type: 'Point', coordinates: [121.4, 23.6] },
    floorsAboveGround: 12,
    floorsBelowGround: 0,
    createdAt: null,
    updatedAt: null,
    floors: [],
    secondaryLocation: null,
    ...overrides,
  };
}

let serial = 0;
function ticket(floor: string | null): SpaceTicket {
  serial += 1;
  return {
    uuid: `t${serial}`,
    propertyName: `T-${serial}`,
    title: '受困',
    status: 'pending',
    priority: 'low',
    disasterTypes: [],
    updatedAt: null,
    secondaryLocation: { floor, room: null },
    tasks: [],
  };
}

describe('spaceFormErrors', () => {
  it('passes a complete form', () => {
    expect(spaceFormErrors(valid(), 'create')).toEqual({});
  });

  it('asks for the pin and the address when creating', () => {
    expect(
      spaceFormErrors({ ...valid(), pin: null, address: ' ' }, 'create'),
    ).toEqual({ pin: '請在地圖上點那棟建築', address: '必填' });
  });

  it('asks for neither when editing', () => {
    expect(
      spaceFormErrors({ ...valid(), pin: null, address: '' }, 'edit'),
    ).toEqual({});
  });

  it('counts the name in characters, so 100 CJK characters pass', () => {
    expect(
      spaceFormErrors({ ...valid(), name: '樓'.repeat(100) }, 'create').name,
    ).toBeUndefined();
  });

  it('rejects 101 characters', () => {
    expect(
      spaceFormErrors({ ...valid(), name: '樓'.repeat(101) }, 'create').name,
    ).toBe('最多 100 個字');
  });

  it('requires a name', () => {
    expect(spaceFormErrors({ ...valid(), name: '  ' }, 'create').name).toBe(
      '必填',
    );
  });

  it.each(['0', '201', '', '2.5', '-1'])(
    'rejects %j floors above ground',
    (above) => {
      expect(spaceFormErrors({ ...valid(), above }, 'create').above).toBe(
        '請填 1 到 200',
      );
    },
  );

  it('accepts 1 and 200 floors above ground', () => {
    expect(
      spaceFormErrors({ ...valid(), above: '1' }, 'create').above,
    ).toBeUndefined();
    expect(
      spaceFormErrors({ ...valid(), above: '200' }, 'create').above,
    ).toBeUndefined();
  });

  it('reads a blank basement count as 0', () => {
    expect(
      spaceFormErrors({ ...valid(), below: '' }, 'create').below,
    ).toBeUndefined();
  });

  it('rejects 21 basements', () => {
    expect(spaceFormErrors({ ...valid(), below: '21' }, 'create').below).toBe(
      '請填 0 到 20',
    );
  });
});

describe('toCreateBuildingMapInput', () => {
  it('builds the create input with an unverified address', () => {
    expect(toCreateBuildingMapInput(valid())).toEqual({
      name: '中正路社區大樓',
      geometry: { type: 'Point', coordinates: [121.4, 23.6] },
      secondaryLocation: {
        locationType: 'address',
        fullAddress: '花蓮縣光復鄉中正路二段120號',
        addressToken: null,
      },
      floorsAboveGround: 12,
      floorsBelowGround: 0,
      floorAreas: [],
    });
  });

  it('sends the token while the line is still the lookup’s', () => {
    const line = '花蓮縣光復鄉中正路二段120號';
    const input = toCreateBuildingMapInput({
      ...valid(),
      address: line,
      addressFilled: {
        fullAddress: line,
        token: 'tok',
        lat: 23.6,
        lng: 121.4,
        from: 'pin',
      },
    });

    expect(input.secondaryLocation.addressToken).toBe('tok');
  });

  it('refuses an invalid form', () => {
    expect(() => toCreateBuildingMapInput({ ...valid(), name: '' })).toThrow();
  });
});

describe('toUpdateBuildingMapInput', () => {
  it('sends only what changed', () => {
    expect(
      toUpdateBuildingMapInput(building({ name: 'A', floorsAboveGround: 12 }), {
        ...valid(),
        name: 'A',
        above: '10',
      }),
    ).toEqual({ floorsAboveGround: 10 });
  });

  it('trims the name before comparing', () => {
    expect(
      toUpdateBuildingMapInput(building({ name: 'A' }), {
        ...valid(),
        name: ' A ',
      }),
    ).toEqual({});
  });

  it('sends a new basement count', () => {
    expect(
      toUpdateBuildingMapInput(building(), {
        ...valid(),
        name: '中正路社區大樓',
        below: '2',
      }),
    ).toEqual({ floorsBelowGround: 2 });
  });
});

describe('nearbySpace', () => {
  it('warns about a space about 20 m away', () => {
    expect(
      nearbySpace({ lat: 23.6, lng: 121.4 }, [
        { id: 'x', name: '宏福苑', lngLat: [121.400196, 23.6] },
      ]),
    ).toEqual({ name: '宏福苑', metres: 20 });
  });

  it('says nothing beyond 30 m', () => {
    expect(
      nearbySpace({ lat: 23.6, lng: 121.4 }, [
        { id: 'x', name: '宏福苑', lngLat: [121.4004, 23.6] },
      ]),
    ).toBeNull();
  });

  it('names the closest of several', () => {
    expect(
      nearbySpace({ lat: 23.6, lng: 121.4 }, [
        { id: 'a', name: '遠', lngLat: [121.400196, 23.6] },
        { id: 'b', name: '近', lngLat: [121.4001, 23.6] },
      ])?.name,
    ).toBe('近');
  });

  it('ignores the space being edited and spaces without a point', () => {
    expect(
      nearbySpace(
        { lat: 23.6, lng: 121.4 },
        [
          { id: 'x', name: 'A', lngLat: [121.4, 23.6] },
          { id: 'y', name: 'B', lngLat: null },
        ],
        'x',
      ),
    ).toBeNull();
  });

  it('says nothing without a pin', () => {
    expect(
      nearbySpace(null, [{ id: 'x', name: 'A', lngLat: [121.4, 23.6] }]),
    ).toBeNull();
  });
});

describe('strandedTickets', () => {
  it('names tickets on floors that go away', () => {
    const seventh = ticket('7F');

    expect(
      strandedTickets(floorLabelsFor(8, 0), 5, 0, [
        seventh,
        ticket(null),
        ticket('3F'),
      ]),
    ).toEqual([{ ticket: seventh, floor: '7F' }]);
  });

  it('names a removed basement', () => {
    const basement = ticket('地下2');

    expect(strandedTickets(floorLabelsFor(3, 2), 3, 1, [basement])).toEqual([
      { ticket: basement, floor: 'B2' },
    ]);
  });

  it('strands nothing when floors are added', () => {
    expect(strandedTickets(floorLabelsFor(5, 0), 8, 1, [ticket('3F')])).toEqual(
      [],
    );
  });

  it('leaves out a ticket already off the list', () => {
    expect(strandedTickets(floorLabelsFor(5, 0), 3, 0, [ticket('9F')])).toEqual(
      [],
    );
  });
});
