import { db } from "../../db/db";
import { playRepository } from "../../db/repositories/playRepository";
import { DomainError } from "../errors";
import type { Play } from "../models";
import { computeNextPlayNumber } from "../selectors/getMprCounts";
import { nowIso } from "../../utils/dates";
import { addEvent, requireActiveGame, touchGame, writeTx } from "./shared";

const TABLES = () => [db.games, db.plays, db.gameEvents];

/** Void the most recent non-voided play (01_DATA_MODEL.md §8.2). */
export async function undoLastPlay(gameId: string): Promise<Play> {
  return writeTx(TABLES(), async () => {
    const game = await requireActiveGame(gameId);
    const plays = await playRepository.listByGame(gameId);
    const last = plays
      .filter((p) => !p.voided)
      .sort((a, b) => b.playNumber - a.playNumber || b.createdAt.localeCompare(a.createdAt))[0];
    if (!last) throw new DomainError("NO_PLAY_TO_UNDO");
    return voidInTx(game, plays, last, "Undo");
  });
}

/** Void any play from history (corrections flow). Plays are never renumbered. */
export async function voidPlay(playId: string, reason = "Voided from history"): Promise<Play> {
  return writeTx(TABLES(), async () => {
    const play = await playRepository.get(playId);
    if (!play) throw new DomainError("PLAY_NOT_FOUND");
    if (play.voided) return play;
    const game = await requireActiveGame(play.gameId);
    const plays = await playRepository.listByGame(play.gameId);
    return voidInTx(game, plays, play, reason);
  });
}

async function voidInTx(
  game: Awaited<ReturnType<typeof requireActiveGame>>,
  plays: Play[],
  play: Play,
  reason: string,
): Promise<Play> {
  const now = nowIso();
  const voided: Play = {
    ...play,
    voided: true,
    voidedAt: now,
    voidReason: reason,
    updatedAt: now,
    revision: play.revision + 1,
  };
  await playRepository.put(voided);
  const nextPlayNumber = computeNextPlayNumber(plays.map((p) => (p.id === play.id ? voided : p)));
  await addEvent(game, {
    type: "play_voided",
    entityType: "play",
    entityId: play.id,
    quarter: play.quarter,
    playNumber: play.playNumber,
    message: reason,
    before: { voided: false },
    after: { voided: true },
    createdAt: now,
  });
  await touchGame(game, { nextPlayNumber });
  return voided;
}

/** Restore a voided play, provided no other live play now uses its number. */
export async function restorePlay(playId: string): Promise<Play> {
  return writeTx(TABLES(), async () => {
    const play = await playRepository.get(playId);
    if (!play) throw new DomainError("PLAY_NOT_FOUND");
    if (!play.voided) return play;
    const game = await requireActiveGame(play.gameId);
    const plays = await playRepository.listByGame(play.gameId);
    const conflict = plays.some((p) => !p.voided && p.id !== play.id && p.playNumber === play.playNumber);
    if (conflict) {
      throw new DomainError(
        "PLAY_NUMBER_CONFLICT",
        `Play ${play.playNumber} has already been re-recorded, so this play cannot be restored.`,
      );
    }
    const now = nowIso();
    const restored: Play = {
      ...play,
      voided: false,
      voidedAt: undefined,
      voidReason: undefined,
      updatedAt: now,
      revision: play.revision + 1,
    };
    await playRepository.put(restored);
    const nextPlayNumber = computeNextPlayNumber(plays.map((p) => (p.id === play.id ? restored : p)));
    await addEvent(game, {
      type: "play_restored",
      entityType: "play",
      entityId: play.id,
      quarter: play.quarter,
      playNumber: play.playNumber,
      before: { voided: true },
      after: { voided: false },
      createdAt: now,
    });
    await touchGame(game, { nextPlayNumber });
    return restored;
  });
}
