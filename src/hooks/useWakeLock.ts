import { useEffect, useRef } from "react";
import { holdWakeLock } from "../domain/services/wakeLockService";

const NOTICE_KEY = "mpr-wakelock-notice-shown";

/** Hold a screen wake lock while `enabled`. Calls `onUnavailable` once per session on failure. */
export function useWakeLock(enabled: boolean, onUnavailable?: () => void): void {
  const cb = useRef(onUnavailable);
  cb.current = onUnavailable;

  useEffect(() => {
    if (!enabled) return;
    const handle = holdWakeLock(() => {
      try {
        if (sessionStorage.getItem(NOTICE_KEY)) return;
        sessionStorage.setItem(NOTICE_KEY, "1");
      } catch {
        // storage unavailable: still show once per mount
      }
      cb.current?.();
    });
    return () => {
      void handle.release();
    };
  }, [enabled]);
}
