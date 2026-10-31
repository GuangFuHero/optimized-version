import { describe, expect, it } from 'vitest';

import {
  buildNeedInput,
  progressNoteInput,
  readCreateResult,
  taskActionsFor,
  type TicketTaskPerms,
  validateNeedDraft,
} from './task-actions';
import type { TaskRow } from './ticket-row';

const perms = (over: Partial<TicketTaskPerms> = {}): TicketTaskPerms => ({
  viewerCanEdit: true,
  viewerCanDelete: false,
  ...over,
});

const task = (over: Partial<TaskRow> = {}): TaskRow =>
  ({
    uuid: 'n1',
    taskType: 'hr',
    taskName: '清淤',
    status: 'pending',
    quantity: 5,
    assignedCount: 2,
    gap: 3,
    ...over,
  }) as TaskRow;

describe('taskActionsFor', () => {
  it('offers stop only on an open need with someone on it', () => {
    expect(taskActionsFor(task(), 'in_progress', perms())).toContain('stop');
    expect(
      taskActionsFor(task({ assignedCount: 0 }), 'in_progress', perms()),
    ).not.toContain('stop');
    expect(
      taskActionsFor(task({ status: 'fulfilled' }), 'in_progress', perms()),
    ).not.toContain('stop');
    expect(taskActionsFor(task(), 'completed', perms())).not.toContain('stop');
    expect(taskActionsFor(task(), 'cancelled', perms())).not.toContain('stop');
    expect(
      taskActionsFor(task(), 'in_progress', perms({ viewerCanEdit: false })),
    ).not.toContain('stop');
  });

  it('offers nothing on a ticket where both flags are denied', () => {
    expect(
      taskActionsFor(
        task(),
        'pending',
        perms({ viewerCanEdit: false, viewerCanDelete: false }),
      ),
    ).toEqual([]);
  });

  it('offers delete with ticket.delete only', () => {
    expect(
      taskActionsFor(task(), 'pending', perms({ viewerCanDelete: false })),
    ).not.toContain('delete');
    expect(
      taskActionsFor(task(), 'pending', perms({ viewerCanDelete: true })),
    ).toContain('delete');
    // Deleting is not limited to open needs.
    expect(
      taskActionsFor(
        task({ status: 'fulfilled' }),
        'completed',
        perms({ viewerCanEdit: false, viewerCanDelete: true }),
      ),
    ).toEqual(['delete']);
  });
});

describe('readCreateResult', () => {
  it('reads duplicate suspects by draft index', () => {
    expect(
      readCreateResult({
        __typename: 'DuplicatesSuspected',
        suspects: [
          { draftRef: 'task:1', relatedUuid: 't9', relatedTicketUuid: 'k9' },
        ],
      }),
    ).toEqual({
      kind: 'duplicates',
      suspects: [{ draftIndex: 1, relatedUuid: 't9', relatedTicketUuid: 'k9' }],
    });
  });

  it('reads the ticket draft itself as index -1, and a missing ticket uuid as null', () => {
    expect(
      readCreateResult({
        __typename: 'DuplicatesSuspected',
        suspects: [{ draftRef: 'ticket', relatedUuid: 's1' }],
      }),
    ).toEqual({
      kind: 'duplicates',
      suspects: [
        { draftIndex: -1, relatedUuid: 's1', relatedTicketUuid: null },
      ],
    });
  });

  it('reads a created result', () => {
    expect(readCreateResult({ __typename: 'TicketCreated' })).toEqual({
      kind: 'created',
    });
    expect(readCreateResult({ __typename: 'TicketTaskCreated' })).toEqual({
      kind: 'created',
    });
  });
});

describe('validateNeedDraft', () => {
  const draft = {
    taskType: 'hr',
    taskName: '清淤',
    quantity: '3',
    description: '',
  };

  it('needs a name, and a quantity unless the need is a rescue', () => {
    expect(validateNeedDraft(draft)).toEqual({});
    expect(validateNeedDraft({ ...draft, taskName: '  ' })).toEqual({
      taskName: '請填寫需求名稱',
    });
    expect(validateNeedDraft({ ...draft, quantity: '' })).toEqual({
      quantity: '請填寫數量',
    });
    expect(
      validateNeedDraft({ ...draft, taskType: 'rescue', quantity: '' }),
    ).toEqual({});
  });

  it('takes only a whole number of at least 1', () => {
    expect(validateNeedDraft({ ...draft, quantity: '0' })).toEqual({
      quantity: '數量至少為 1',
    });
    expect(validateNeedDraft({ ...draft, quantity: '1.5' })).toEqual({
      quantity: '數量至少為 1',
    });
  });

  it('builds the input with trimmed text and an empty quantity left out', () => {
    expect(
      buildNeedInput('k1', {
        taskType: 'rescue',
        taskName: ' 受困 ',
        quantity: '',
        description: ' ',
      }),
    ).toEqual({
      ticketUuid: 'k1',
      taskType: 'rescue',
      taskName: '受困',
      quantity: null,
      taskDescription: null,
    });
  });
});

describe('progressNoteInput', () => {
  it('sends the note trimmed', () => {
    expect(progressNoteInput(null, '  3F 已清空，待確認 B1  ')).toEqual({
      progressNote: '3F 已清空，待確認 B1',
    });
  });

  it('clears the note with null when it is emptied', () => {
    expect(progressNoteInput('舊的備註', '   ')).toEqual({
      progressNote: null,
    });
  });

  it('sends nothing when the note is unchanged', () => {
    expect(progressNoteInput('已送達', ' 已送達 ')).toBeNull();
    expect(progressNoteInput(null, '')).toBeNull();
  });
});
