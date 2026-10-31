'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { withBusyKey } from '../model/busy-keys';

/**
 * Several writes, each reporting whether it is in flight under its own key, told to the frame
 * holding them as one busy flag: busy while any is. Each key's reporter is stable, so a write can
 * report from an effect without re-running it.
 */
export function useBusyKeys(onBusyChange?: (busy: boolean) => void) {
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set());
  const reporters = useRef(new Map<string, (busy: boolean) => void>());
  const reporter = useCallback((key: string) => {
    let report = reporters.current.get(key);
    if (!report) {
      report = (busy: boolean) =>
        setKeys((current) => withBusyKey(current, key, busy));
      reporters.current.set(key, report);
    }
    return report;
  }, []);
  useReportBusy(keys.size > 0, onBusyChange);
  return reporter;
}

/** Tells `onBusyChange` each time `busy` changes, and that it is no longer busy on unmount. */
export function useReportBusy(
  busy: boolean,
  onBusyChange?: (busy: boolean) => void,
) {
  const report = useRef(onBusyChange);
  report.current = onBusyChange;
  useEffect(() => {
    report.current?.(busy);
  }, [busy]);
  useEffect(() => () => report.current?.(false), []);
}
