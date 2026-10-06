import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/db";
import { initializeDatabase } from "../../src/db/migrations";
import { SCHEMA_VERSION } from "../../src/db/schema";
import { buildBackup, clearAllData, importTeamFile, parseTeamFile, previewBackup, replaceAllData } from "../../src/domain/services/backupService";
import { buildPlaysCsv, buildSummaryCsv, buildTeamFile } from "../../src/domain/services/exportService";
import { createPreset } from "../../src/domain/commands/presets";
import { recordPlay } from "../../src/domain/commands/recordPlay";
import { createPlayer } from "../../src/domain/commands/createPlayer";
import { isDomainError } from "../../src/domain/errors";
import { loadGameData } from "../../src/domain/selectors/queries";
import { buildGameView } from "../../src/domain/selectors/getGameState";
import { parseCsv } from "../../src/utils/csv";
import { recordN, resetDb, seedActiveGame, setLineup } from "../helpers";

beforeEach(resetDb);

describe("app settings bootstrap", () => {
  it("creates the singleton settings record", async () => {
    const s = await db.appSettings.get("app");
    expect(s?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s?.keepScreenAwakeEnabled).toBe(true);
    // idempotent
    await initializeDatabase();
    expect(await db.appSettings.count()).toBe(1);
  });
});

describe("csv export", () => {
  it("builds summary and play ledger CSVs with escaping", async () => {
    const { team, game, players } = await seedActiveGame();
    await createPlayer(team.id, { jerseyNumber: "99", displayName: 'Tricky "Quote", Jr.' });
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 2);
    await recordPlay({ gameId: game.id, countsForMpr: false, nonCountingReason: "Accepted penalty" });
    const data = (await loadGameData(game.id))!;
    const view = buildGameView(data);

    const summary = buildSummaryCsv(data, view);
    const sRows = parseCsv(summary.content);
    expect(sRows[0].slice(0, 6)).toEqual(["Jersey", "Player", "MPR Plays", "Minimum Required", "Remaining", "Final Status"]);
    expect(sRows[1]).toEqual(expect.arrayContaining(["1", "Player 1", "2", "8", "6"]));

    const plays = buildPlaysCsv(data, view);
    const pRows = parseCsv(plays.content);
    expect(pRows).toHaveLength(1 + 3 * 11);
    expect(pRows[pRows.length - 1][4]).toBe("No");
    expect(pRows[pRows.length - 1][5]).toBe("Accepted penalty");
  });
});

describe("backup", () => {
  it("round-trips all domain data through export and replace import", async () => {
    const { team, game, players } = await seedActiveGame();
    await createPreset(team.id, { name: "Offense", type: "offense", playerIds: players.slice(0, 11).map((p) => p.id) });
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 3);

    const backup = await buildBackup();
    expect(backup.format).toBe("mpr-tracker-backup");
    expect(backup.version).toBe(1);
    const text = JSON.stringify(backup);

    await clearAllData();
    expect(await db.teams.count()).toBe(0);

    const preview = await previewBackup(text);
    expect(preview.counts.plays).toBe(3);
    expect(preview.conflictingIds).toBe(0);
    expect(preview.integrityIssues).toEqual([]);
    await replaceAllData(preview.backup);

    const after = await buildBackup();
    for (const key of ["teams", "players", "games", "gamePlayers", "plays", "playParticipants", "gameEvents", "lineupPresets", "lineupPresetMembers", "currentLineupMembers", "teamSettings"] as const) {
      expect(after[key]).toEqual(expect.arrayContaining(backup[key] as never[]));
      expect(after[key]).toHaveLength(backup[key].length);
    }
    expect((await db.appSettings.get("app"))?.lastActiveGameId).toBe(game.id);
  });

  it("detects conflicts when data already exists", async () => {
    await seedActiveGame();
    const preview = await previewBackup(JSON.stringify(await buildBackup()));
    expect(preview.conflictingIds).toBeGreaterThan(0);
  });

  it("rejects invalid files and unsupported versions", async () => {
    await expect(previewBackup("not json")).rejects.toSatisfy((e: unknown) => isDomainError(e, "IMPORT_INVALID"));
    await expect(previewBackup(JSON.stringify({ format: "other" }))).rejects.toSatisfy((e: unknown) =>
      isDomainError(e, "IMPORT_INVALID"),
    );
    await expect(previewBackup(JSON.stringify({ format: "mpr-tracker-backup", version: 99 }))).rejects.toSatisfy(
      (e: unknown) => isDomainError(e, "BACKUP_VERSION_UNSUPPORTED"),
    );
    const bad = { ...(await buildBackup()), plays: [{ id: 1 }] };
    await expect(previewBackup(JSON.stringify(bad))).rejects.toSatisfy((e: unknown) => isDomainError(e, "IMPORT_INVALID"));
  });

  it("reports referential integrity problems", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 1);
    const backup = await buildBackup();
    backup.players = backup.players.slice(1);
    await clearAllData();
    const preview = await previewBackup(JSON.stringify(backup));
    expect(preview.integrityIssues.length).toBeGreaterThan(0);
    await expect(replaceAllData(preview.backup)).rejects.toSatisfy((e: unknown) => isDomainError(e, "IMPORT_INVALID"));
  });

  it("team file import creates a fresh team with remapped presets", async () => {
    const { team, players } = await seedActiveGame();
    await createPreset(team.id, { name: "Defense", type: "defense", playerIds: players.slice(0, 11).map((p) => p.id) });
    const file = await buildTeamFile(team.id);
    const imported = await importTeamFile(parseTeamFile(file.content));
    expect(imported.id).not.toBe(team.id);
    expect(imported.name).toBe("Trojans (imported)");
    expect(await db.players.where("teamId").equals(imported.id).count()).toBe(18);
    const presets = await db.lineupPresets.where("teamId").equals(imported.id).toArray();
    expect(presets).toHaveLength(1);
    expect(await db.lineupPresetMembers.where("presetId").equals(presets[0].id).count()).toBe(11);
  });
});
