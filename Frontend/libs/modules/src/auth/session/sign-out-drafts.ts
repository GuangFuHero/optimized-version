import { clearApplyDraft } from '../../role-request/use-apply-draft';
import { clearAllHelpRequestDrafts } from '../../ticket/help-request';
import { clearContactDraft } from './use-contact-draft';

/**
 * The person chose to leave — 登出 in the menu, or 登出所有裝置 — maybe on a shared device: no half-filled
 * 請求協助 (address, phone), 申請管理權限 or contact being added is left in the tab for whoever uses it
 * next. Called before the backend is asked: closing a slow tab must not keep them. A session that ended
 * keeps its drafts.
 */
export function clearDraftsOnSignOut(
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | null,
): void {
  clearAllHelpRequestDrafts(storage);
  clearApplyDraft(storage);
  clearContactDraft(storage);
}
