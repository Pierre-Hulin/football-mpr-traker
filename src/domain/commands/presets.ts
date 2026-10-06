import { db } from "../../db/db";
import { playerRepository } from "../../db/repositories/playerRepository";
import { presetRepository } from "../../db/repositories/presetRepository";
import { teamRepository } from "../../db/repositories/teamRepository";
import { PRESET_TYPES, type PresetType } from "../enums";
import { DomainError } from "../errors";
import type { LineupPreset } from "../models";
import { nowIso } from "../../utils/dates";
import { newId, presetMemberId } from "../../utils/ids";
import { writeTx } from "./shared";

export interface PresetInput {
  name: string;
  type: PresetType;
  playerIds: string[];
}

function defaultSortOrder(type: PresetType): number {
  return PRESET_TYPES.indexOf(type) * 100;
}

async function validatePresetInput(teamId: string, input: PresetInput) {
  const name = input.name.trim();
  if (!name) throw new DomainError("VALIDATION_FAILED", "Preset name is required.");
  if (!PRESET_TYPES.includes(input.type)) throw new DomainError("VALIDATION_FAILED", "Invalid preset type.");
  const players = await playerRepository.bulkGet([...new Set(input.playerIds)]);
  if (players.some((p) => !p || p.teamId !== teamId)) {
    throw new DomainError("VALIDATION_FAILED", "Preset players must belong to the team.");
  }
  return { name, playerIds: [...new Set(input.playerIds)] };
}

export async function createPreset(teamId: string, input: PresetInput): Promise<LineupPreset> {
  return writeTx([db.teams, db.players, db.lineupPresets, db.lineupPresetMembers], async () => {
    const team = await teamRepository.get(teamId);
    if (!team) throw new DomainError("TEAM_NOT_FOUND");
    const { name, playerIds } = await validatePresetInput(teamId, input);
    const existing = await presetRepository.listByTeam(teamId);
    const now = nowIso();
    const preset: LineupPreset = {
      id: newId(),
      teamId,
      name,
      type: input.type,
      sortOrder: defaultSortOrder(input.type) + existing.length,
      createdAt: now,
      updatedAt: now,
    };
    await presetRepository.put(preset);
    await presetRepository.bulkPutMembers(
      playerIds.map((playerId) => ({ id: presetMemberId(preset.id, playerId), presetId: preset.id, playerId })),
    );
    return preset;
  });
}

export async function updatePreset(presetId: string, input: PresetInput): Promise<LineupPreset> {
  return writeTx([db.players, db.lineupPresets, db.lineupPresetMembers], async () => {
    const preset = await presetRepository.get(presetId);
    if (!preset) throw new DomainError("PRESET_NOT_FOUND");
    const { name, playerIds } = await validatePresetInput(preset.teamId, input);
    const updated: LineupPreset = {
      ...preset,
      name,
      type: input.type,
      sortOrder: preset.type === input.type ? preset.sortOrder : defaultSortOrder(input.type),
      updatedAt: nowIso(),
    };
    await presetRepository.put(updated);
    await presetRepository.deleteMembers(presetId);
    await presetRepository.bulkPutMembers(
      playerIds.map((playerId) => ({ id: presetMemberId(presetId, playerId), presetId, playerId })),
    );
    return updated;
  });
}

export async function deletePreset(presetId: string): Promise<void> {
  await writeTx([db.lineupPresets, db.lineupPresetMembers], async () => {
    await presetRepository.deleteMembers(presetId);
    await presetRepository.delete(presetId);
  });
}

/** Move a preset up/down within the team's ordering. */
export async function movePreset(presetId: string, direction: -1 | 1): Promise<void> {
  await writeTx([db.lineupPresets], async () => {
    const preset = await presetRepository.get(presetId);
    if (!preset) throw new DomainError("PRESET_NOT_FOUND");
    const list = await presetRepository.listByTeam(preset.teamId);
    const index = list.findIndex((p) => p.id === presetId);
    const swapWith = list[index + direction];
    if (!swapWith) return;
    const reordered = [...list];
    reordered[index] = swapWith;
    reordered[index + direction] = preset;
    const now = nowIso();
    for (let i = 0; i < reordered.length; i++) {
      await presetRepository.update(reordered[i].id, { sortOrder: i * 10, updatedAt: now });
    }
  });
}
