import { describe, expect, it } from 'vitest';

import {
  householdActionsShown,
  householdFloorChoice,
  householdLocation,
} from './household-input';

describe('householdLocation', () => {
  it('files under the building without a point of its own', () => {
    expect(
      householdLocation({ buildingUuid: 'b1', floor: '3F', room: ' A ' }),
    ).toEqual({
      buildingMapUuid: 'b1',
      secondaryLocation: { locationType: 'address', floor: '3F', room: 'A' },
    });
  });

  it('sends no floor or room when the reporter knows neither', () => {
    expect(
      householdLocation({ buildingUuid: 'b1', floor: '', room: '  ' })
        .secondaryLocation,
    ).toEqual({ locationType: 'address', floor: null, room: null });
  });

  it('never sends geometry, which the backend rejects beside a building', () => {
    expect(
      'geometry' in
        householdLocation({ buildingUuid: 'b1', floor: '1F', room: '' }),
    ).toBe(false);
  });
});

describe('householdActionsShown', () => {
  it('offers 新增一戶 only when the page hands in a form and the user may add tickets', () => {
    expect(
      householdActionsShown({ canAddTicket: true, hasHandler: true }),
    ).toBe(true);
    expect(
      householdActionsShown({ canAddTicket: true, hasHandler: false }),
    ).toBe(false);
    expect(
      householdActionsShown({ canAddTicket: false, hasHandler: true }),
    ).toBe(false);
  });
});

describe('householdFloorChoice', () => {
  const labels = ['RF', '2F', '1F', 'B1'];

  it('offers the building floors in screen order, the stored floor read as one of them', () => {
    expect(householdFloorChoice('2樓', labels)).toEqual({
      value: '2F',
      options: ['B1', '1F', '2F', 'RF'],
    });
  });

  it('keeps a floor the building lacks as its own option, rather than turning it into unknown', () => {
    expect(householdFloorChoice('9F', labels)).toEqual({
      value: '9F',
      options: ['B1', '1F', '2F', 'RF', '9F'],
    });
  });

  it('reads no floor as unknown', () => {
    expect(householdFloorChoice(null, labels).value).toBe('');
  });
});
