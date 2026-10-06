import { db } from "../../db/db";
import { GAME_PLAYER_STATUS_LABELS, quarterLabel } from "../enums";
import type { Game, LineupPreset, LineupPresetMember, Player, Team, TeamSettings } from "../models";
import type { GameData, GameView } from "../selectors/getGameState";
import { getGameSummary } from "../selectors/getGameSummary";
import { toCsv } from "../../utils/csv";
import { nowIso } from "../../utils/dates";
import { newId } from "../../utils/ids";
import { safeFilename, type ExportFile } from "../../utils/fileDownload";
import { sortPlayers } from "../../utils/sort";

function gameFileStem(game: Game, team?: Team): string {
  const opp = game.opponent || game.gameLabel || "game";
  return safeFilename(`${team?.name ?? "team"}-vs-${opp}-${game.gameDate}`);
}

/** One row per player: totals, minimum, remaining, final status, quarter breakdown. */
export function buildSummaryCsv(data: GameData, view: GameView): ExportFile {
  const summary = getGameSummary(view);
  const quarters = summary.quarters;
  const header = [
    "Jersey",
    "Player",
    "MPR Plays",
    "Minimum Required",
    "Remaining",
    "Final Status",
    ...quarters.map((q) => quarterLabel(q)),
  ];
  const rows = summary.rows.map((r) => [
    r.view.player.jerseyNumber,
    r.view.player.displayName,
    r.view.count,
    r.view.required,
    r.view.remaining,
    r.finalStatus === "met" ? "Met" : r.finalStatus === "short" ? `Short ${r.short}` : GAME_PLAYER_STATUS_LABELS[r.finalStatus],
    ...quarters.map((q) => r.view.quarterCounts[q] ?? 0),
  ]);
  return {
    filename: `${gameFileStem(data.game, data.team)}-summary.csv`,
    content: toCsv([header, ...rows]),
    mimeType: "text/csv",
  };
}

/** Full play ledger: one row per participant per play (01_DATA_MODEL.md §16). */
export function buildPlaysCsv(data: GameData, view: GameView): ExportFile {
  const header = [
    "Game Date",
    "Opponent",
    "Quarter",
    "Play Number",
    "Counts For MPR",
    "Non-Counting Reason",
    "Category",
    "Voided",
    "Player Count",
    "Expected Count",
    "Count Override",
    "Occurred At",
    "Player Jersey",
    "Player Name",
    "Player Status",
  ];
  const opponent = data.game.opponent ?? data.game.gameLabel ?? "";
  const rows: unknown[][] = [];
  for (const pv of view.plays) {
    const base = [
      data.game.gameDate,
      opponent,
      quarterLabel(pv.play.quarter),
      pv.play.playNumber,
      pv.play.countsForMpr ? "Yes" : "No",
      pv.play.nonCountingReason ?? "",
      pv.play.playCategory ?? "",
      pv.play.voided ? "Yes" : "No",
      pv.participantCount,
      pv.play.expectedPlayerCount,
      pv.play.playerCountOverrideConfirmed ? "Yes" : "No",
      pv.play.occurredAt,
    ];
    const participants = sortPlayers(
      pv.participantIds.map((id) => view.rowsById.get(id)?.player).filter((p): p is Player => !!p),
    );
    if (participants.length === 0) rows.push([...base, "", "", ""]);
    for (const p of participants) {
      const status = view.rowsById.get(p.id)?.gamePlayer.status;
      rows.push([...base, p.jerseyNumber, p.displayName, status ? GAME_PLAYER_STATUS_LABELS[status] : ""]);
    }
  }
  return {
    filename: `${gameFileStem(data.game, data.team)}-plays.csv`,
    content: toCsv([header, ...rows]),
    mimeType: "text/csv",
  };
}

export function buildRosterCsv(team: Team, players: Player[]): ExportFile {
  const rows = sortPlayers(players.filter((p) => p.activeOnTeam)).map((p) => [p.jerseyNumber, p.displayName, p.notes ?? ""]);
  return {
    filename: `${safeFilename(team.name)}-roster.csv`,
    content: toCsv([["Jersey", "Name", "Notes"], ...rows]),
    mimeType: "text/csv",
  };
}

// ---------- Team transfer file ----------

export interface TeamFileV1 {
  format: "mpr-tracker-team";
  version: 1;
  exportedAt: string;
  team: Team;
  teamSettings?: TeamSettings;
  players: Player[];
  lineupPresets: LineupPreset[];
  lineupPresetMembers: LineupPresetMember[];
}

export async function buildTeamFile(teamId: string): Promise<ExportFile> {
  const team = await db.teams.get(teamId);
  if (!team) throw new Error("Team not found");
  const [teamSettings, players, lineupPresets] = await Promise.all([
    db.teamSettings.get(teamId),
    db.players.where("teamId").equals(teamId).toArray(),
    db.lineupPresets.where("teamId").equals(teamId).toArray(),
  ]);
  const presetIds = lineupPresets.map((p) => p.id);
  const lineupPresetMembers = presetIds.length
    ? await db.lineupPresetMembers.where("presetId").anyOf(presetIds).toArray()
    : [];
  const file: TeamFileV1 = {
    format: "mpr-tracker-team",
    version: 1,
    exportedAt: nowIso(),
    team,
    teamSettings,
    players: players.filter((p) => p.activeOnTeam),
    lineupPresets,
    lineupPresetMembers,
  };
  return {
    filename: `${safeFilename(team.name)}-team.json`,
    content: JSON.stringify(file, null, 2),
    mimeType: "application/json",
  };
}

/** Record that a game was exported (audit only). */
export async function logGameExport(gameId: string, format: string): Promise<void> {
  try {
    const game = await db.games.get(gameId);
    if (!game) return;
    await db.gameEvents.add({
      id: newId(),
      gameId,
      type: "game_exported",
      quarter: game.currentQuarter,
      playNumber: game.nextPlayNumber,
      actor: "local_user",
      entityType: "game",
      entityId: gameId,
      metadata: { format },
      createdAt: nowIso(),
    });
  } catch {
    // Export logging must never block the export itself.
  }
}
