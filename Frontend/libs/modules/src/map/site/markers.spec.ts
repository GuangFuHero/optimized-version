import { describe, expect, it } from 'vitest';

import type { TicketNeed } from '../../ticket/needs/need-claim';
import {
  areaOverlaysSignature,
  mapAreasToOverlays,
  mapTicketToMarker,
  withTicketStatus,
} from './markers';

/** A ticket as `GetTickets` returns it. The fragment's masking is only in the types. */
function ticket(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'ticket-1',
    propertyName: null,
    geometry: { type: 'Point', coordinates: [121.43, 23.67] },
    locationCell: null,
    title: '光復路 28 號清淤',
    description: '需要清淤',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    status: 'pending',
    priority: 'high',
    taskType: 'hr',
    auditStatus: 'no_audit',
    suspectedDuplicateOf: [],
    createdBy: 'user-1',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as never;
}

function markerOf(overrides: Record<string, unknown> = {}) {
  const marker = mapTicketToMarker(ticket(overrides));

  if (!marker) {
    throw new Error('the fixture has a point, so it maps to a marker');
  }

  return marker;
}

describe('withTicketStatus', () => {
  it('shows a status read again just as mapping the ticket afresh would', () => {
    expect(
      withTicketStatus(markerOf({ status: 'pending' }), 'completed'),
    ).toEqual(markerOf({ status: 'completed' }));
  });

  it('turns the pin to in progress once someone is on the ticket', () => {
    expect(
      withTicketStatus(markerOf({ status: 'pending' }), 'in_progress'),
    ).toMatchObject({
      label: '處理中',
      variant: 'in-progress',
      ticketMeta: { status: 'in_progress', priority: 'high' },
    });
  });

  it('keeps the rest of the marker as it was, its needs included', () => {
    const needs: TicketNeed[] = [
      {
        uuid: 'need-1',
        taskName: '清淤',
        taskType: 'hr',
        quantity: 1,
        status: 'fulfilled',
        assignedCount: 1,
        myAssignment: null,
      },
    ];
    const marker = { ...markerOf(), needs };

    const updated = withTicketStatus(marker, 'completed');

    expect(updated.needs).toBe(needs);
    expect(updated.title).toBe(marker.title);
    expect(updated.position).toEqual(marker.position);
    expect(updated.ticketMeta?.createdBy).toBe('user-1');
  });
});

describe('mapTicketToMarker', () => {
  it('carries the tickets this one may repeat, for the list card and the detail', () => {
    const others = [{ uuid: 'ticket-2', title: '光復路 28 號一樓清淤' }];

    expect(
      markerOf({ suspectedDuplicateOf: others }).ticketMeta
        ?.suspectedDuplicateOf,
    ).toEqual(others);
    expect(markerOf().ticketMeta?.suspectedDuplicateOf).toEqual([]);
  });
});

/** An area as `GetMapAreas` returns it. */
function area(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'area-1',
    type: 'hazardous_zone',
    name: '堤防潰口',
    note: null,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [121.42, 23.66],
          [121.43, 23.66],
          [121.43, 23.67],
          [121.42, 23.66],
        ],
      ],
    },
    assignedTeams: [],
    ...overrides,
  } as never;
}

describe('mapAreasToOverlays', () => {
  it('puts a 危險區 on 封閉區域, and a 責任區 or 標示區 on the other layer, in [lat, lng]', () => {
    const { closureAreas, publicZones } = mapAreasToOverlays([
      area({ note: '勿靠近' }),
      area({
        uuid: 'area-2',
        type: 'team_zone',
        name: '大平村',
        assignedTeams: [
          { uuid: 'team-1', name: '慈濟基金會' },
          { uuid: 'team-2', name: '紅十字會' },
        ],
      }),
      area({ uuid: 'area-3', type: 'mark_zone', name: '志工休息區' }),
    ]);

    expect(closureAreas).toEqual([
      {
        id: 'area-1',
        name: '堤防潰口',
        comment: '勿靠近',
        polygons: [
          [
            [
              [23.66, 121.42],
              [23.66, 121.43],
              [23.67, 121.43],
              [23.66, 121.42],
            ],
          ],
        ],
      },
    ]);
    expect(
      publicZones.map(({ id, kind, name, teams }) => ({
        id,
        kind,
        name,
        teams,
      })),
    ).toEqual([
      {
        id: 'area-2',
        kind: 'team_zone',
        name: '大平村',
        teams: ['慈濟基金會', '紅十字會'],
      },
      { id: 'area-3', kind: 'mark_zone', name: '志工休息區', teams: [] },
    ]);
  });

  it('takes a name of only spaces as none', () => {
    const { closureAreas, publicZones } = mapAreasToOverlays([
      area({ name: null }),
      area({ uuid: 'area-2', type: 'mark_zone', name: '   ' }),
    ]);

    expect(closureAreas[0]?.name).toBeNull();
    expect(publicZones[0]?.name).toBeNull();
  });

  it('draws every part of a MultiPolygon, and leaves out what it cannot draw', () => {
    const square = [
      [
        [121.42, 23.66],
        [121.43, 23.66],
        [121.43, 23.67],
        [121.42, 23.66],
      ],
    ];
    const { closureAreas, publicZones } = mapAreasToOverlays([
      area({
        geometry: { type: 'MultiPolygon', coordinates: [square, square] },
      }),
      area({ uuid: 'no-geometry', geometry: null }),
      area({
        uuid: 'a-point',
        geometry: { type: 'Point', coordinates: [121.42, 23.66] },
      }),
      area({ uuid: 'unknown-kind', type: 'evacuation_zone' }),
    ]);

    expect(closureAreas.map((overlay) => overlay.polygons.length)).toEqual([2]);
    expect(publicZones).toEqual([]);
  });
});

describe('areaOverlaysSignature', () => {
  it('changes with what a zone says, and not with a fetch that brings it back as it was', () => {
    const before = mapAreasToOverlays([
      area({ type: 'team_zone', assignedTeams: [{ uuid: 't', name: '慈濟' }] }),
    ]);
    const again = mapAreasToOverlays([
      area({ type: 'team_zone', assignedTeams: [{ uuid: 't', name: '慈濟' }] }),
    ]);
    const handedOver = mapAreasToOverlays([
      area({
        type: 'team_zone',
        assignedTeams: [{ uuid: 'u', name: '紅十字會' }],
      }),
    ]);

    expect(areaOverlaysSignature(again)).toBe(areaOverlaysSignature(before));
    expect(areaOverlaysSignature(handedOver)).not.toBe(
      areaOverlaysSignature(before),
    );
  });
});
