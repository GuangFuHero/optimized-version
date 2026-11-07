'use client';

import { useCallback } from 'react';
import { useIsClient } from 'usehooks-ts';
import { create } from 'zustand';

import { localDeviceStorage } from '../../../storage';
import { hasSeenPageHelp, markPageHelpSeen } from './page-help';

const useSeenHelp = create<ReadonlySet<string>>(() => new Set());

/** Shares the device's existing help marks, including visits where storage is unavailable. */
export function usePageHelpSeen(key: string | null) {
  const isClient = useIsClient();
  const seen = useSeenHelp(
    (keys) =>
      !key || keys.has(key) || hasSeenPageHelp(localDeviceStorage(), key),
  );
  const markSeen = useCallback(() => {
    if (!key) return;
    markPageHelpSeen(localDeviceStorage(), key);
    useSeenHelp.setState((keys) => new Set([...keys, key]), true);
  }, [key]);

  return { seen: !isClient || seen, markSeen };
}
