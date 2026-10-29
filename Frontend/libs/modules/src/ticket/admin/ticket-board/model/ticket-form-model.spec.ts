import { describe, expect, it } from 'vitest';

import { applyReverseGeocode } from '../../../../admin/shared/model/address-fill';
import {
  acknowledgeSuspects,
  changedUpdateInput,
  emptyTicketForm,
  photoChanges,
  ticketFormErrorSummary,
  ticketFormFromTicket,
  toCreateTicketInput,
  toUpdateTicketInput,
  updateTicketForm,
  validateTicketForm,
  type TicketFormValues,
} from './ticket-form-model';
import type { DetailTicket } from './ticket-detail-view';

const need = (over: Partial<TicketFormValues['needs'][number]> = {}) => ({
  taskType: 'supply',
  taskName: '飲用水',
  quantity: '3',
  description: '',
  ...over,
});

const filled: TicketFormValues = {
  ...emptyTicketForm(),
  title: '家中淹水需要清淤',
  contactName: '王小明',
  point: { lat: 25, lng: 121.5, source: 'manual' },
  needs: [need()],
};

describe('emptyTicketForm', () => {
  it('starts at medium priority with one empty rescue need', () => {
    const form = emptyTicketForm();
    expect(form.priority).toBe('medium');
    expect(form.needs).toEqual([
      { taskType: 'rescue', taskName: '', quantity: '', description: '' },
    ]);
    expect(form.point).toBeNull();
    expect(form.photoUrls).toEqual([]);
  });

  it('pins a seed point picked on the map, marked as the seed', () => {
    const form = emptyTicketForm({ lat: 23.65, lng: 121.42 });
    expect(form.point).toEqual({ lat: 23.65, lng: 121.42, source: 'seed' });
    expect(form.fullAddress).toBe('');
    expect(validateTicketForm(form, 'create').point).toBeUndefined();
  });
});

describe('validateTicketForm', () => {
  it('requires title, contact name, a point and at least one need on create', () => {
    expect(
      Object.keys(validateTicketForm(emptyTicketForm(), 'create')).sort(),
    ).toEqual(['contactName', 'needs', 'point', 'title']);
    expect(validateTicketForm(filled, 'create')).toEqual({});
  });

  it('does not require point, contact or needs on edit', () => {
    const blank = { ...emptyTicketForm(), needs: [] };
    expect(Object.keys(validateTicketForm(blank, 'edit'))).toEqual(['title']);
    expect(validateTicketForm({ ...blank, title: '標題' }, 'edit')).toEqual({});
  });

  it('caps the title at 200 characters', () => {
    expect(
      validateTicketForm({ ...filled, title: 'a'.repeat(201) }, 'create').title,
    ).toBeTruthy();
    expect(
      validateTicketForm({ ...filled, title: 'a'.repeat(200) }, 'create').title,
    ).toBeUndefined();
  });

  it('counts the title in code points, as the backend does', () => {
    // Each emoji is one code point but two UTF-16 units.
    expect(
      validateTicketForm({ ...filled, title: '🌊'.repeat(200) }, 'create')
        .title,
    ).toBeUndefined();
    expect(
      validateTicketForm({ ...filled, title: '🌊'.repeat(201) }, 'create')
        .title,
    ).toBeTruthy();
  });

  it('requires quantity except for rescue', () => {
    const check = (n: ReturnType<typeof need>) =>
      validateTicketForm({ ...filled, needs: [n] }, 'create');
    expect(
      Object.keys(check(need({ taskType: 'supply', quantity: '' }))),
    ).toEqual(['needs.0.quantity']);
    expect(check(need({ taskType: 'rescue', quantity: '' }))).toEqual({});
    expect(
      Object.keys(check(need({ taskType: 'rescue', quantity: '0' }))),
    ).toEqual(['needs.0.quantity']);
  });

  it('asks a started need for its name', () => {
    const errors = validateTicketForm(
      { ...filled, needs: [need(), need({ taskName: '', quantity: '2' })] },
      'create',
    );
    expect(Object.keys(errors)).toEqual(['needs.1.taskName']);
  });

  it('refuses more than 20 needs and more than 10 photos', () => {
    expect(
      validateTicketForm(
        { ...filled, needs: Array.from({ length: 21 }, () => need()) },
        'create',
      ).needs,
    ).toBeTruthy();
    expect(
      validateTicketForm(
        { ...filled, needs: Array.from({ length: 20 }, () => need()) },
        'create',
      ).needs,
    ).toBeUndefined();
    const photos = Array.from({ length: 11 }, (_, i) => `https://x/${i}.jpg`);
    expect(
      validateTicketForm({ ...filled, photoUrls: photos }, 'create').photoUrls,
    ).toBeTruthy();
    expect(
      validateTicketForm({ ...filled, photoUrls: photos }, 'edit').photoUrls,
    ).toBeTruthy();
  });
});

