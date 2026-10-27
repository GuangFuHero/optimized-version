import { describe, expect, it } from 'vitest';

import {
  distanceToTicketM,
  groupSuspectsByTicket,
  readHeldHelpRequest,
  sentNeedIndex,
} from './duplicate-suspects';

describe('sentNeedIndex', () => {
  it('reads the place among the needs sent', () => {
    expect(sentNeedIndex('task:0')).toBe(0);
    expect(sentNeedIndex('task:12')).toBe(12);
  });

  it('names no need for anything else', () => {
    expect(sentNeedIndex('station')).toBeNull();
    expect(sentNeedIndex('task:')).toBeNull();
    expect(sentNeedIndex(undefined)).toBeNull();
  });
});

describe('groupSuspectsByTicket', () => {
  it('keeps one entry per ticket, in the order the backend ranked them', () => {
    expect(
      groupSuspectsByTicket([
        { relatedUuid: 'need-a1', relatedTicketUuid: 'ticket-a' },
        { relatedUuid: 'need-b1', relatedTicketUuid: 'ticket-b' },
        { relatedUuid: 'need-a2', relatedTicketUuid: 'ticket-a' },
      ]),
    ).toEqual([
      { ticketUuid: 'ticket-a', needUuids: ['need-a1', 'need-a2'] },
      { ticketUuid: 'ticket-b', needUuids: ['need-b1'] },
    ]);
  });

  it('leaves out a suspect with no ticket to show', () => {
    expect(
      groupSuspectsByTicket([
        { relatedUuid: 'need-x', relatedTicketUuid: null },
        { relatedUuid: 'need-b1', relatedTicketUuid: 'ticket-b' },
      ]),
    ).toEqual([{ ticketUuid: 'ticket-b', needUuids: ['need-b1'] }]);
  });
});

describe('readHeldHelpRequest', () => {
  const sent = ['清淤泥', '晚餐便當', '搬家具'];

  it('says which of the needs sent each ticket looks like, by name', () => {
    expect(
      readHeldHelpRequest(
        [
          {
            draftRef: 'task:0',
            relatedUuid: 'need-a1',
            relatedTicketUuid: 'ticket-a',
          },
          {
            draftRef: 'task:2',
            relatedUuid: 'need-a2',
            relatedTicketUuid: 'ticket-a',
          },
          {
            draftRef: 'task:1',
            relatedUuid: 'need-b1',
            relatedTicketUuid: 'ticket-b',
          },
        ],
        sent,
      ).tickets,
    ).toEqual([
      {
        ticketUuid: 'ticket-a',
        needUuids: ['need-a1', 'need-a2'],
        alike: ['清淤泥', '搬家具'],
      },
      { ticketUuid: 'ticket-b', needUuids: ['need-b1'], alike: ['晚餐便當'] },
    ]);
  });

  it('names a suspect for each need held, and none for a need that was not', () => {
    expect(
      readHeldHelpRequest(
        [
          {
            draftRef: 'task:2',
            relatedUuid: 'need-a2',
            relatedTicketUuid: 'ticket-a',
          },
          {
            draftRef: 'task:0',
            relatedUuid: 'need-b1',
            relatedTicketUuid: 'ticket-b',
          },
        ],
        sent,
      ).acknowledge,
    ).toEqual({ 0: 'need-b1', 2: 'need-a2' });
  });

  it('still names a need held for a suspect with no ticket to show, or it would be held again', () => {
    const held = readHeldHelpRequest(
      [{ draftRef: 'task:1', relatedUuid: 'need-x', relatedTicketUuid: null }],
      sent,
    );

    expect(held.tickets).toEqual([]);
    expect(held.acknowledge).toEqual({ 1: 'need-x' });
  });

  it('keeps the first suspect when a need is named twice', () => {
    expect(
      readHeldHelpRequest(
        [
          {
            draftRef: 'task:0',
            relatedUuid: 'need-a1',
            relatedTicketUuid: 'ticket-a',
          },
          {
            draftRef: 'task:0',
            relatedUuid: 'need-b1',
            relatedTicketUuid: 'ticket-b',
          },
        ],
        sent,
      ).acknowledge,
    ).toEqual({ 0: 'need-a1' });
  });

  it('keeps the needs already said not to be the same when held again for another', () => {
    expect(
      readHeldHelpRequest(
        [
          {
            draftRef: 'task:1',
            relatedUuid: 'need-b1',
            relatedTicketUuid: 'ticket-b',
          },
        ],
        sent,
        { 0: 'need-a1' },
      ).acknowledge,
    ).toEqual({ 0: 'need-a1', 1: 'need-b1' });
  });

  it('takes the suspect named now for a need held again', () => {
    expect(
      readHeldHelpRequest(
        [
          {
            draftRef: 'task:0',
            relatedUuid: 'need-c1',
            relatedTicketUuid: 'ticket-c',
          },
        ],
        sent,
        { 0: 'need-a1' },
      ).acknowledge,
    ).toEqual({ 0: 'need-c1' });
  });

  it('names a need once on a ticket, however many of its needs it looks like', () => {
    expect(
      readHeldHelpRequest(
        [
          {
            draftRef: 'task:0',
            relatedUuid: 'need-a1',
            relatedTicketUuid: 'ticket-a',
          },
          {
            draftRef: 'task:1',
            relatedUuid: 'need-a2',
            relatedTicketUuid: 'ticket-a',
          },
        ],
        ['清淤泥', '清淤泥'],
      ).tickets[0].alike,
    ).toEqual(['清淤泥']);
  });
});

describe('distanceToTicketM', () => {
  const pin = { lat: 23.6725, lng: 121.4235 };
  // 0.0001° of latitude is about 11 m.
  const near = { type: 'Point', coordinates: [121.4235, 23.6726] };

  it('measures to the ticket’s point, in whole metres', () => {
    expect(distanceToTicketM(pin, { geometry: near, locationCell: null })).toBe(
      11,
    );
  });

  it('says nothing when the point is only a cell centre, which may be far off', () => {
    expect(
      distanceToTicketM(pin, {
        geometry: near,
        locationCell: '884ba0a511fffff',
      }),
    ).toBeNull();
  });

  it('says nothing without a point to measure from, or one to measure to', () => {
    expect(distanceToTicketM(null, { geometry: near })).toBeNull();
    expect(distanceToTicketM(pin, null)).toBeNull();
    expect(distanceToTicketM(pin, { geometry: null })).toBeNull();
    expect(
      distanceToTicketM(pin, {
        geometry: { type: 'Polygon', coordinates: [] },
      }),
    ).toBeNull();
  });
});
