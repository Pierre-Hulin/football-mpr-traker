import { db } from "../db";
import type { AppSettings, ImportRecord } from "../../domain/models";

export const settingsRepository = {
  get: () => db.appSettings.get("app"),
  put: (settings: AppSettings) => db.appSettings.put(settings),
  update: (changes: Partial<AppSettings>) => db.appSettings.update("app", changes),

  addImportRecord: (record: ImportRecord) => db.importRecords.add(record),
};
