import { useCallback, useEffect, useRef, useState } from "react";
import { watchGameLock, type GameLock } from "../domain/services/activeGameLockService";

/** Detect the same live game open in another tab. */
export function useGameLock(gameId: string | undefined, enabled: boolean) {
  const [conflict, setConflict] = useState(false);
  const lock = useRef<GameLock | null>(null);

  useEffect(() => {
    if (!gameId || !enabled) return;
    const l = watchGameLock(gameId, setConflict);
    lock.current = l;
    return () => {
      l.dispose();
      lock.current = null;
      setConflict(false);
    };
  }, [gameId, enabled]);

  const takeOver = useCallback(() => lock.current?.takeOver(), []);
  return { conflict, takeOver };
}
