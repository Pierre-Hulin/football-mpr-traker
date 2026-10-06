import { db } from "../../db/db";
import { playerRepository } from "../../db/repositories/playerRepository";
import { settingsRepository } from "../../db/repositories/settingsRepository";
import { teamRepository } from "../../db/repositories/teamRepository";
import { DomainError } from "../errors";
import type { ImportRecord, Player } from "../models";
import { playerInputSchema, validate } from "../validation";
import { nowIso } from "../../utils/dates";
import { newId } from "../../utils/ids";
import { splitName } from "./createPlayer";
import { writeTx } from "./shared";

export interface ImportRosterInput {
  teamId: string;
  rows: { jerseyNumber: string; displayName: string }[];
  kind: ImportRecord["kind"];
  fileName?: string;
  rowsDetected?: number;
  warnings?: string[];
}

/**
 * Create all reviewed roster rows in a single transaction. If any write fails,
 * nothing is imported.
 */
export async function importRoster(input: ImportRosterInput): Promise<Player[]> {
  if (input.rows.length === 0) throw new DomainError("IMPORT_INVALID", "No players to import.");
  const now = nowIso();
  const players: Player[] = input.rows.map((row) => {
    const values = validate(playerInputSchema, row);
    return {
      id: newId(),
      teamId: input.teamId,
      jerseyNumber: values.jerseyNumber,
      displayName: values.displayName,
      ...splitName(values.displayName),
      activeOnTeam: true,
      createdAt: now,
      updatedAt: now,
    };
  });

  await writeTx([db.teams, db.players, db.importRecords], async () => {
    const team = await teamRepository.get(input.teamId);
    if (!team) throw new DomainError("TEAM_NOT_FOUND");
    await playerRepository.bulkAdd(players);
    await settingsRepository.addImportRecord({
      id: newId(),
      kind: input.kind,
      fileName: input.fileName,
      teamId: input.teamId,
      rowsDetected: input.rowsDetected ?? input.rows.length,
      rowsImported: players.length,
      warnings: input.warnings,
      createdAt: now,
    });
  });
  return players;
}
