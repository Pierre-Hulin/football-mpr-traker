/**
 * Screen Wake Lock wrapper. Failure is never fatal: game tracking continues
 * normally if the browser refuses or does not support the API.
 */
export interface WakeLockHandle {
  release: () => Promise<void>;
}

type Sentinel = { release: () => Promise<void>; released: boolean; addEventListener: (t: string, f: () => void) => void };

export function isWakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/**
 * Hold a screen wake lock, re-acquiring after the page becomes visible again
 * (browsers release it automatically when the tab is hidden).
 */
export function holdWakeLock(onError?: (err: unknown) => void): WakeLockHandle {
  let sentinel: Sentinel | null = null;
  let stopped = false;

  const acquire = async () => {
    if (stopped || !isWakeLockSupported() || document.visibilityState !== "visible") return;
    if (sentinel && !sentinel.released) return;
    try {
      const nav = navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<Sentinel> } };
      sentinel = await nav.wakeLock.request("screen");
      if (stopped) await sentinel.release();
    } catch (err) {
      console.warn("Wake lock unavailable", err);
      onError?.(err);
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") void acquire();
  };

  if (!isWakeLockSupported()) {
    onError?.(new Error("Wake Lock API not supported"));
  } else {
    document.addEventListener("visibilitychange", onVisibility);
    void acquire();
  }

  return {
    release: async () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        if (sentinel && !sentinel.released) await sentinel.release();
      } catch {
        // ignore
      }
      sentinel = null;
    },
  };
}
