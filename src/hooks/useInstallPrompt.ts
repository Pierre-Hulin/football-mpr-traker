import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_AT_KEY = "mpr-install-dismissed-at";
const INSTALLED_KEY = "mpr-installed";
/** After "Not now", stay quiet this long before offering again. */
export const INSTALL_SNOOZE_DAYS = 14;

let deferred: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((s) => s());

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode etc.: the nudge may simply reappear next visit.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    storageSet(INSTALLED_KEY, "1");
    notify();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Which iOS browser chrome to describe in the Add to Home Screen steps. */
export function iosBrowser(): "safari" | "other" {
  if (typeof navigator === "undefined") return "safari";
  return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent) ? "other" : "safari";
}

export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const s = () => force((n) => n + 1);
    subscribers.add(s);
    return () => {
      subscribers.delete(s);
    };
  }, []);

  return {
    canInstall: !!deferred && !isStandalone(),
    showIosHint: isIos() && !isStandalone(),
    install: async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
      if (!deferred) return "unavailable";
      const event = deferred;
      deferred = null;
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === "accepted") storageSet(INSTALLED_KEY, "1");
      notify();
      return outcome;
    },
  };
}

/**
 * Whether to show the floating install nudge, and how. Never shown when running
 * installed (standalone) or after an install, and snoozed for
 * INSTALL_SNOOZE_DAYS after the user dismisses it.
 */
export function useInstallNudge() {
  const prompt = useInstallPrompt();
  const [dismissedAt, setDismissedAt] = useState(() => Number(storageGet(DISMISSED_AT_KEY) ?? 0));

  const snoozed = dismissedAt > 0 && Date.now() - dismissedAt < INSTALL_SNOOZE_DAYS * 86_400_000;
  const installed = isStandalone() || storageGet(INSTALLED_KEY) === "1";
  const mode: "native" | "ios" | null = prompt.canInstall ? "native" : prompt.showIosHint ? "ios" : null;

  const dismiss = useCallback(() => {
    const now = Date.now();
    storageSet(DISMISSED_AT_KEY, String(now));
    setDismissedAt(now);
  }, []);

  return { visible: !!mode && !installed && !snoozed, mode, install: prompt.install, dismiss };
}
