import { describe, expect, it } from 'vitest';

import {
  assignPickerOptions,
  canAssignNeed,
  canRemoveAssignee,
  canWriteNeedNote,
  needKindLine,
  needStatusLabel,
  needTakenLine,
} from './need-assign';

describe('needStatusLabel', () => {
  it('names each need status as the card shows it', () => {
    expect(
      ['pending', 'in_progress', 'fulfilled', 'canceled'].map(needStatusLabel),
    ).toEqual(['待承接', '進行中', '已滿足', '已取消']);
  });

  it('shows a status it does not know as itself', () => {
    expect(needStatusLabel('paused')).toBe('paused');
  });
});

describe('needKindLine and needTakenLine', () => {
  it('reads the type and how many the need asks for', () => {
    expect(needKindLine({ taskType: 'hr', quantity: 4 })).toBe('人力 · 需 4');
    expect(needKindLine({ taskType: 'rescue', quantity: null })).toBe('搜救');
  });

  it('counts the people on the need against its quantity', () => {
    expect(needTakenLine({ assignedCount: 0, quantity: 1 })).toBe(
      '已承接 0／1 人',
    );
    expect(needTakenLine({ assignedCount: 3, quantity: null })).toBe(
      '已承接 3 人',
    );
  });
});

describe('canAssignNeed', () => {
  const open = {
    status: 'pending',
    quantity: 3,
    assignedCount: 1,
    viewerCanAssign: true,
  };

  it('offers an open need with room, to a caller who may assign to it', () => {
    expect(canAssignNeed(open, 'pending')).toBe(true);
    expect(
      canAssignNeed({ ...open, status: 'in_progress' }, 'in_progress'),
    ).toBe(true);
  });

  it('never offers it without ticket.assign over the need', () => {
    expect(canAssignNeed({ ...open, viewerCanAssign: false }, 'pending')).toBe(
      false,
    );
  });

  it('never offers a full need: the cap binds a coordinator too', () => {
    expect(canAssignNeed({ ...open, assignedCount: 3 }, 'pending')).toBe(false);
  });

  it('has no cap on a need without a quantity', () => {
    expect(
      canAssignNeed({ ...open, quantity: null, assignedCount: 40 }, 'pending'),
    ).toBe(true);
  });

  it('never offers a closed need, or one on a closed ticket', () => {
    expect(canAssignNeed({ ...open, status: 'fulfilled' }, 'pending')).toBe(
      false,
    );
    expect(canAssignNeed({ ...open, status: 'canceled' }, 'pending')).toBe(
      false,
    );
    expect(canAssignNeed(open, 'completed')).toBe(false);
    expect(canAssignNeed(open, 'cancelled')).toBe(false);
  });
});

describe('canRemoveAssignee', () => {
  it('follows the place’s own flag', () => {
    expect(canRemoveAssignee({}, { viewerCanUnassign: true })).toBe(true);
    expect(canRemoveAssignee({}, { viewerCanUnassign: false })).toBe(false);
  });

  it('never offers it once recruiting was stopped by hand', () => {
    expect(
      canRemoveAssignee(
        { recruitingStoppedAt: '2026-10-29T10:00:00Z' },
        { viewerCanUnassign: true },
      ),
    ).toBe(false);
  });
});

describe('canWriteNeedNote', () => {
  it('follows the ticket’s edit flag', () => {
    expect(canWriteNeedNote({ viewerCanEdit: true, locationCell: null })).toBe(
      true,
    );
    expect(canWriteNeedNote({ viewerCanEdit: false, locationCell: null })).toBe(
      false,
    );
  });

  it('is never offered on a coarse ticket, whose notes are withheld', () => {
    expect(
      canWriteNeedNote({ viewerCanEdit: true, locationCell: '8a4b1e2' }),
    ).toBe(false);
  });
});

describe('assignPickerOptions', () => {
  const members = [
    { uuid: 'u1', name: '阿明', real_name: '王小明' },
    { uuid: 'u2', name: '小華', real_name: null },
    { uuid: 'u3', name: '大雄', real_name: '大雄' },
  ];

  it('leaves out whoever is already on the need, keeping the team’s order', () => {
    expect(
      assignPickerOptions(members, [{ actorUuid: 'u2' }]).map((o) => o.value),
    ).toEqual(['u1', 'u3']);
  });

  it('names a member by nickname, with a different real name beside it', () => {
    expect(assignPickerOptions(members, []).map((o) => o.label)).toEqual([
      '阿明（王小明）',
      '小華',
      '大雄',
    ]);
  });

  it('is empty once the whole team is on the need', () => {
    expect(
      assignPickerOptions(members, [
        { actorUuid: 'u1' },
        { actorUuid: 'u2' },
        { actorUuid: 'u3' },
      ]),
    ).toEqual([]);
  });
});
