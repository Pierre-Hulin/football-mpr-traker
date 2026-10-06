import { db } from "../../db/db";
import { teamRepository } from "../../db/repositories/teamRepository";
import { gameRepository } from "../../db/repositories/gameRepository";
import { DomainError } from "../errors";
import type { Team, TeamSettings } from "../models";
import { teamInputSchema, teamSettingsInputSchema, validate } from "../validation";
import { nowIso } from "../../utils/dates";
import { newId } from "../../utils/ids";
import { writeTx } from "./shared";

type TeamDefaults = Omit<TeamSettings, "teamId" | "createdAt" | "updatedAt">;

export const DEFAULT_TEAM_SETTINGS: Readonly<TeamDefaults> = {
  defaultRequiredPlays: 8,
  defaultExpectedPlayersOnField: 11,
  defaultMprDeadlineQuarter: 4,
  defaultCountsSpecialTeams: true,
  defaultCountsPat: true,
  defaultCountsAcceptedPenaltyPlays: false,
};

export interface CreateTeamInput {
  name: string;
  seasonLabel?: string;
  settings?: Partial<TeamDefaults>;
}

export async function createTeam(input: CreateTeamInput): Promise<Team> {
  const { name, seasonLabel } = validate(teamInputSchema, input);
  const settingsInput = validate(teamSettingsInputSchema, { ...DEFAULT_TEAM_SETTINGS, ...input.settings });
  const now = nowIso();
  const team: Team = { id: newId(), name, seasonLabel, createdAt: now, updatedAt: now };
  const settings: TeamSettings = { teamId: team.id, ...settingsInput, createdAt: now, updatedAt: now };
  await writeTx([db.teams, db.teamSettings], async () => {
    await teamRepository.put(team);
    await teamRepository.putSettings(settings);
  });
  return team;
}

export async function updateTeam(
  teamId: string,
  input: { name: string; seasonLabel?: string },
): Promise<Team> {
  const { name, seasonLabel } = validate(teamInputSchema, input);
  return writeTx([db.teams], async () => {
    const team = await teamRepository.get(teamId);
    if (!team) throw new DomainError("TEAM_NOT_FOUND");
    const updated: Team = { ...team, name, seasonLabel, updatedAt: nowIso() };
    await teamRepository.put(updated);
    return updated;
  });
}

export async function updateTeamSettings(
  teamId: string,
  input: Omit<TeamSettings, "teamId" | "createdAt" | "updatedAt">,
): Promise<TeamSettings> {
  const values = validate(teamSettingsInputSchema, input);
  return writeTx([db.teams, db.teamSettings], async () => {
    const team = await teamRepository.get(teamId);
    if (!team) throw new DomainError("TEAM_NOT_FOUND");
    const existing = await teamRepository.getSettings(teamId);
    const now = nowIso();
    const settings: TeamSettings = {
      teamId,
      ...values,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await teamRepository.putSettings(settings);
    return settings;
  });
}

export async function getTeamSettingsOrDefault(teamId: string): Promise<TeamSettings> {
  const existing = await teamRepository.getSettings(teamId);
  if (existing) return existing;
  const now = nowIso();
  return { teamId, ...DEFAULT_TEAM_SETTINGS, createdAt: now, updatedAt: now };
}

export async function archiveTeam(teamId: string, archived = true): Promise<void> {
  await writeTx([db.teams], async () => {
    const team = await teamRepository.get(teamId);
    if (!team) throw new DomainError("TEAM_NOT_FOUND");
    const now = nowIso();
    await teamRepository.put({ ...team, archivedAt: archived ? now : undefined, updatedAt: now });
  });
}

/** Hard-delete a team only if it has no games; otherwise archive is required. */
export async function deleteTeam(teamId: string): Promise<void> {
  await writeTx(
    [db.teams, db.teamSettings, db.players, db.games, db.lineupPresets, db.lineupPresetMembers],
    async () => {
      const games = await gameRepository.listByTeam(teamId);
      if (games.length > 0) throw new DomainError("TEAM_HAS_GAMES");
      const presets = await db.lineupPresets.where("teamId").equals(teamId).toArray();
      for (const p of presets) {
        await db.lineupPresetMembers.where("presetId").equals(p.id).delete();
      }
      await db.lineupPresets.where("teamId").equals(teamId).delete();
      await db.players.where("teamId").equals(teamId).delete();
      await teamRepository.deleteSettings(teamId);
      await teamRepository.delete(teamId);
    },
  );
}
