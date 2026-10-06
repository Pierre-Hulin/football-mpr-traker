import { db } from "../db";
import type { GameEvent } from "../../domain/models";
import type { EventType } from "../../domain/enums";

export const eventRepository = {
  add: (event: GameEvent) => db.gameEvents.add(event),
  listByGame: (gameId: string) =>
    db.gameEvents.where("[gameId+createdAt]").between([gameId, ""], [gameId, "￿"]).toArray(),
  listByType: (gameId: string, type: EventType) =>
    db.gameEvents.where("[gameId+type]").equals([gameId, type]).toArray(),
};
