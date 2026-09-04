import type { Client } from 'urql';

import {
  DedupHintOutcome,
  RecordDedupHintOutcomeDocument,
} from '@rescue-frontend/data-access';

/** 永不 throw。本 pass 只送 `DedupHintOutcome.SubmittedAnyway`。 */
export async function recordSubmittedAnyway(
  client: Client,
  args: { candidateTicketUuid: string; submittedTicketUuid: string },
): Promise<
  { ok: true; auditEventUuid: string } | { ok: false; reason: string }
> {
  try {
    const result = await client.mutation(RecordDedupHintOutcomeDocument, {
      input: {
        candidateTicketUuid: args.candidateTicketUuid,
        submittedTicketUuid: args.submittedTicketUuid,
        outcome: DedupHintOutcome.SubmittedAnyway,
      },
    });

    if (result.error) {
      return { ok: false, reason: result.error.message };
    }

    const auditEventUuid = result.data?.recordDedupHintOutcome?.auditEventUuid;
    if (!auditEventUuid) {
      return { ok: false, reason: 'missing auditEventUuid' };
    }

    return { ok: true, auditEventUuid };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message || error.name : String(error);
    return { ok: false, reason };
  }
}
