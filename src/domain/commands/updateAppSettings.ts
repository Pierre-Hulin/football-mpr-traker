import { settingsRepository } from "../../db/repositories/settingsRepository";
import type { AppSettings } from "../models";
import { nowIso } from "../../utils/dates";

export async function updateAppSettings(changes: Partial<Omit<AppSettings, "id">>): Promise<void> {
  await settingsRepository.update({ ...changes, updatedAt: nowIso() });
}
