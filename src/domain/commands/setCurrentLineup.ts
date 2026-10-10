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

/**
 * Apply several IN/OUT choices in ONE transaction (the live screen batches rapid
 * taps through this so persistence keeps pace with the UI). The last choice for
 * a player wins. Players who can't be put IN because they are unavailable are
 * skipped and returned in `rejected`; the rest of the batch still commits.
 */
export async function setLineupMembership(
  gameId: string,
  changes: ReadonlyArray<readonly [playerId: string, selected: boolean]>,
): Promise<{ rejected: string[] }> {
  const desired = new Map(changes);
  if (desired.size === 0) return { rejected: [] };
  return writeTx([db.games, db.gamePlayers, db.currentLineupMembers], async () => {
    await requireActiveGame(gameId);
    const rejected: string[] = [];
    for (const [playerId, selected] of desired) {
      const id = lineupMemberId(gameId, playerId);
      const existing = await db.currentLineupMembers.get(id);
      if (selected) {
        const gp = await gameRepository.getGamePlayer(gamePlayerId(gameId, playerId));
        if (!gp || !isFieldEligible(gp.status)) {
          rejected.push(playerId);
          continue;
        }
        if (!existing) await gameRepository.putLineupMember({ id, gameId, playerId, selectedAt: nowIso() });
      } else if (existing) {
        await gameRepository.deleteLineupMember(id);
      }
    }
    return { rejected };
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

/**
 * Clear the lineup. A non-empty lineup is first saved on the game as a
 * restorable snapshot (see restoreClearedLineup). Clearing an already-empty
 * lineup leaves any existing snapshot untouched.
 */
export async function clearCurrentLineup(gameId: string): Promise<{ clearedCount: number }> {
  return writeTx([db.games, db.currentLineupMembers, db.gameEvents], async () => {
    const game = await requireActiveGame(gameId);
    const before = await gameRepository.listLineup(gameId);
    if (before.length === 0) return { clearedCount: 0 };
    const playerIds = before.map((m) => m.playerId);
    const now = nowIso();
    await gameRepository.clearLineup(gameId);
    await gameRepository.update(gameId, {
      clearedLineup: { playerIds, clearedAt: now, beforePlayNumber: game.nextPlayNumber },
      updatedAt: now,
    });
    await addEvent(game, {
      type: "lineup_cleared",
      entityType: "lineup",
      before: { playerIds },
      createdAt: now,
    });
    return { clearedCount: playerIds.length };
  });
}

export interface RestoreLineupResult {
  selectedCount: number;
  /** Snapshot players who are no longer available (injured, absent…) and were not restored. */
  skippedCount: number;
}

/**
 * Replace the current lineup with the exact lineup captured by the last Clear,
 * then discard the snapshot. Players who have since become unavailable are skipped.
 */
export async function restoreClearedLineup(gameId: string): Promise<RestoreLineupResult> {
  return writeTx([db.games, db.gamePlayers, db.currentLineupMembers, db.gameEvents], async () => {
    const game = await requireActiveGame(gameId);
    const snapshot = game.clearedLineup;
    if (!snapshot) throw new DomainError("NO_LINEUP_TO_RESTORE");
    const { selected, skipped } = await replaceLineupInTx(gameId, snapshot.playerIds);
    await gameRepository.update(gameId, { clearedLineup: undefined, updatedAt: nowIso() });
    await addEvent(game, {
      type: "lineup_restored",
      entityType: "lineup",
      after: { playerIds: selected },
      metadata: { clearedAt: snapshot.clearedAt, skippedPlayerIds: skipped },
    });
    return { selectedCount: selected.length, skippedCount: skipped.length };
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
      // Loading a preset is a deliberate new lineup: the pre-Clear snapshot is stale.
      if (game.clearedLineup) await gameRepository.update(gameId, { clearedLineup: undefined });
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
