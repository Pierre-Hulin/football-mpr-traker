import { useEffect, useId, useRef, useState } from "react";
import { iosBrowser, useInstallNudge } from "../../hooks/useInstallPrompt";

/**
 * Floating install nudge for the landing page.
 * Collapsed, it is a compact bar that never hides the page's main actions.
 * "Install" uses the browser's native prompt where one exists. On iPhone,
 * "Show me" expands the bar into the Add to Home Screen steps.
 * "Not now" snoozes it; it never appears once the app is installed.
 */
export function InstallPrompt({ onHeightChange }: { onHeightChange?: (px: number) => void }) {
  const { visible, mode, install, dismiss } = useInstallNudge();
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!visible || !el || !onHeightChange) {
      onHeightChange?.(0);
      return;
    }
    const report = () => onHeightChange(el.offsetHeight);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible, onHeightChange]);

  if (!visible || !mode) return null;

  const close = () => {
    setExpanded(false);
    dismiss();
  };

  return (
    <div className="install-bar" ref={ref}>
      <section className="install-card" aria-labelledby={titleId} data-testid="install-prompt" data-mode={mode}>
        <div className="install-row">
          <img src="/icons/icon-192.png" alt="" width={40} height={40} />
          <div className="install-text">
            <h2 className="install-title" id={titleId}>
              Install MPR Tracker
            </h2>
            <p className="install-sub">One tap from your Home Screen · full screen · works offline</p>
          </div>
          <button type="button" className="install-close" aria-label="Dismiss install suggestion" onClick={close}>
            ✕
          </button>
        </div>

        {expanded && (
          <>
            <ul className="install-benefits">
              <li>Opens straight from your Home Screen, ready before the next snap</li>
              <li>Full screen, with no browser bars taking up space</li>
              <li>Works with no signal on the sideline</li>
            </ul>
            {mode === "ios" && (
              <ol className="install-steps" aria-label="How to add to your Home Screen" data-testid="install-steps">
                <li>
                  <span>
                    Tap <ShareIcon /> <b>Share</b>{" "}
                    {iosBrowser() === "safari" ? "in Safari's toolbar" : "next to the address bar"}
                  </span>
                </li>
                <li>
                  <span>
                    Scroll down and tap <AddIcon /> <b>Add to Home Screen</b>
                  </span>
                </li>
                <li>
                  <span>
                    Tap <b>Add</b>, then open MPR Tracker from your Home Screen
                  </span>
                </li>
              </ol>
            )}
          </>
        )}

        <div className="install-actions">
          {mode === "native" ? (
            <button type="button" className="btn btn-primary" onClick={() => void install()} data-testid="install-native">
              Install app
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              data-testid="install-howto"
            >
              {expanded ? "Got it" : "Show me how"}
            </button>
          )}
          {mode === "native" && !expanded && (
            <button type="button" className="btn btn-secondary" onClick={() => setExpanded(true)}>
              Why?
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={close} data-testid="install-later">
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Share icon">
      <path d="M9 14V2M5 6l4-4 4 4" />
      <path d="M5 9H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" role="img" aria-label="Add icon">
      <rect x="2" y="2" width="16" height="16" rx="3" />
      <path d="M10 6v8M6 10h8" />
    </svg>
  );
}