describe('toCreateTicketInput', () => {
  it('builds the create input', () => {
    const input = toCreateTicketInput({
      ...filled,
      description: '  一樓積水  ',
      disasterTypes: ['flood'],
      contactPhone: '0912345678',
      fullAddress: '花蓮縣光復鄉中正路12號',
      floor: '2F',
      room: ' ',
      photoUrls: ['https://a.jpg', 'https://b.jpg'],
      needs: [
        need({ quantity: '3' }),
        need({ taskType: 'rescue', taskName: '受困', quantity: '' }),
      ],
    });
    expect(input).toEqual({
      title: '家中淹水需要清淤',
      description: '一樓積水',
      priority: 'medium',
      disasterTypes: ['flood'],
      contactName: '王小明',
      contactPhone: '0912345678',
      geometry: { type: 'Point', coordinates: [121.5, 25] },
      secondaryLocation: { fullAddress: '花蓮縣光復鄉中正路12號', floor: '2F' },
      photoUrls: ['https://a.jpg', 'https://b.jpg'],
      tasks: [
        {
          taskType: 'supply',
          taskName: '飲用水',
          quantity: 3,
          taskDescription: null,
        },
        {
          taskType: 'rescue',
          taskName: '受困',
          quantity: null,
          taskDescription: null,
        },
      ],
    });
  });

  it('leaves out an untouched need row and a blank address', () => {
    const input = toCreateTicketInput({
      ...filled,
      needs: [need(), need({ taskType: 'rescue', taskName: '', quantity: '' })],
    });
    expect(input.tasks).toHaveLength(1);
    expect(input).not.toHaveProperty('secondaryLocation');
    expect(input).not.toHaveProperty('contactEmail');
  });

  it('acknowledges confirmed duplicates per need', () => {
    const input = toCreateTicketInput(
      { ...filled, needs: [need(), need({ taskName: '泡麵' })] },
      new Map([[1, 't9']]),
    );
    expect(input.tasks?.[1]?.acknowledgedDuplicateOf).toBe('t9');
    expect(input.tasks?.[0]).not.toHaveProperty('acknowledgedDuplicateOf');
  });
});

describe('a household in a space (BE-036)', () => {
  const space = { uuid: 'b1', name: '林森61', floorLabels: ['RF', '3F', '1F'] };
  const household: TicketFormValues = {
    ...filled,
    point: null,
    fullAddress: '',
    floor: '3F',
    room: ' A ',
  };

  it('needs no point: the space has one', () => {
    expect(
      validateTicketForm(household, 'create', space).point,
    ).toBeUndefined();
    expect(validateTicketForm(household, 'create').point).toBeDefined();
  });

  it('files under the space with its floor and 戶別, and no point of its own', () => {
    const input = toCreateTicketInput(household, new Map(), space);

    expect(input.buildingMapUuid).toBe('b1');
    expect(input.secondaryLocation).toEqual({
      locationType: 'address',
      floor: '3F',
      room: 'A',
    });
    expect('geometry' in input).toBe(false);
  });

  it('never sends a point or an address, even one left from a pin', () => {
    const input = toCreateTicketInput(
      {
        ...household,
        point: { lat: 25, lng: 121.5, source: 'manual' },
        fullAddress: '花蓮縣光復鄉林森路61號',
        floor: '',
      },
      new Map(),
      space,
    );

    expect('geometry' in input).toBe(false);
    expect(input.secondaryLocation).toEqual({
      locationType: 'address',
      floor: null,
      room: 'A',
    });
  });

  it('still carries the duplicate acknowledgements', () => {
    const input = toCreateTicketInput(
      household,
      new Map([[0, 'other']]),
      space,
    );

    expect(input.tasks?.[0]?.acknowledgedDuplicateOf).toBe('other');
  });
});

describe('acknowledgeSuspects', () => {
  it('adds one suspect per need and skips the ticket-level ones', () => {
    const acked = acknowledgeSuspects(new Map([[0, 'old']]), [
      { draftIndex: 1, relatedUuid: 'a', relatedTicketUuid: null },
      { draftIndex: 1, relatedUuid: 'b', relatedTicketUuid: null },
      { draftIndex: -1, relatedUuid: 't', relatedTicketUuid: 't' },
    ]);
    expect([...acked]).toEqual([
      [0, 'old'],
      [1, 'a'],
    ]);
  });
});

describe('acknowledgeSuspects on a second hold', () => {
  it('replaces an earlier acknowledgement for the same need', () => {
    const first = acknowledgeSuspects(new Map(), [
      { draftIndex: 0, relatedUuid: 'old', relatedTicketUuid: null },
    ]);
    const second = acknowledgeSuspects(first, [
      { draftIndex: 0, relatedUuid: 'new', relatedTicketUuid: null },
    ]);
    expect([...second]).toEqual([[0, 'new']]);
  });
});

