import { describe, expect, it } from 'vitest';

import {
  adminTicketHref,
  disasterDetailRows,
  ticketDetailState,
  toTicketDetailView,
  type DetailTicket,
} from './ticket-detail-view';

const ticket = {
  uuid: 't-1',
  title: '家中淹水需要清淤',
  description: '一樓積水約 30 公分',
  status: 'pending',
  priority: 'high',
  auditStatus: 'need_audit',
  contactName: '王小明',
  contactPhone: '0912345678',
  contactEmail: null,
  disasterTypes: ['flood'],
  disasterDetails: [{ uuid: 'd-1', propertyName: '積水深度', value: '30cm' }],
  locationCell: null,
  updatedAt: '2026-10-21T08:30:00.123456+00:00',
  secondaryLocation: {
    fullAddress: '花蓮縣光復鄉中正路12號',
    county: '花蓮縣',
    town: '光復鄉',
    floor: null,
    room: null,
  },
  photos: [],
  tasks: [],
} as unknown as DetailTicket;

const LABELS = { flood: '水災' };

describe('adminTicketHref', () => {
  it('builds the deep link', () => {
    expect(adminTicketHref('a b')).toBe('/tickets?ticket=a%20b');
  });
});

describe('ticketDetailState', () => {
  it('treats a null ticket as missing', () => {
    expect(
      ticketDetailState({
        isPending: false,
        error: null,
        data: { ticket: null },
      }),
    ).toBe('missing');
    expect(ticketDetailState({ isPending: true, error: null })).toBe('loading');
  });

  it('treats an error with no ticket loaded as failed', () => {
    expect(ticketDetailState({ isPending: false, error: new Error('x') })).toBe(
      'failed',
    );
  });

  it('never keeps loading once the query has failed', () => {
    // A failed query with retries left can still report isPending.
    expect(ticketDetailState({ isPending: true, error: new Error('x') })).toBe(
      'failed',
    );
  });

  it('is ready with a ticket', () => {
    expect(
      ticketDetailState({ isPending: false, error: null, data: { ticket } }),
    ).toBe('ready');
  });

  it('stays ready when a background refetch fails with the ticket still loaded', () => {
    expect(
      ticketDetailState({
        isPending: false,
        error: new Error('network'),
        data: { ticket },
      }),
    ).toBe('ready');
  });
});

describe('toTicketDetailView', () => {
  it('summarises the ticket for the drawer', () => {
    expect(toTicketDetailView(ticket, LABELS)).toMatchObject({
      title: '家中淹水需要清淤',
      statusLabel: '待處理',
      priorityLabel: '緊急',
      auditLabel: '待審核',
      description: '一樓積水約 30 公分',
      contact: { name: '王小明', phone: '0912345678', email: null },
      disasterDetails: [{ label: '積水深度', value: '30cm' }],
      detailHidden: false,
    });
  });

  it('hides the address of a coarse ticket', () => {
    const view = toTicketDetailView(
      { ...ticket, locationCell: '8a4ba0a6c4a7fff', secondaryLocation: null },
      LABELS,
    );
    expect(view.location).toEqual({ kind: 'coarse' });
    expect(view.detailHidden).toBe(true);
  });

  it('has no contact on a coarse ticket, whatever the contact fields hold', () => {
    const view = toTicketDetailView(
      { ...ticket, locationCell: '8a4ba0a6c4a7fff', secondaryLocation: null },
      LABELS,
    );
    expect(view.contact).toBeNull();
  });

  it('shows address with floor and room', () => {
    const view = toTicketDetailView(
      {
        ...ticket,
        secondaryLocation: {
          ...ticket.secondaryLocation,
          fullAddress: '花蓮縣光復鄉中正路12號',
          floor: '3樓',
          room: '2室',
        },
      } as DetailTicket,
      LABELS,
    );
    expect(view.location).toEqual({
      kind: 'exact',
      address: '花蓮縣光復鄉中正路12號',
      floorRoom: '3樓 2室',
    });
  });

  it('has no floorRoom without floor or room', () => {
    expect(toTicketDetailView(ticket, LABELS).location).toEqual({
      kind: 'exact',
      address: '花蓮縣光復鄉中正路12號',
      floorRoom: null,
    });
  });

  it('has no contact when every contact field is empty', () => {
    const view = toTicketDetailView(
      { ...ticket, contactName: ' ', contactPhone: null, contactEmail: '' },
      LABELS,
    );
    expect(view.contact).toBeNull();
  });

  it('labels disaster types and falls back to the key', () => {
    const view = toTicketDetailView(
      { ...ticket, disasterTypes: ['flood', 'x'] },
      LABELS,
    );
    expect(view.disasterLabels).toEqual(['水災', 'x']);
  });

  it('passes updatedAt through untouched', () => {
    expect(toTicketDetailView(ticket, LABELS).updatedAt).toBe(
      '2026-10-21T08:30:00.123456+00:00',
    );
  });

  it('falls back when the ticket has no title or description', () => {
    const view = toTicketDetailView(
      { ...ticket, title: '  ', description: ' ' },
      LABELS,
    );
    expect(view.title).toBe('（未命名求助單）');
    expect(view.description).toBeNull();
  });
});

describe('disasterDetailRows', () => {
  const configs = [
    {
      propertyName: 'water_depth',
      displayLabel: '積水深度',
      dataType: 'number' as const,
      unit: 'cm',
    },
    {
      propertyName: 'hazards',
      displayLabel: '現場危險',
      dataType: 'multi_select' as const,
      unit: null,
    },
  ];

  it('labels a field by its config and gives a number its unit', () => {
    expect(
      disasterDetailRows(
        [{ propertyName: 'water_depth', value: '30' }],
        configs,
      ),
    ).toEqual([{ label: '積水深度', value: '30 cm' }]);
  });

  it('groups a multi-select under one label, in first-seen order', () => {
    expect(
      disasterDetailRows(
        [
          { propertyName: 'hazards', value: '漏電' },
          { propertyName: 'water_depth', value: '30' },
          { propertyName: 'hazards', value: '瓦斯味' },
        ],
        configs,
      ),
    ).toEqual([
      { label: '現場危險', value: '漏電、瓦斯味' },
      { label: '積水深度', value: '30 cm' },
    ]);
  });

  it('falls back to the key when no config is loaded for the field', () => {
    expect(
      disasterDetailRows([{ propertyName: 'road_blocked', value: 'true' }], []),
    ).toEqual([{ label: 'road_blocked', value: 'true' }]);
  });
});
