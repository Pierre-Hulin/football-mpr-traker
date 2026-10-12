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

const buildId = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
const buildTime = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";
const appVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/** Identifies exactly which build a device is running, e.g. "v1.0.0 · 9d753fd · Oct 10". */
export const BUILD_LABEL = [
  `v${appVersion}`,
  buildId,
  buildTime ? new Date(buildTime).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
]
  .filter(Boolean)
  .join(" · ");

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

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
      onRegisteredSW: (_url: string, registration: ServiceWorkerRegistration | undefined) => {
        set({ registered: true, offlineReady: state.offlineReady || !!navigator.serviceWorker.controller });
        if (registration) watchForUpdates(registration);
      },
      onRegisterError: (err: unknown) => console.warn("Service worker registration failed", err),
    });
  } catch (err) {
    console.warn("Service worker unavailable", err);
  }
}

/**
 * An installed PWA (especially on iOS) is resumed from the background rather
 * than reloaded, so registration-time checks alone can leave it on an old build
 * for days. Re-check when the app comes to the foreground, when connectivity
 * returns, and hourly while open. Applying the update is still left to the user
 * (never mid-game).
 */
function watchForUpdates(registration: ServiceWorkerRegistration) {
  const check = () => {
    if (!navigator.onLine) return;
    registration.update().catch(() => undefined);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("online", check);
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
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