describe('toUpdateTicketInput', () => {
  it('builds an update input without contact or geometry', () => {
    const input = toUpdateTicketInput({
      ...filled,
      contactEmail: 'a@b.c',
      fullAddress: '花蓮縣光復鄉中正路12號',
    });
    for (const key of Object.keys(input)) {
      expect([
        'priority',
        'title',
        'description',
        'disasterTypes',
        'secondaryLocation',
      ]).toContain(key);
    }
    expect(input).toMatchObject({
      title: '家中淹水需要清淤',
      priority: 'medium',
      description: null,
      disasterTypes: [],
      secondaryLocation: { fullAddress: '花蓮縣光復鄉中正路12號' },
    });
  });

  const stored = {
    uuid: 't-1',
    locationCell: null,
    secondaryLocation: {
      fullAddress: '中正路12號',
      floor: '2F',
      room: null,
      locationType: 'address',
      buildingSection: 'A棟',
      victimSpace: '主臥衣櫃',
      accessStatus: 'restricted',
      landmarkNote: null,
      spaceDescription: null,
      poleId: null,
      poleType: null,
      poleNote: null,
    },
  } as unknown as DetailTicket;
  const coarse = {
    ...stored,
    locationCell: '8a4b1',
    secondaryLocation: null,
  } as unknown as DetailTicket;

  it('sends only what changed', () => {
    const changed = { ...filled, priority: 'critical' as const };
    expect(changedUpdateInput(changed, filled, stored)).toEqual({
      priority: 'critical',
    });
    expect(changedUpdateInput(filled, filled, stored)).toEqual({});
  });

  it('keeps the address members the form does not show when the address is edited', () => {
    const before = { ...filled, fullAddress: '中正路12號', floor: '2F' };
    const input = changedUpdateInput(
      { ...before, floor: '3F' },
      before,
      stored,
    );
    expect(input.secondaryLocation).toEqual({
      fullAddress: '中正路12號',
      floor: '3F',
      locationType: 'address',
      buildingSection: 'A棟',
      victimSpace: '主臥衣櫃',
      accessStatus: 'restricted',
    });
  });

  it('sends null for a cleared description and [] for cleared disaster types', () => {
    const before = {
      ...filled,
      description: '一樓積水',
      disasterTypes: ['flood', 'landslide'],
    };
    expect(
      changedUpdateInput(
        { ...before, description: '  ', disasterTypes: [] },
        before,
        stored,
      ),
    ).toEqual({ description: null, disasterTypes: [] });
  });

  it('resends a cleared address as the carried members alone, with no fullAddress', () => {
    const before = { ...filled, fullAddress: '中正路12號', floor: '2F' };
    const input = changedUpdateInput(
      { ...before, fullAddress: '', floor: '', room: '' },
      before,
      stored,
    );
    expect(input).toEqual({
      secondaryLocation: {
        locationType: 'address',
        buildingSection: 'A棟',
        victimSpace: '主臥衣櫃',
        accessStatus: 'restricted',
      },
    });
  });

  it('never sends the description or address of a coarse ticket', () => {
    const before = { ...filled, description: '' };
    const input = changedUpdateInput(
      {
        ...before,
        description: '新的說明',
        fullAddress: '別的地址',
        priority: 'high',
      },
      before,
      coarse,
    );
    expect(input).toEqual({ priority: 'high' });
  });
});

describe('ticketFormFromTicket', () => {
  it('reads the ticket into the form', () => {
    const form = ticketFormFromTicket({
      uuid: 't-1',
      title: '家中淹水',
      description: null,
      priority: 'high',
      disasterTypes: ['flood'],
      contactName: '王小明',
      contactPhone: null,
      contactEmail: null,
      geometry: { type: 'Point', coordinates: [121.5, 25] },
      secondaryLocation: { fullAddress: '中正路12號', floor: null, room: '3' },
      photos: [{ uuid: 'p1', url: 'https://a.jpg', createdAt: null }],
      tasks: [],
    } as unknown as DetailTicket);
    expect(form).toMatchObject({
      title: '家中淹水',
      description: '',
      priority: 'high',
      disasterTypes: ['flood'],
      contactName: '王小明',
      contactPhone: '',
      point: { lat: 25, lng: 121.5, source: 'seed' },
      fullAddress: '中正路12號',
      floor: '',
      room: '3',
      photoUrls: ['https://a.jpg'],
      needs: [],
    });
  });
});

