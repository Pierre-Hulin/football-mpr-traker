import { db } from "../db";
import type { LineupPreset, LineupPresetMember } from "../../domain/models";

export const presetRepository = {
  get: (id: string) => db.lineupPresets.get(id),
  listByTeam: (teamId: string) =>
    db.lineupPresets
      .where("[teamId+sortOrder]")
      .between([teamId, -Infinity], [teamId, Infinity])
      .toArray(),
  put: (preset: LineupPreset) => db.lineupPresets.put(preset),
  update: (id: string, changes: Partial<LineupPreset>) => db.lineupPresets.update(id, changes),
  delete: (id: string) => db.lineupPresets.delete(id),

  listMembers: (presetId: string) =>
    db.lineupPresetMembers.where("presetId").equals(presetId).toArray(),
  bulkPutMembers: (rows: LineupPresetMember[]) => db.lineupPresetMembers.bulkPut(rows),
  deleteMembers: (presetId: string) =>
    db.lineupPresetMembers.where("presetId").equals(presetId).delete(),
};
