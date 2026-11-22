'use client';

import { toast } from 'sonner';
import {
  SIGN_OUT_FAILED_MESSAGE,
  signOutHereAsync,
} from '../../auth/session/sign-out';
import { useCancelHeldAreaChanges } from '../../map/admin/area-changes';

export function useAdminSessionActions() {
  const cancelHeldAreaChanges = useCancelHeldAreaChanges();
  const cancelPendingWrites = () => {
    if (cancelHeldAreaChanges?.()) {
      toast.info('已取消尚未送出的區域變更。');
    }
  };

  return {
    cancelPendingWrites,
    signOut: () => {
      cancelPendingWrites();
      void signOutHereAsync().then((outcome) => {
        if (outcome === 'still-signed-in') {
          toast.error(SIGN_OUT_FAILED_MESSAGE);
        }
      });
    },
  };
}
