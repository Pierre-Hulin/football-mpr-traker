import { db } from "../../db/db";
import { gameRepository } from "../../db/repositories/gameRepository";
import { playRepository } from "../../db/repositories/playRepository";
import type { PlayCategory } from "../enums";
import { DomainError } from "../errors";
import type { Play } from "../models";
import { nowIso } from "../../utils/dates";
import { participantId } from "../../utils/ids";
import { addEvent, requireActiveGame, writeTx } from "./shared";

export interface CorrectPlayChanges {
  participantIds?: string[];
  countsForMpr?: boolean;
  nonCountingReason?: string;
  playCategory?: PlayCategory;
  quarter?: number;
  /** Optional explanation recorded on the audit event. */
  reason?: string;
}

/**
 * Correct a historical play. Original creation time is preserved; revision is
 * incremented and a `play_corrected` audit event stores before/after values.
 */
export async function correctPlay(playId: string, changes: CorrectPlayChanges): Promise<Play> {
  return writeTx(
    [db.games, db.gamePlayers, db.plays, db.playParticipants, db.gameEvents],
    async () => {
      const play = await playRepository.get(playId);
      if (!play) throw new DomainError("PLAY_NOT_FOUND");
      const game = await requireActiveGame(play.gameId);

      const beforeParticipants = (await playRepository.listParticipantsByPlay(playId)).map((p) => p.playerId);
      const before = snapshot(play, beforeParticipants);

      let afterParticipants = beforeParticipants;
      if (changes.participantIds) {
        const gamePlayers = await gameRepository.listGamePlayers(game.id);
        const known = new Set(gamePlayers.map((gp) => gp.playerId));
        const unique = [...new Set(changes.participantIds)];
        if (unique.some((id) => !known.has(id))) {
          throw new DomainError("VALIDATION_FAILED", "Every participant must be on this game's roster.");
        }
        afterParticipants = unique;
      }

      if (changes.quarter !== undefined && (!Number.isInteger(changes.quarter) || changes.quarter < 1)) {
        throw new DomainError("VALIDATION_FAILED", "Quarter must be 1 or greater.");
      }

      const countsForMpr = changes.countsForMpr ?? play.countsForMpr;
      const updated: Play = {
        ...play,
        countsForMpr,
        nonCountingReason: countsForMpr
          ? undefined
          : (changes.nonCountingReason ?? play.nonCountingReason)?.trim() || undefined,
        playCategory: changes.playCategory ?? play.playCategory,
        quarter: changes.quarter ?? play.quarter,
        updatedAt: nowIso(),
        revision: play.revision + 1,
      };
      const after = snapshot(updated, afterParticipants);
      if (JSON.stringify(before) === JSON.stringify(after)) return play;

      await playRepository.put(updated);
      if (changes.participantIds) {
        await playRepository.deleteParticipantsByPlay(playId);
        await playRepository.bulkAddParticipants(
          afterParticipants.map((playerId) => ({
            id: participantId(playId, playerId),
            playId,
            gameId: game.id,
            playerId,
          })),
        );
      }
      await addEvent(game, {
        type: "play_corrected",
        entityType: "play",
        entityId: playId,
        quarter: updated.quarter,
        playNumber: updated.playNumber,
        message: changes.reason?.trim() || undefined,
        before,
        after,
      });
      return updated;
    },
  );
}

function snapshot(play: Play, participantIds: string[]) {
  return {
    countsForMpr: play.countsForMpr,
    nonCountingReason: play.nonCountingReason ?? null,
    playCategory: play.playCategory ?? null,
    quarter: play.quarter,
    participantIds: [...participantIds].sort(),
  };
}
