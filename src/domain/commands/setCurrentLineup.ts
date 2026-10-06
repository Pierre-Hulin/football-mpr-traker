import { db } from "../../db/db";
import { gameRepository } from "../../db/repositories/gameRepository";
import { presetRepository } from "../../db/repositories/presetRepository";
import { isFieldEligible } from "../enums";
import { DomainError } from "../errors";
import type { CurrentLineupMember } from "../models";
import { nowIso } from "../../utils/dates";
import { gamePlayerId, lineupMemberId } from "../../utils/ids";
import { addEvent, requireActiveGame, writeTx } from "./shared";

/** Toggle (or explicitly set) a player's place in the current lineup. Returns new state. */
export async function togglePlayerInLineup(
  gameId: string,
  playerId: string,
  selected?: boolean,
): Promise<boolean> {
  return writeTx([db.games, db.gamePlayers, db.currentLineupMembers], async () => {
    await requireActiveGame(gameId);
    const id = lineupMemberId(gameId, playerId);
    const existing = await db.currentLineupMembers.get(id);
    const next = selected ?? !existing;
    if (next) {
      const gp = await gameRepository.getGamePlayer(gamePlayerId(gameId, playerId));
      if (!gp || !isFieldEligible(gp.status)) throw new DomainError("PLAYER_NOT_AVAILABLE");
      if (!existing) await gameRepository.putLineupMember({ id, gameId, playerId, selectedAt: nowIso() });
    } else if (existing) {
      await gameRepository.deleteLineupMember(id);
    }
    return next;
  });
}

/** Replace the lineup with the given players (unavailable players are skipped). */
export async function replaceCurrentLineup(
  gameId: string,
  playerIds: string[],
): Promise<{ selected: string[]; skipped: string[] }> {
  return writeTx([db.games, db.gamePlayers, db.currentLineupMembers], async () => {
    await requireActiveGame(gameId);
    return replaceLineupInTx(gameId, playerIds);
  });
}

async function replaceLineupInTx(gameId: string, playerIds: string[]) {
  const gamePlayers = await gameRepository.listGamePlayers(gameId);
  const eligible = new Set(gamePlayers.filter((gp) => isFieldEligible(gp.status)).map((gp) => gp.playerId));
  const unique = [...new Set(playerIds)];
  const selected = unique.filter((id) => eligible.has(id));
  const skipped = unique.filter((id) => !eligible.has(id));
  const now = nowIso();
  await gameRepository.clearLineup(gameId);
  const rows: CurrentLineupMember[] = selected.map((playerId) => ({
    id: lineupMemberId(gameId, playerId),
    gameId,
    playerId,
    selectedAt: now,
  }));
  await gameRepository.bulkPutLineup(rows);
  return { selected, skipped };
}

export async function clearCurrentLineup(gameId: string): Promise<void> {
  await writeTx([db.games, db.currentLineupMembers, db.gameEvents], async () => {
    const game = await requireActiveGame(gameId);
    const before = await gameRepository.listLineup(gameId);
    await gameRepository.clearLineup(gameId);
    if (before.length > 0) {
      await addEvent(game, {
        type: "lineup_cleared",
        entityType: "lineup",
        before: { playerIds: before.map((m) => m.playerId) },
      });
    }
  });
}

export interface ApplyPresetResult {
  presetName: string;
  selectedCount: number;
  skippedCount: number;
}

/** Replace the current lineup with a preset's available members (one transaction). */
export async function applyLineupPreset(gameId: string, presetId: string): Promise<ApplyPresetResult> {
  return writeTx(
    [db.games, db.gamePlayers, db.currentLineupMembers, db.lineupPresets, db.lineupPresetMembers, db.gameEvents],
    async () => {
      const game = await requireActiveGame(gameId);
      const preset = await presetRepository.get(presetId);
      if (!preset || preset.teamId !== game.teamId) throw new DomainError("PRESET_NOT_FOUND");
      const members = await presetRepository.listMembers(presetId);
      const { selected, skipped } = await replaceLineupInTx(
        gameId,
        members.map((m) => m.playerId),
      );
      await addEvent(game, {
        type: "lineup_preset_applied",
        entityType: "lineup",
        entityId: presetId,
        message: preset.name,
        after: { playerIds: selected },
        metadata: { skippedPlayerIds: skipped },
      });
      return { presetName: preset.name, selectedCount: selected.length, skippedCount: skipped.length };
    },
  );
}
