import { z } from "zod";
import {
  EVENT_TYPES,
  GAME_PLAYER_STATUSES,
  GAME_STATUSES,
  PLAY_CATEGORIES,
  PRESET_TYPES,
} from "./enums";
import { DomainError } from "./errors";

// ---------- Command input schemas ----------

const trimmed = z.string().transform((s) => s.trim());
const optionalTrimmed = z
  .string()
  .optional()
  .transform((s) => (s && s.trim().length > 0 ? s.trim() : undefined));

export const teamInputSchema = z.object({
  name: trimmed.pipe(z.string().min(1, "Team name is required")),
  seasonLabel: optionalTrimmed,
});

export const playerInputSchema = z.object({
  jerseyNumber: trimmed.pipe(z.string().min(1, "Jersey number is required").max(6)),
  displayName: trimmed.pipe(z.string().min(1, "Player name is required")),
  notes: optionalTrimmed,
});

export const gameRulesSchema = z.object({
  requiredPlays: z.number().int().min(0, "Minimum plays must be 0 or more").max(200),
  expectedPlayersOnField: z.number().int().min(1, "Players on field must be at least 1").max(30),
  mprDeadlineQuarter: z.number().int().min(1).max(4).optional(),
  countsSpecialTeams: z.boolean(),
  countsPat: z.boolean(),
  countsAcceptedPenaltyPlays: z.boolean(),
});

export const teamSettingsInputSchema = z.object({
  defaultRequiredPlays: z.number().int().min(0).max(200),
  defaultExpectedPlayersOnField: z.number().int().min(1).max(30),
  defaultMprDeadlineQuarter: z.number().int().min(1).max(4).optional(),
  defaultCountsSpecialTeams: z.boolean(),
  defaultCountsPat: z.boolean(),
  defaultCountsAcceptedPenaltyPlays: z.boolean(),
});

/** Parse with a schema and convert failures into a VALIDATION_FAILED DomainError. */
export function validate<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new DomainError("VALIDATION_FAILED", first?.message ?? "Invalid input", {
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return result.data;
}

// ---------- Entity schemas (used to validate backup files) ----------

const iso = z.string().min(1);
const opt = <T extends z.ZodType>(s: T) => s.optional();

export const teamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  seasonLabel: opt(z.string()),
  createdAt: iso,
  updatedAt: iso,
  archivedAt: opt(z.string()),
});

export const playerSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  jerseyNumber: z.string(),
  firstName: opt(z.string()),
  lastName: opt(z.string()),
  displayName: z.string().min(1),
  activeOnTeam: z.boolean(),
  notes: opt(z.string()),
  createdAt: iso,
  updatedAt: iso,
});

export const teamSettingsSchema = z.object({
  teamId: z.string().min(1),
  defaultRequiredPlays: z.number().int().min(0),
  defaultExpectedPlayersOnField: z.number().int().min(1),
  defaultMprDeadlineQuarter: opt(z.number().int()),
  defaultCountsSpecialTeams: z.boolean(),
  defaultCountsPat: z.boolean(),
  defaultCountsAcceptedPenaltyPlays: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
});

export const gameSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  opponent: opt(z.string()),
  gameLabel: opt(z.string()),
  gameDate: z.string(),
  status: z.enum(GAME_STATUSES),
  requiredPlaysDefault: z.number().int().min(0),
  expectedPlayersOnField: z.number().int().min(1),
  mprDeadlineQuarter: opt(z.number().int()),
  countsSpecialTeams: z.boolean(),
  countsPat: z.boolean(),
  countsAcceptedPenaltyPlays: z.boolean(),
  currentQuarter: z.number().int().min(1),
  nextPlayNumber: z.number().int().min(1),
  startedAt: opt(z.string()),
  completedAt: opt(z.string()),
  clearedLineup: opt(
    z.object({
      playerIds: z.array(z.string()),
      clearedAt: z.string(),
      beforePlayNumber: z.number().int(),
    }),
  ),
  createdAt: iso,
  updatedAt: iso,
  revision: z.number().int(),
});

export const gamePlayerSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  status: z.enum(GAME_PLAYER_STATUSES),
  minimumRequiredPlays: z.number().int().min(0),
  activatedAtPlayNumber: opt(z.number().int()),
  deactivatedAtPlayNumber: opt(z.number().int()),
  statusReason: opt(z.string()),
  createdAt: iso,
  updatedAt: iso,
});

export const lineupPresetSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(PRESET_TYPES),
  sortOrder: z.number(),
  createdAt: iso,
  updatedAt: iso,
});

export const lineupPresetMemberSchema = z.object({
  id: z.string().min(1),
  presetId: z.string().min(1),
  playerId: z.string().min(1),
});

export const currentLineupMemberSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  selectedAt: iso,
});

export const playSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  playNumber: z.number().int().min(1),
  quarter: z.number().int().min(1),
  occurredAt: iso,
  countsForMpr: z.boolean(),
  playCategory: opt(z.enum(PLAY_CATEGORIES)),
  nonCountingReason: opt(z.string()),
  recordedPlayerCount: z.number().int().min(0),
  expectedPlayerCount: z.number().int().min(0),
  playerCountOverrideConfirmed: z.boolean(),
  voided: z.boolean(),
  voidedAt: opt(z.string()),
  voidReason: opt(z.string()),
  createdAt: iso,
  updatedAt: iso,
  revision: z.number().int(),
});

export const playParticipantSchema = z.object({
  id: z.string().min(1),
  playId: z.string().min(1),
  gameId: z.string().min(1),
  playerId: z.string().min(1),
});

export const gameEventSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  quarter: opt(z.number().int()),
  playNumber: opt(z.number().int()),
  actor: opt(z.enum(["local_user", "system"])),
  entityType: opt(z.enum(["game", "player", "play", "lineup", "roster"])),
  entityId: opt(z.string()),
  message: opt(z.string()),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  metadata: opt(z.record(z.string(), z.unknown())),
  createdAt: iso,
});
