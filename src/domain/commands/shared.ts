import type { Table } from "dexie";
import { db } from "../../db/db";
import { eventRepository } from "../../db/repositories/eventRepository";
import { gameRepository } from "../../db/repositories/gameRepository";
import { DomainError } from "../errors";
import type { Game, GameEvent } from "../models";
import { nowIso } from "../../utils/dates";
import { newId } from "../../utils/ids";

/**
 * Run a read-write transaction. Domain errors pass through untouched; any other
 * failure is surfaced as DB_WRITE_FAILED so the UI never silently swallows it.
 * Dexie rolls the whole transaction back on any thrown error.
 */
export async function writeTx<T>(
  tables: Table<never, never>[] | Table[],
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction("rw", tables as Table[], fn);
  } catch (err) {
    if (err instanceof DomainError) throw err;
    const name = err instanceof Error ? err.name : "";
    const code =
      name === "DatabaseClosedError" || name === "OpenFailedError" || name === "MissingAPIError"
        ? "DB_UNAVAILABLE"
        : "DB_WRITE_FAILED";
    throw new DomainError(code, undefined, { cause: String(err) });
  }
}

export async function requireGame(gameId: string): Promise<Game> {
  const game = await gameRepository.get(gameId);
  if (!game) throw new DomainError("GAME_NOT_FOUND");
  return game;
}

export async function requireActiveGame(gameId: string): Promise<Game> {
  const game = await requireGame(gameId);
  if (game.status !== "active") throw new DomainError("GAME_NOT_ACTIVE");
  return game;
}

export async function addEvent(
  game: Pick<Game, "id" | "currentQuarter" | "nextPlayNumber">,
  event: Omit<GameEvent, "id" | "gameId" | "createdAt"> & { createdAt?: string },
): Promise<GameEvent> {
  const row: GameEvent = {
    id: newId(),
    gameId: game.id,
    quarter: game.currentQuarter,
    playNumber: game.nextPlayNumber,
    actor: "local_user",
    ...event,
    createdAt: event.createdAt ?? nowIso(),
  };
  await eventRepository.add(row);
  return row;
}

/** Persist material game changes with revision bump. */
export async function touchGame(game: Game, changes: Partial<Game>): Promise<Game> {
  const updated: Game = { ...game, ...changes, updatedAt: nowIso(), revision: game.revision + 1 };
  await gameRepository.put(updated);
  return updated;
}
