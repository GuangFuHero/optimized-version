'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createStore, useStore } from 'zustand';
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
  pending: Readonly<Record<string, HeldAreaChange>>;
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

function createAreaChanges() {
  let view: AreaChangeView | null = null;
  const activeHolds = new Set<() => void>();
  const track = (
    { send, onUndo, message }: Parameters<typeof holdRequest>[0],
    onCancel: () => void,
  ) => {
    const cancelRequest = holdRequest({
      message,
      onUndo: () => {
        activeHolds.delete(cancel);
        onUndo();
      },
      send: async (keepalive) => {
        activeHolds.delete(cancel);
        await send(keepalive);
      },
    });
    const cancel = () => {
      cancelRequest();
      onCancel();
    };
    activeHolds.add(cancel);
  };
  return createStore<AreaChanges>((set, get) => ({
    pending: {},
    heldDraft: null,
    recoverableDraft: null,
    hold: ({ uuid, change, message, send }) => {
      if (get().pending[uuid]) return false;
      set(({ pending }) => ({ pending: { ...pending, [uuid]: change } }));
      const clear = () =>
        set(({ pending }) => {
          const next = { ...pending };
          delete next[uuid];
          return { pending: next };
        });
      track(
        {
          message,
          onUndo: clear,
          send: async (keepalive) => {
            try {
              await send(keepalive);
            } catch (cause) {
              showAreaError(cause);
            } finally {
              clear();
            }
          },
        },
        clear,
      );
      return true;
    },
    holdDraft: (heldDraft, request) => {
      if (get().heldDraft) return false;
      set({ heldDraft });
      const restoreDraft = () => {
        if (!view?.restoreDraft(heldDraft))
          set({ recoverableDraft: heldDraft });
      };
      track(
        {
          message: request.message,
          onUndo: () => {
            set({ heldDraft: null });
            restoreDraft();
          },
          send: async (keepalive) => {
            try {
              const uuid = await request.send(keepalive);
              view?.highlightArea(uuid);
            } catch (cause) {
              if (knownAreaErrorMessage(cause)) restoreDraft();
              else set({ recoverableDraft: heldDraft });
              showAreaError(
                cause,
                '無法確認區域是否已儲存，請先查看區域清單。',
              );
            } finally {
              set({ heldDraft: null });
            }
          },
        },
        () => set({ heldDraft: null, recoverableDraft: heldDraft }),
      );
      return true;
    },
    recoverDraft: (recoverableDraft) => set({ recoverableDraft }),
    bindView: (nextView) => {
      view = nextView;
      return () => {
        if (view === nextView) view = null;
      };
    },
    cancelHolds: () => {
      const hadHolds = activeHolds.size > 0;
      for (const cancel of activeHolds) cancel();
      activeHolds.clear();
      return hadHolds;
    },
  }));
}

const AreaChangesContext = createContext<ReturnType<
  typeof createAreaChanges
> | null>(null);

/** Undo lives with the signed-in identity, so it still works while another admin page is open. */
export function AdminAreaChangesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [changes] = useState(createAreaChanges);
  useEffect(() => {
    const { cancelHolds } = changes.getState();
    window.addEventListener(SESSION_ENDING_EVENT, cancelHolds);
    return () => {
      window.removeEventListener(SESSION_ENDING_EVENT, cancelHolds);
      cancelHolds();
    };
  }, [changes]);
  return <AreaChangesContext value={changes}>{children}</AreaChangesContext>;
}

export function useAdminAreaChanges<T>(select: (changes: AreaChanges) => T) {
  const store = useContext(AreaChangesContext);
  if (!store) throw new Error('AdminAreaChangesProvider is missing');
  return useStore(store, select);
}

export function useCancelHeldAreaChanges() {
  return useContext(AreaChangesContext)?.getState().cancelHolds;
}
