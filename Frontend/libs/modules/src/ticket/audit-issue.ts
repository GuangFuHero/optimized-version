import { isTicketRequester } from './needs/need-actions';

/**
 * The line at the top of a ticket a data check found something wrong with (backend `ticket_audit.py`),
 * for its requester only: the same words as their notice. Not the reason, which only staff read, and
 * not a call to fix it, which the site cannot do yet (design B2: way B, Carol's choice for V1).
 */
export function requesterAuditNotice({
  auditStatus,
  createdBy,
  viewerId,
  title,
}: {
  auditStatus: string | null | undefined;
  createdBy: string | null | undefined;
  viewerId: string | null | undefined;
  title: string;
}): string | null {
  if (
    auditStatus !== 'audit_issue' ||
    !isTicketRequester(createdBy, viewerId)
  ) {
    return null;
  }

  return `協調人員正在確認你的求助單「${title}」，有需要會跟你聯絡。`;
}
