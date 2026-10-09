import { db } from "../../db/db";
import { gameRepository } from "../../db/repositories/gameRepository";
import { playRepository } from "../../db/repositories/playRepository";
import { isFieldEligible, type PlayCategory } from "../enums";
import { DomainError } from "../errors";
import type { Play, PlayParticipant } from "../models";
import { nowIso } from "../../utils/dates";
import { newId, participantId } from "../../utils/ids";
import { addEvent, requireActiveGame, touchGame, writeTx } from "./shared";

export interface RecordPlayInput {
  gameId: string;
  countsForMpr: boolean;
  playCategory?: PlayCategory;
  nonCountingReason?: string;
  confirmWrongPlayerCount?: boolean;
}

export interface RecordPlayResult {
  play: Play;
  participantIds: string[];
}

/**
 * Record one play atomically (01_DATA_MODEL.md §8.1). The current lineup is
 * preserved unchanged. If the selected count differs from the expected count
 * and the caller has not confirmed, PLAYER_COUNT_CONFIRMATION_REQUIRED is
 * thrown and nothing is written.
 */
export async function recordPlay(input: RecordPlayInput): Promise<RecordPlayResult> {
  return writeTx(
    [db.games, db.gamePlayers, db.currentLineupMembers, db.plays, db.playParticipants, db.gameEvents],
    async () => {
      const game = await requireActiveGame(input.gameId);
      const [lineup, gamePlayers] = await Promise.all([
        gameRepository.listLineup(game.id),
        gameRepository.listGamePlayers(game.id),
      ]);
      const eligible = new Set(gamePlayers.filter((gp) => isFieldEligible(gp.status)).map((gp) => gp.playerId));
      const participantPlayerIds = lineup.map((m) => m.playerId).filter((id) => eligible.has(id));

      const selected = participantPlayerIds.length;
      const expected = game.expectedPlayersOnField;
      const mismatch = selected !== expected;
      if (mismatch && !input.confirmWrongPlayerCount) {
        throw new DomainError(
          "PLAYER_COUNT_CONFIRMATION_REQUIRED",
          `Only ${selected} of ${expected} players are marked IN.`,
          { selected, expected },
        );
      }

      const now = nowIso();
      const play: Play = {
        id: newId(),
        gameId: game.id,
        playNumber: game.nextPlayNumber,
        quarter: game.currentQuarter,
        occurredAt: now,
        countsForMpr: input.countsForMpr,
        playCategory: input.playCategory ?? "scrimmage",
        nonCountingReason: input.countsForMpr ? undefined : input.nonCountingReason?.trim() || undefined,
        recordedPlayerCount: selected,
        expectedPlayerCount: expected,
        playerCountOverrideConfirmed: mismatch,
        voided: false,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      };
      const participants: PlayParticipant[] = participantPlayerIds.map((playerId) => ({
        id: participantId(play.id, playerId),
        playId: play.id,
        gameId: game.id,
        playerId,
      }));

      await playRepository.add(play);
      await playRepository.bulkAddParticipants(participants);
      await addEvent(game, {
        type: "play_recorded",
        entityType: "play",
        entityId: play.id,
        quarter: play.quarter,
        playNumber: play.playNumber,
        metadata: {
          countsForMpr: play.countsForMpr,
          playCategory: play.playCategory,
          nonCountingReason: play.nonCountingReason,
          recordedPlayerCount: selected,
          expectedPlayerCount: expected,
          playerCountOverrideConfirmed: mismatch,
        },
        createdAt: now,
      });
      // A new snap makes any pre-Clear lineup snapshot stale.
      await touchGame(game, { nextPlayNumber: game.nextPlayNumber + 1, clearedLineup: undefined });
      return { play, participantIds: participantPlayerIds };
    },
  );
}
