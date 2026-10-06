import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds; default 4000. */
  duration?: number;
  tone?: "default" | "error";
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (opts: ToastOptions) => void;
  dismiss: () => void;
  /** Screen-reader-only announcement (aria-live). */
  announce: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Single-slot toast: a new toast replaces the current one (never stacks).
 * Every toast message is also announced through an aria-live region.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const counter = useRef(0);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  const announce = useCallback((message: string) => {
    // Clearing first makes repeated identical messages re-announce.
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 30);
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      window.clearTimeout(timer.current);
      counter.current += 1;
      setToast({ ...opts, id: counter.current });
      announce(opts.message);
      timer.current = window.setTimeout(() => setToast(null), opts.duration ?? 4000);
    },
    [announce],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const api = useMemo(() => ({ show, dismiss, announce }), [show, dismiss, announce]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="toast-region">
        {toast && (
          <div key={toast.id} className={`toast ${toast.tone === "error" ? "toast-error" : ""}`} data-testid="toast">
            <span className="toast-msg">{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  const action = toast.onAction;
                  dismiss();
                  action?.();
                }}
              >
                {toast.actionLabel}
              </button>
            )}
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={dismiss}>
              ✕
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
