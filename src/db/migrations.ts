import { db } from "./db";
import { SCHEMA_VERSION } from "./schema";
import type { AppSettings } from "../domain/models";
import { nowIso } from "../utils/dates";
import { DomainError } from "../domain/errors";

export const DEFAULT_APP_SETTINGS: Omit<AppSettings, "createdAt" | "updatedAt"> = {
  id: "app",
  schemaVersion: SCHEMA_VERSION,
  onboardingCompleted: false,
  keepScreenAwakeEnabled: true,
  preferredPlayerSort: "jersey",
  liveRosterView: "list",
  defaultExpectedPlayersOnField: 11,
};

/**
 * Open the database and make sure the singleton AppSettings record exists.
 * Throws DB_UNAVAILABLE if IndexedDB cannot be used (e.g. private browsing).
 */
export async function initializeDatabase(): Promise<AppSettings> {
  try {
    if (!db.isOpen()) await db.open();
    return await db.transaction("rw", db.appSettings, async () => {
      const existing = await db.appSettings.get("app");
      if (existing) {
        if (existing.schemaVersion !== SCHEMA_VERSION) {
          const updated = { ...DEFAULT_APP_SETTINGS, ...existing, schemaVersion: SCHEMA_VERSION, updatedAt: nowIso() };
          await db.appSettings.put(updated);
          return updated;
        }
        return { ...DEFAULT_APP_SETTINGS, ...existing };
      }
      const now = nowIso();
      const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, createdAt: now, updatedAt: now };
      await db.appSettings.put(settings);
      return settings;
    });
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw new DomainError("DB_UNAVAILABLE", undefined, { cause: String(err) });
  }
}
