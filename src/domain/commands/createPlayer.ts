import { db } from "../../db/db";
import { playerRepository } from "../../db/repositories/playerRepository";
import { teamRepository } from "../../db/repositories/teamRepository";
import { DomainError } from "../errors";
import type { Player } from "../models";
import { playerInputSchema, validate } from "../validation";
import { nowIso } from "../../utils/dates";
import { newId } from "../../utils/ids";
import { writeTx } from "./shared";

export interface PlayerInput {
  jerseyNumber: string;
  displayName: string;
  notes?: string;
  /** Explicit override required to save a duplicate jersey number. */
  allowDuplicateJersey?: boolean;
}

/** Split a display name into first/last convenience fields. */
export function splitName(displayName: string): { firstName?: string; lastName?: string } {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: parts[0] || undefined };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Returns active teammates already wearing this jersey (excluding `excludePlayerId`). */
export async function findDuplicateJersey(
  teamId: string,
  jerseyNumber: string,
  excludePlayerId?: string,
): Promise<Player[]> {
  const matches = await playerRepository.findByJersey(teamId, jerseyNumber.trim());
  return matches.filter((p) => p.id !== excludePlayerId && p.activeOnTeam);
}

function duplicateError(existing: Player[]): DomainError {
  const first = existing[0];
  return new DomainError(
    "DUPLICATE_JERSEY",
    `#${first.jerseyNumber} is already assigned to ${first.displayName}.`,
    { existingPlayerId: first.id, existingPlayerName: first.displayName },
  );
}

export async function createPlayer(teamId: string, input: PlayerInput): Promise<Player> {
  const values = validate(playerInputSchema, input);
  return writeTx([db.teams, db.players], async () => {
    const team = await teamRepository.get(teamId);
    if (!team) throw new DomainError("TEAM_NOT_FOUND");
    const dupes = await findDuplicateJersey(teamId, values.jerseyNumber);
    if (dupes.length > 0 && !input.allowDuplicateJersey) throw duplicateError(dupes);
    const now = nowIso();
    const player: Player = {
      id: newId(),
      teamId,
      jerseyNumber: values.jerseyNumber,
      displayName: values.displayName,
      ...splitName(values.displayName),
      notes: values.notes,
      activeOnTeam: true,
      createdAt: now,
      updatedAt: now,
    };
    await playerRepository.put(player);
    return player;
  });
}

export async function updatePlayer(playerId: string, input: PlayerInput): Promise<Player> {
  const values = validate(playerInputSchema, input);
  return writeTx([db.players], async () => {
    const player = await playerRepository.get(playerId);
    if (!player) throw new DomainError("PLAYER_NOT_FOUND");
    const dupes = await findDuplicateJersey(player.teamId, values.jerseyNumber, playerId);
    if (dupes.length > 0 && !input.allowDuplicateJersey) throw duplicateError(dupes);
    const updated: Player = {
      ...player,
      jerseyNumber: values.jerseyNumber,
      displayName: values.displayName,
      ...splitName(values.displayName),
      notes: values.notes,
      updatedAt: nowIso(),
    };
    await playerRepository.put(updated);
    return updated;
  });
}

async function setActiveOnTeam(playerId: string, activeOnTeam: boolean): Promise<void> {
  await writeTx([db.players], async () => {
    const player = await playerRepository.get(playerId);
    if (!player) throw new DomainError("PLAYER_NOT_FOUND");
    await playerRepository.put({ ...player, activeOnTeam, updatedAt: nowIso() });
  });
}

/** Soft-remove from the team roster; historical games keep the player. */
export const deactivatePlayer = (playerId: string) => setActiveOnTeam(playerId, false);
export const activatePlayer = (playerId: string) => setActiveOnTeam(playerId, true);
