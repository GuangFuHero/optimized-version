import { useState } from 'react';
import { useInterval } from 'usehooks-ts';

/** The current time, ticking every `intervalMs` so relative times (3 小時前) stay current. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useInterval(() => setNow(new Date()), intervalMs);
  return now;
}
