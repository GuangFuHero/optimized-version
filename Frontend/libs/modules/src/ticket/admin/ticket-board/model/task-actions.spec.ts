import { describe, expect, it } from 'vitest';

import type { TicketCapabilities } from '../hooks/use-ticket-capabilities';
import {
  auditErrorMessage,
  buildNeedInput,
  readCreateResult,
  taskActionsFor,
  validateNeedDraft,
} from './task-actions';
import type { TaskRow } from './ticket-row';

const caps = (over: Partial<TicketCapabilities> = {}): TicketCapabilities => ({
  canAdd: false,
  canEdit: true,
  canDelete: false,
  canAudit: false,
  canImport: false,
  canExport: false,
  canViewDetail: false,
  canViewHistory: false,
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
    raw: {} as TaskRow['raw'],
    ...over,
  }) as TaskRow;

describe('taskActionsFor', () => {
  it('offers stop only on an open need with someone on it', () => {
    expect(taskActionsFor(task(), 'in_progress', caps())).toContain('stop');
    expect(
      taskActionsFor(task({ assignedCount: 0 }), 'in_progress', caps()),
    ).not.toContain('stop');
    expect(
      taskActionsFor(task({ status: 'fulfilled' }), 'in_progress', caps()),
    ).not.toContain('stop');
    expect(taskActionsFor(task(), 'completed', caps())).not.toContain('stop');
    expect(taskActionsFor(task(), 'cancelled', caps())).not.toContain('stop');
    expect(
      taskActionsFor(task(), 'in_progress', caps({ canEdit: false })),
    ).not.toContain('stop');
  });

  it('offers delete with ticket.delete only', () => {
    expect(
      taskActionsFor(task(), 'pending', caps({ canDelete: false })),
    ).not.toContain('delete');
    expect(
      taskActionsFor(task(), 'pending', caps({ canDelete: true })),
    ).toContain('delete');
    // Deleting is not limited to open needs.
    expect(
      taskActionsFor(
        task({ status: 'fulfilled' }),
        'completed',
        caps({ canEdit: false, canDelete: true }),
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

describe('auditErrorMessage', () => {
  it('asks for a reload on a stale content hash', () => {
    expect(
      auditErrorMessage({
        graphQLErrors: [
          {
            message:
              'The ticket has changed since it was loaded; reload it and audit again',
          },
        ],
      }),
    ).toBe('內容已更新，請重新整理後再審核');
  });

  it('says a 403 is a permission problem', () => {
    expect(
      auditErrorMessage({ graphQLErrors: [{ message: '403: Forbidden' }] }),
    ).toBe('你的帳號沒有審核權限。');
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
