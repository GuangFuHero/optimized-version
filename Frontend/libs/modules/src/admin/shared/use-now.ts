import { useEffect, useState } from 'react';

/** The current time, ticking every `intervalMs` so relative times (3 小時前) stay current. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
