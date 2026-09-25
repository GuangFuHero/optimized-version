import type { Client } from 'urql';

import {
  RecordDedupHintOutcomeDocument,
  type RecordDedupHintOutcomeInput,
} from '@rescue-frontend/data-access';

/**
 * 記下使用者對提示的選擇：
 * - `accepted_hint`：去看了舊單、沒有開新單，不帶 `submittedTicketUuid`。
 * - `ignored_hint`：照樣開了新單，帶新單的 `submittedTicketUuid`。
 *
 * 只是稽核紀錄：失敗只 console.warn，永不 throw，不影響開單流程。
 */
export async function recordHintOutcome(
  client: Client,
  input: RecordDedupHintOutcomeInput,
): Promise<void> {
  try {
    const result = await client
      .mutation(RecordDedupHintOutcomeDocument, { input })
      .toPromise();

    if (result.error || !result.data?.recordDedupHintOutcome) {
      console.warn(
        'recordHintOutcome failed:',
        result.error?.message ?? 'empty result',
      );
    }
  } catch (error) {
    console.warn('recordHintOutcome failed:', error);
  }
}
