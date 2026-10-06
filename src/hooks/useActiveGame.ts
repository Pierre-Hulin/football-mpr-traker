import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "../db/db";
import { buildGameView, type GameData, type GameView } from "../domain/selectors/getGameState";
import { getActiveGame, loadGameData } from "../domain/selectors/queries";
import type { Game, Team } from "../domain/models";
import type { PlayerSort } from "../domain/enums";

/** The current in-progress game (with team), `null` if none, `undefined` while loading. */
export function useActiveGame(): { game: Game; team?: Team } | null | undefined {
  return useLiveQuery(async () => {
    const game = await getActiveGame();
    if (!game) return null;
    return { game, team: await db.teams.get(game.teamId) };
  }, []);
}

/** Live-updating game data. `null` = not found, `undefined` = loading. */
export function useGameData(gameId: string | undefined): GameData | null | undefined {
  return useLiveQuery(async () => (gameId ? loadGameData(gameId) : null), [gameId]);
}

export function useGameView(
  gameId: string | undefined,
  sort: PlayerSort = "jersey",
): { data: GameData | null | undefined; view: GameView | null | undefined } {
  const data = useGameData(gameId);
  const view = useMemo(() => (data ? buildGameView(data, sort) : data), [data, sort]);
  return { data, view };
}
