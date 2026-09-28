import type { Client } from 'urql';

import {
  RecordDedupHintOutcomeDocument,
  type RecordDedupHintOutcomeInput,
} from '@rescue-frontend/data-access';

/**
 * 記下使用者對某個 task 提示的選擇（`candidateUuid` 是 hint 的 `relatedTaskUuid`）：
 * - `accepted_hint`：去看了舊單、這個 task 不送出，不帶 `submittedUuid`。
 * - `ignored_hint`：照樣送出，帶新建 task 的 `submittedUuid`。
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
