// SPDX-License-Identifier: GPL-3.0-only
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useEditSync } from '@rescue-frontend/leaflet/edit-sync';
import { toast } from 'sonner';
import { GraphqlError } from '@rescue-frontend/data-access';
import type { RescueMapArea, RescueMapAreaTeam } from '../types';
import type { DrawEditor } from './area-editor';
import { areaErrorMessage, knownAreaErrorMessage } from './area-errors';
import { holdRequest } from './hold-request';
import { SESSION_ENDING_EVENT } from '../../session/end-expired-session';

type HeldAreaChange =
  | { kind: 'delete' }
  | { kind: 'teams'; teams: readonly RescueMapAreaTeam[] }
  | { kind: 'geometry'; polygons: RescueMapArea['polygons'] };

export const AREA_TEAM_LOAD_ERROR = '團隊清單載入失敗，請重新整理。';

export function showAreaError(
  cause: unknown,
  fallback = '無法儲存區域變更，請再試一次。',
) {
  if (cause instanceof GraphqlError && cause.response?.status === 401) return;
  toast.error(areaErrorMessage(cause, fallback));
}

interface AreaChange {
  uuid: string;
  change: HeldAreaChange;
  message: string;
  send: (keepalive: boolean) => Promise<void>;
}

interface AreaChangeView {
  restoreDraft: (draft: DrawEditor) => boolean;
  highlightArea: (uuid: string) => void;
}

export interface AreaChanges {
  pending: Readonly<Partial<Record<string, HeldAreaChange>>>;
  heldDraft: DrawEditor | null;
  recoverableDraft: DrawEditor | null;
  hold: (change: AreaChange) => boolean;
  holdDraft: (
    draft: DrawEditor,
    request: { message: string; send: (keepalive: boolean) => Promise<string> },
  ) => boolean;
  recoverDraft: (draft: DrawEditor | null) => void;
  bindView: (view: AreaChangeView) => () => void;
  cancelHolds: () => boolean;
}

const NEW_AREA = 'new';
const AreaChangesContext = createContext<AreaChanges | null>(null);
const CancelAreaChangesContext = createContext<
  AreaChanges['cancelHolds'] | undefined
>(undefined);

/** Undo lives with the signed-in identity, so it still works while another admin page is open. */
export function AdminAreaChangesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    pending,
    save: saveArea,
    cancelWaiting: cancelWaitingAreas,
    reset: resetAreas,
  } = useEditSync<HeldAreaChange>();
  const {
    pending: drafts,
    save: saveDraft,
    cancelWaiting: cancelWaitingDrafts,
    reset: resetDrafts,
  } = useEditSync<DrawEditor>();
  const [recoverableDraft, recoverDraft] = useState<DrawEditor | null>(null);
  const view = useRef<AreaChangeView | null>(null);

  const bindView = useCallback((nextView: AreaChangeView) => {
    view.current = nextView;
    return () => {
      if (view.current === nextView) view.current = null;
    };
  }, []);
  const cancelHolds = useCallback(() => {
    const cancelledAreas = cancelWaitingAreas();
    const cancelledDrafts = cancelWaitingDrafts();
    return cancelledAreas || cancelledDrafts;
  }, [cancelWaitingAreas, cancelWaitingDrafts]);

  useEffect(() => {
    function endSession() {
      resetAreas();
      resetDrafts();
    }
    window.addEventListener(SESSION_ENDING_EVENT, endSession);
    return () => {
      window.removeEventListener(SESSION_ENDING_EVENT, endSession);
    };
  }, [resetAreas, resetDrafts]);

  const changes = useMemo<AreaChanges>(
    () => ({
      pending,
      heldDraft: drafts[NEW_AREA] ?? null,
      recoverableDraft,
      recoverDraft,
      bindView,
      cancelHolds,
      hold: ({ uuid, change, message, send }) =>
        holdRequest({
          save: saveArea,
          key: uuid,
          edit: change,
          message,
          persist: ({ keepalive }) => send(keepalive),
          onError: (cause) => showAreaError(cause),
        }) !== null,
      holdDraft: (draft, request) => {
        const restoreDraft = () => {
          if (!view.current?.restoreDraft(draft)) recoverDraft(draft);
        };
        return (
          holdRequest({
            save: saveDraft,
            key: NEW_AREA,
            edit: draft,
            message: request.message,
            persist: ({ keepalive }) => request.send(keepalive),
            onUndo: restoreDraft,
            onCancel: () => recoverDraft(draft),
            onSuccess: (uuid) => view.current?.highlightArea(uuid),
            onError: (cause) => {
              if (knownAreaErrorMessage(cause)) restoreDraft();
              else recoverDraft(draft);
              showAreaError(
                cause,
                '無法確認區域是否已儲存，請先查看區域清單。',
              );
            },
          }) !== null
        );
      },
    }),
    [
      bindView,
      cancelHolds,
      drafts,
      pending,
      recoverableDraft,
      saveArea,
      saveDraft,
    ],
  );

  return (
    <CancelAreaChangesContext value={cancelHolds}>
      <AreaChangesContext value={changes}>{children}</AreaChangesContext>
    </CancelAreaChangesContext>
  );
}

export function useAdminAreaChanges() {
  const changes = useContext(AreaChangesContext);
  if (!changes) throw new Error('AdminAreaChangesProvider is missing');
  return changes;
}

export function useCancelHeldAreaChanges() {
  return useContext(CancelAreaChangesContext);
}
