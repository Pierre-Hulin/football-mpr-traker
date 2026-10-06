import { useSyncExternalStore } from "react";

/**
 * Service worker registration with update deferral. Updates are never applied
 * automatically: the UI decides when (never during an active game).
 */
interface SwState {
  needRefresh: boolean;
  offlineReady: boolean;
  registered: boolean;
}

let state: SwState = { needRefresh: false, offlineReady: false, registered: false };
const listeners = new Set<() => void>();
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

function set(patch: Partial<SwState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;
  try {
    const { registerSW } = await import("virtual:pwa-register");
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => set({ needRefresh: true }),
      onOfflineReady: () => set({ offlineReady: true }),
      onRegisteredSW: () => {
        set({ registered: true, offlineReady: state.offlineReady || !!navigator.serviceWorker.controller });
      },
      onRegisterError: (err: unknown) => console.warn("Service worker registration failed", err),
    });
  } catch (err) {
    console.warn("Service worker unavailable", err);
  }
}

/** Activate the waiting service worker and reload. Only call when no game is in progress. */
export async function applyUpdate(): Promise<void> {
  if (updateSW) await updateSW(true);
  else window.location.reload();
}

export function useServiceWorkerState(): SwState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
