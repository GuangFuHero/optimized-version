import { describe, expect, it } from 'vitest';

import { requesterAuditNotice } from './audit-issue';

const ticket = {
  auditStatus: 'audit_issue',
  createdBy: 'requester',
  title: '大進村獨居長者物資配送',
};

describe('requesterAuditNotice', () => {
  it('tells the requester, in the notice’s words, that staff are checking their ticket', () => {
    expect(requesterAuditNotice({ ...ticket, viewerId: 'requester' })).toBe(
      '協調人員正在確認你的求助單「大進村獨居長者物資配送」，有需要會跟你聯絡。',
    );
  });

  it('says nothing to anyone else, signed in or not', () => {
    expect(
      requesterAuditNotice({ ...ticket, viewerId: 'volunteer' }),
    ).toBeNull();
    expect(requesterAuditNotice({ ...ticket, viewerId: null })).toBeNull();
  });

  it('says nothing about a ticket found right, or not checked', () => {
    for (const auditStatus of ['audited', 'need_audit', 'no_audit', null]) {
      expect(
        requesterAuditNotice({ ...ticket, auditStatus, viewerId: 'requester' }),
      ).toBeNull();
    }
  });
});
