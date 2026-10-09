export const GAME_STATUSES = ["draft", "active", "completed", "abandoned"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const GAME_PLAYER_STATUSES = [
  "active",
  "absent",
  "late",
  "injured",
  "exempt",
  "ineligible",
] as const;
export type GamePlayerStatus = (typeof GAME_PLAYER_STATUSES)[number];

export const GAME_PLAYER_STATUS_LABELS: Record<GamePlayerStatus, string> = {
  active: "Active",
  absent: "Absent",
  late: "Late",
  injured: "Injured",
  exempt: "Exempt",
  ineligible: "Ineligible",
};

export type MprRiskLevel = "met" | "needs_plays" | "at_risk" | "critical" | "excluded";

export const EVENT_TYPES = [
  "game_started",
  "game_completed",
  "game_abandoned",
  "quarter_ended",
  "quarter_changed",
  "player_status_changed",
  "player_activated",
  "player_deactivated",
  "play_recorded",
  "play_voided",
  "play_restored",
  "play_corrected",
  "lineup_preset_applied",
  "lineup_cleared",
  "lineup_restored",
  "roster_imported",
  "game_exported",
  "manual_note",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const PRESET_TYPES = [
  "offense",
  "defense",
  "kickoff",
  "kick_return",
  "punt",
  "punt_return",
  "custom",
] as const;
export type PresetType = (typeof PRESET_TYPES)[number];

export const PRESET_TYPE_LABELS: Record<PresetType, string> = {
  offense: "Offense",
  defense: "Defense",
  kickoff: "Kickoff",
  kick_return: "Kick Return",
  punt: "Punt",
  punt_return: "Punt Return",
  custom: "Custom",
};

/** Short labels used on the live-game preset toolbar. */
export const PRESET_TYPE_SHORT: Record<PresetType, string> = {
  offense: "OFF",
  defense: "DEF",
  kickoff: "KO",
  kick_return: "KR",
  punt: "PUNT",
  punt_return: "PR",
  custom: "",
};

export const PLAY_CATEGORIES = ["scrimmage", "special_teams", "pat", "other"] as const;
export type PlayCategory = (typeof PLAY_CATEGORIES)[number];

export const NON_COUNTING_REASONS = [
  "Accepted penalty",
  "Kneel / spike",
  "PAT",
  "League rule",
  "Other",
] as const;

export const LIVE_ROSTER_VIEWS = ["list", "grid"] as const;
export type LiveRosterView = (typeof LIVE_ROSTER_VIEWS)[number];

export const PLAYER_SORTS = ["jersey", "name", "risk"] as const;
export type PlayerSort = (typeof PLAYER_SORTS)[number];

/** Statuses for which a player may be placed on the field. */
export function isFieldEligible(status: GamePlayerStatus): boolean {
  return status === "active";
}

export function quarterLabel(quarter: number): string {
  if (quarter <= 4) return `Q${quarter}`;
  const ot = quarter - 4;
  return ot === 1 ? "OT" : `OT${ot}`;
}
