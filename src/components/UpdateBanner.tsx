import { applyUpdate, useServiceWorkerState } from "../pwa/registerSW";
import { useActiveGame } from "../hooks/useActiveGame";

/**
 * PWA update prompt. Never reloads during an active game: the update is
 * deferred until the game ends (02_SCREEN_FLOW.md §46).
 */
export function UpdateBanner() {
  const { needRefresh } = useServiceWorkerState();
  const active = useActiveGame();
  if (!needRefresh || active === undefined) return null;
  if (active) {
    return (
      <div className="banner alert-info" role="status">
        Update available. It will be installed after the game.
      </div>
    );
  }
  return (
    <div className="banner alert-info" role="status">
      <span>Update available.</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => void applyUpdate()}>
        UPDATE NOW
      </button>
    </div>
  );
}
