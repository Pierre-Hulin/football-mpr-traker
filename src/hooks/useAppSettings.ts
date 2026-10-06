import { useLiveQuery } from "dexie-react-hooks";
import { settingsRepository } from "../db/repositories/settingsRepository";
import { DEFAULT_APP_SETTINGS } from "../db/migrations";
import type { AppSettings } from "../domain/models";

export { updateAppSettings } from "../domain/commands/updateAppSettings";

export function useAppSettings(): AppSettings {
  const settings = useLiveQuery(() => settingsRepository.get(), []);
  return { ...DEFAULT_APP_SETTINGS, createdAt: "", updatedAt: "", ...settings };
}
