/**
 * What a coordinator reads when opening, editing or deleting a space is refused, in place of the
 * backend's English. The refusals are `services/building_map.py`'s, word for word; a 403 is the
 * capability (`work_zone.*`) or the gov-team check.
 */

import {
  refusalMessage,
  type ClaimError,
  type RefusalWords,
} from '../../needs/claim-error';

const NOT_FOUND = 'Building map not found';

const WORDS: Record<'create' | 'update' | 'delete', RefusalWords> = {
  create: {
    refusals: {
      "A building map's address has no building section, floor or room":
        '空間的地址只寫到門牌號碼，不要有棟別、樓層或房號。',
    },
    forbidden: '你的帳號不能開啟空間：要是政府單位的成員，並有開啟空間的權限。',
    fallback: '開啟空間失敗，請稍後再試一次。',
  },
  update: {
    refusals: { [NOT_FOUND]: '找不到這一棟，可能已經被刪除。' },
    forbidden: '你的帳號沒有編輯這一棟的權限。',
    fallback: '更新空間失敗，請稍後再試一次。',
  },
  delete: {
    refusals: { [NOT_FOUND]: '這一棟已經被刪除了。' },
    forbidden: '你的帳號沒有刪除這一棟的權限。',
    fallback: '刪除空間失敗，請稍後再試一次。',
  },
};

/** `error` is what the write threw: urql's `CombinedError`, or anything else as a plain failure. */
export function spaceErrorMessage(
  write: 'create' | 'update' | 'delete',
  error: unknown,
): string {
  return refusalMessage((error ?? {}) as ClaimError, WORDS[write]);
}
