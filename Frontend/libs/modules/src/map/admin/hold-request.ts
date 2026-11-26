// SPDX-License-Identifier: GPL-3.0-only
import {
  type EditSync,
  type EditWrite,
} from '@rescue-frontend/leaflet/edit-sync';
import { toast } from 'sonner';

export { DEFAULT_UNDO_MS as UNDO_MS } from '@rescue-frontend/leaflet/edit-sync';

export function holdRequest<Edit, Result>({
  save,
  key,
  edit,
  message,
  onUndo,
  persist,
  onCancel,
  onError,
  onSuccess,
}: EditWrite<Result> & {
  save: EditSync<Edit>['save'];
  key: string;
  edit: Edit;
  message: string;
  onUndo?: () => void;
}) {
  let toastId: ReturnType<typeof toast> | null = null;
  const dismiss = () => {
    if (toastId !== null) toast.dismiss(toastId);
  };
  const held = save(key, edit, {
    persist: (context) => {
      dismiss();
      return persist(context);
    },
    onCancel: () => {
      dismiss();
      onCancel?.();
    },
    onError,
    onSuccess,
  });
  if (!held) return null;

  toastId = toast(message, {
    duration: Math.max(0, held.deadline - Date.now()),
    closeButton: false,
    onAutoClose: () => held.commit(),
    onDismiss: () => {
      if (Date.now() >= held.deadline) held.commit();
    },
    action: {
      label: '復原',
      onClick: () => {
        if (held.undo()) {
          dismiss();
          onUndo?.();
        }
      },
    },
  });

  return held;
}