describe('photoChanges', () => {
  it('diffs photos as a multiset', () => {
    expect(
      photoChanges(
        [
          { uuid: 'p1', url: 'A' },
          { uuid: 'p2', url: 'A' },
        ],
        ['A', 'B'],
      ),
    ).toEqual({ attach: ['B'], detach: ['p2'] });
  });

  it('detaches every photo when all are removed', () => {
    expect(
      photoChanges(
        [
          { uuid: 'p1', url: 'A' },
          { uuid: 'p2', url: 'B' },
        ],
        [],
      ),
    ).toEqual({ attach: [], detach: ['p1', 'p2'] });
  });

  it('keeps everything when nothing moved', () => {
    expect(photoChanges([{ uuid: 'p1', url: 'A' }], ['A'])).toEqual({
      attach: [],
      detach: [],
    });
  });
});

describe('applyReverseGeocode', () => {
  const found = {
    status: 'found',
    fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
    floor: '2樓',
    room: null,
    addressToken: 'token-1',
  } as const;

  it('fills a blank address with the line, its token and the floor it split off', () => {
    const form = applyReverseGeocode(filled, found);
    expect(form).toMatchObject({
      fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
      addressToken: 'token-1',
      floor: '2樓',
      room: '',
    });
    expect(toCreateTicketInput(form).secondaryLocation).toEqual({
      fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
      floor: '2樓',
      addressToken: 'token-1',
    });
  });

  it('never replaces a typed line or a typed floor', () => {
    const typed = { ...filled, fullAddress: '中正路12號', floor: '5樓' };
    expect(applyReverseGeocode(typed, found)).toBe(typed);
    const floorOnly = applyReverseGeocode({ ...filled, floor: '5樓' }, found);
    expect(floorOnly.floor).toBe('5樓');
  });

  it("keeps an earlier pin's line when the pin moves, as the station form does", () => {
    const first = applyReverseGeocode(filled, found);
    const moved = applyReverseGeocode(first, {
      ...found,
      fullAddress: '花蓮縣光復鄉糖廠街21號',
      addressToken: 'token-2',
    });
    expect(moved).toBe(first);
    expect(moved).toMatchObject({
      fullAddress: '花蓮縣光復鄉大進村3鄰糖廠街19號',
      addressToken: 'token-1',
    });
  });

  it('leaves the form alone when nothing was found or the lookup is unavailable', () => {
    for (const status of ['not_found', 'unavailable']) {
      const lookup = {
        ...found,
        status,
        fullAddress: null,
        addressToken: null,
      };
      expect(applyReverseGeocode(filled, lookup)).toBe(filled);
    }
  });
});

describe('updateTicketForm', () => {
  const looked = {
    ...filled,
    fullAddress: '花蓮縣光復鄉糖廠街19號',
    addressToken: 'token-1',
  };

  it('drops the token once the line is edited, so the backend stores it unverified', () => {
    const form = updateTicketForm(looked, {
      fullAddress: '花蓮縣光復鄉糖廠街21號',
    });
    expect(form.addressToken).toBe('');
    expect(toCreateTicketInput(form).secondaryLocation).toEqual({
      fullAddress: '花蓮縣光復鄉糖廠街21號',
    });
  });

  it('keeps the token while other fields change', () => {
    expect(updateTicketForm(looked, { room: '3' }).addressToken).toBe(
      'token-1',
    );
  });

  it('keeps the line but drops its token when the pin moves, so it is saved unverified', () => {
    const form = updateTicketForm(looked, {
      point: { lat: 25.001, lng: 121.5, source: 'manual' },
    });
    expect(form).toMatchObject({
      fullAddress: '花蓮縣光復鄉糖廠街19號',
      addressToken: '',
    });
    expect(toCreateTicketInput(form).secondaryLocation).toEqual({
      fullAddress: '花蓮縣光復鄉糖廠街19號',
    });
  });

  it('keeps the token when the pin is set to the point it already had', () => {
    expect(
      updateTicketForm(looked, {
        point: { lat: 25, lng: 121.5, source: 'gps' },
      }).addressToken,
    ).toBe('token-1');
  });
});

describe('ticketFormErrorSummary', () => {
  it("names each field with an error once, in the form's order", () => {
    expect(
      ticketFormErrorSummary(
        validateTicketForm(
          { ...emptyTicketForm(), needs: [need({ taskName: '' })] },
          'create',
        ),
      ),
    ).toEqual(['任務標題', '地標', '現場聯絡人', '需求']);
  });

  it('counts several need errors as one 需求', () => {
    expect(
      ticketFormErrorSummary({
        'needs.0.taskName': '請填寫需求名稱',
        'needs.1.quantity': '請填寫數量',
      }),
    ).toEqual(['需求']);
  });

  it('is empty for a form that passes', () => {
    expect(ticketFormErrorSummary({})).toEqual([]);
  });
});
