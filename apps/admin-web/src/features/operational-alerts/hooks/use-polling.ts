import { useEffect } from 'react';
import { POLL_INTERVAL_MS } from '../constants';

/** Calls `callback` every POLL_INTERVAL_MS while mounted (and `enabled`). */
export function usePolling(callback: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(callback, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [callback, enabled]);
}
