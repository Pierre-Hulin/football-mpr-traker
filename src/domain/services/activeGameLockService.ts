import { newId } from "../../utils/ids";

/**
 * Best-effort single-writer guard across browser tabs (02 §28 / 01 §21).
 * Each tab with a live game open broadcasts a heartbeat. A tab that hears a
 * heartbeat for the same game from another tab that claimed it earlier (or
 * that explicitly took over) reports a conflict.
 */
export interface LockMessage {
  type: "ACTIVE_GAME_HEARTBEAT" | "ACTIVE_GAME_TAKEOVER" | "ACTIVE_GAME_RELEASE";
  gameId: string;
  tabId: string;
  claimedAt: number;
  timestamp: number;
}

export const LOCK_CHANNEL = "mpr-active-game";
const HEARTBEAT_MS = 2000;
const STALE_MS = 6000;

export const TAB_ID = newId();

export interface GameLock {
  /** Claim the game for this tab (other tabs will become blocked). */
  takeOver: () => void;
  dispose: () => void;
}

export function watchGameLock(gameId: string, onConflict: (conflict: boolean) => void): GameLock {
  if (typeof BroadcastChannel === "undefined") {
    onConflict(false);
    return { takeOver: () => {}, dispose: () => {} };
  }
  const channel = new BroadcastChannel(LOCK_CHANNEL);
  let claimedAt = Date.now();
  // Other tabs that hold a stronger claim, with last-seen time.
  const rivals = new Map<string, number>();
  let lastReported: boolean | null = null;

  const report = () => {
    const now = Date.now();
    for (const [id, seen] of rivals) if (now - seen > STALE_MS) rivals.delete(id);
    const conflict = rivals.size > 0;
    if (conflict !== lastReported) {
      lastReported = conflict;
      onConflict(conflict);
    }
  };

  const send = (type: LockMessage["type"]) => {
    const msg: LockMessage = { type, gameId, tabId: TAB_ID, claimedAt, timestamp: Date.now() };
    channel.postMessage(msg);
  };

  channel.onmessage = (ev: MessageEvent<LockMessage>) => {
    const msg = ev.data;
    if (!msg || msg.gameId !== gameId || msg.tabId === TAB_ID) return;
    if (msg.type === "ACTIVE_GAME_RELEASE") {
      rivals.delete(msg.tabId);
    } else if (msg.type === "ACTIVE_GAME_TAKEOVER") {
      rivals.set(msg.tabId, Date.now());
    } else {
      // Older claim wins; ties broken by tab id.
      const theyWin = msg.claimedAt < claimedAt || (msg.claimedAt === claimedAt && msg.tabId < TAB_ID);
      if (theyWin) rivals.set(msg.tabId, Date.now());
      else rivals.delete(msg.tabId);
    }
    report();
  };

  send("ACTIVE_GAME_HEARTBEAT");
  const interval = setInterval(() => {
    // Only the current holder keeps broadcasting a claim.
    if (rivals.size === 0) send("ACTIVE_GAME_HEARTBEAT");
    report();
  }, HEARTBEAT_MS);
  report();

  return {
    takeOver: () => {
      // Negative timestamps outrank every normal claim; a newer takeover outranks an older one.
      claimedAt = -Date.now();
      rivals.clear();
      send("ACTIVE_GAME_TAKEOVER");
      report();
    },
    dispose: () => {
      clearInterval(interval);
      send("ACTIVE_GAME_RELEASE");
      channel.close();
    },
  };
}
