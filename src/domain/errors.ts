export type DomainErrorCode =
  | "DB_UNAVAILABLE"
  | "DB_WRITE_FAILED"
  | "GAME_NOT_FOUND"
  | "GAME_NOT_ACTIVE"
  | "GAME_NOT_DRAFT"
  | "GAME_ALREADY_ACTIVE"
  | "NO_ELIGIBLE_PLAYERS"
  | "PLAYER_COUNT_CONFIRMATION_REQUIRED"
  | "PLAYER_NOT_AVAILABLE"
  | "INVALID_PLAYER_STATUS_TRANSITION"
  | "PLAY_NOT_FOUND"
  | "PLAY_NUMBER_CONFLICT"
  | "NO_PLAY_TO_UNDO"
  | "TEAM_NOT_FOUND"
  | "TEAM_HAS_GAMES"
  | "PLAYER_NOT_FOUND"
  | "PRESET_NOT_FOUND"
  | "DUPLICATE_JERSEY"
  | "VALIDATION_FAILED"
  | "IMPORT_INVALID"
  | "BACKUP_VERSION_UNSUPPORTED";

const defaultMessages: Record<DomainErrorCode, string> = {
  DB_UNAVAILABLE:
    "Local storage is unavailable. This app requires browser storage to safely record a game. Try leaving Private Browsing or enabling site storage.",
  DB_WRITE_FAILED: "Could not save to local storage. Nothing was changed.",
  GAME_NOT_FOUND: "That game could not be found.",
  GAME_NOT_ACTIVE: "This game is not in progress.",
  GAME_NOT_DRAFT: "This game has already started.",
  GAME_ALREADY_ACTIVE: "A game is already in progress. Resume or end it first.",
  NO_ELIGIBLE_PLAYERS: "At least one player must be active to start the game.",
  PLAYER_COUNT_CONFIRMATION_REQUIRED:
    "The number of selected players does not match the expected count.",
  PLAYER_NOT_AVAILABLE: "That player is not available to play.",
  INVALID_PLAYER_STATUS_TRANSITION: "That status change is not allowed.",
  PLAY_NOT_FOUND: "That play could not be found.",
  PLAY_NUMBER_CONFLICT: "Another play already uses that play number.",
  NO_PLAY_TO_UNDO: "There is no play to undo.",
  TEAM_NOT_FOUND: "That team could not be found.",
  TEAM_HAS_GAMES: "This team has games recorded. Archive it instead.",
  PLAYER_NOT_FOUND: "That player could not be found.",
  PRESET_NOT_FOUND: "That preset could not be found.",
  DUPLICATE_JERSEY: "That jersey number is already in use.",
  VALIDATION_FAILED: "Some values are invalid.",
  IMPORT_INVALID: "The file could not be imported.",
  BACKUP_VERSION_UNSUPPORTED: "This backup was created by an unsupported app version.",
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DomainErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? defaultMessages[code]);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(err: unknown, code?: DomainErrorCode): err is DomainError {
  return err instanceof DomainError && (code === undefined || err.code === code);
}

const STORAGE_ERROR_NAMES = new Set([
  "QuotaExceededError",
  "DatabaseClosedError",
  "OpenFailedError",
  "MissingAPIError",
  "InvalidStateError",
  "UnknownError",
]);

/** True when an error indicates storage itself is failing (vs. a validation problem). */
export function isStorageError(err: unknown): boolean {
  if (err instanceof DomainError) return err.code === "DB_UNAVAILABLE" || err.code === "DB_WRITE_FAILED";
  return err instanceof Error && STORAGE_ERROR_NAMES.has(err.name);
}

/** Map any thrown value to a user-facing message. */
export function toUserMessage(err: unknown): string {
  if (err instanceof DomainError) return err.message;
  if (isStorageError(err)) return defaultMessages.DB_UNAVAILABLE;
  if (err instanceof Error && err.message) return err.message;
  return defaultMessages.DB_WRITE_FAILED;
}
