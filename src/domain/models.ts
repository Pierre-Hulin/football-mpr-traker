import type {
  EventType,
  GamePlayerStatus,
  GameStatus,
  PlayCategory,
  LiveRosterView,
  PlayerSort,
  PresetType,
} from "./enums";

export interface Team {
  id: string;
  name: string;
  seasonLabel?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface Player {
  id: string;
  teamId: string;
  jerseyNumber: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  activeOnTeam: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamSettings {
  teamId: string;
  defaultRequiredPlays: number;
  defaultExpectedPlayersOnField: number;
  defaultMprDeadlineQuarter?: number;
  defaultCountsSpecialTeams: boolean;
  defaultCountsPat: boolean;
  defaultCountsAcceptedPenaltyPlays: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Game {
  id: string;
  teamId: string;
  opponent?: string;
  gameLabel?: string;
  gameDate: string; // local YYYY-MM-DD
  status: GameStatus;
  requiredPlaysDefault: number;
  expectedPlayersOnField: number;
  mprDeadlineQuarter?: number;
  countsSpecialTeams: boolean;
  countsPat: boolean;
  countsAcceptedPenaltyPlays: boolean;
  currentQuarter: number;
  nextPlayNumber: number;
  startedAt?: string;
  completedAt?: string;
  /** Lineup captured by the most recent Clear, restorable until it goes stale. */
  clearedLineup?: ClearedLineupSnapshot;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface ClearedLineupSnapshot {
  playerIds: string[];
  clearedAt: string;
  /** Game.nextPlayNumber at the moment of clearing. */
  beforePlayNumber: number;
}

export interface GamePlayer {
  id: string; // `${gameId}:${playerId}`
  gameId: string;
  playerId: string;
  status: GamePlayerStatus;
  minimumRequiredPlays: number;
  activatedAtPlayNumber?: number;
  deactivatedAtPlayNumber?: number;
  statusReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LineupPreset {
  id: string;
  teamId: string;
  name: string;
  type: PresetType;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LineupPresetMember {
  id: string; // `${presetId}:${playerId}`
  presetId: string;
  playerId: string;
}

export interface CurrentLineupMember {
  id: string; // `${gameId}:${playerId}`
  gameId: string;
  playerId: string;
  selectedAt: string;
}

export interface Play {
  id: string;
  gameId: string;
  playNumber: number;
  quarter: number;
  occurredAt: string;
  countsForMpr: boolean;
  playCategory?: PlayCategory;
  nonCountingReason?: string;
  recordedPlayerCount: number;
  expectedPlayerCount: number;
  playerCountOverrideConfirmed: boolean;
  voided: boolean;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface PlayParticipant {
  id: string; // `${playId}:${playerId}`
  playId: string;
  gameId: string;
  playerId: string;
}

export interface GameEvent {
  id: string;
  gameId: string;
  type: EventType;
  quarter?: number;
  playNumber?: number;
  actor?: "local_user" | "system";
  entityType?: "game" | "player" | "play" | "lineup" | "roster";
  entityId?: string;
  message?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AppSettings {
  id: "app";
  schemaVersion: number;
  lastActiveGameId?: string;
  onboardingCompleted: boolean;
  keepScreenAwakeEnabled: boolean;
  preferredPlayerSort: PlayerSort;
  liveRosterView: LiveRosterView;
  defaultExpectedPlayersOnField: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImportRecord {
  id: string;
  kind: "roster_csv" | "roster_text" | "roster_json" | "backup_json";
  fileName?: string;
  teamId?: string;
  rowsDetected?: number;
  rowsImported?: number;
  warnings?: string[];
  createdAt: string;
}

/** Snapshot metadata stored on `quarter_ended` events. */
export interface QuarterSnapshot {
  endedQuarter: number;
  nextQuarter: number;
  lastPlayNumber: number;
  playCountThroughQuarter: number;
  qualifyingPlaysInQuarter: number;
  playerCounts: Record<string, number>;
  playerStatuses: Record<string, GamePlayerStatus>;
  endedAt: string;
}
