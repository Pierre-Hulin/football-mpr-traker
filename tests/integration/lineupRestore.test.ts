import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/db";
import {
  applyLineupPreset,
  clearCurrentLineup,
  restoreClearedLineup,
  togglePlayerInLineup,
} from "../../src/domain/commands/setCurrentLineup";
import { createPreset } from "../../src/domain/commands/presets";
import { recordPlay } from "../../src/domain/commands/recordPlay";
import { endQuarter } from "../../src/domain/commands/endQuarter";
import { abandonGame, completeGame } from "../../src/domain/commands/completeGame";
import { updateGamePlayerStatus } from "../../src/domain/commands/updateGamePlayerStatus";
import { createGame } from "../../src/domain/commands/createGame";
import { startGame } from "../../src/domain/commands/startGame";
import { isDomainError } from "../../src/domain/errors";
import { buildBackup, previewBackup } from "../../src/domain/services/backupService";
import { recordN, resetDb, seedActiveGame, seedTeam, setLineup, view } from "../helpers";

beforeEach(resetDb);

const lineupIds = async (gameId: string) =>
  (await db.currentLineupMembers.where("gameId").equals(gameId).toArray()).map((m) => m.playerId).sort();
const snapshot = async (gameId: string) => (await db.games.get(gameId))?.clearedLineup;

describe("clear / restore lineup snapshot", () => {
  it("stores the exact pre-clear lineup and restores it", async () => {
    const { game, players } = await seedActiveGame();
    const eleven = players.slice(2, 13);
    await setLineup(game.id, eleven);
    const before = await lineupIds(game.id);

    const { clearedCount } = await clearCurrentLineup(game.id);
    expect(clearedCount).toBe(11);
    expect(await lineupIds(game.id)).toEqual([]);
    const snap = await snapshot(game.id);
    expect(snap?.playerIds.slice().sort()).toEqual(before);
    expect(snap?.beforePlayNumber).toBe(1);

    const result = await restoreClearedLineup(game.id);
    expect(result).toEqual({ selectedCount: 11, skippedCount: 0 });
    expect(await lineupIds(game.id)).toEqual(before);
    expect(await snapshot(game.id)).toBeUndefined();
    expect(await db.gameEvents.where("[gameId+type]").equals([game.id, "lineup_restored"]).count()).toBe(1);
    await expect(restoreClearedLineup(game.id)).rejects.toSatisfy((e: unknown) => isDomainError(e, "NO_LINEUP_TO_RESTORE"));
  });

  it("survives a database reopen (reload)", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await clearCurrentLineup(game.id);
    db.close();
    await db.open();
    expect((await snapshot(game.id))?.playerIds).toHaveLength(11);
    await restoreClearedLineup(game.id);
    expect(await lineupIds(game.id)).toHaveLength(11);
  });

  it("clearing an empty lineup keeps the existing snapshot", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await clearCurrentLineup(game.id);
    expect((await clearCurrentLineup(game.id)).clearedCount).toBe(0);
    expect((await snapshot(game.id))?.playerIds).toHaveLength(11);
  });

  it("stays available while the lineup is rebuilt by hand, and restore replaces the partial lineup exactly", async () => {
    const { game, players } = await seedActiveGame();
    const eleven = players.slice(0, 11);
    await setLineup(game.id, eleven);
    await clearCurrentLineup(game.id);
    await togglePlayerInLineup(game.id, players[15].id, true);
    await endQuarter(game.id);
    expect(await snapshot(game.id)).toBeDefined();
    await restoreClearedLineup(game.id);
    expect(await lineupIds(game.id)).toEqual(eleven.map((p) => p.id).sort());
  });

  it("becomes stale when a play is recorded", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await clearCurrentLineup(game.id);
    await setLineup(game.id, players.slice(3, 14));
    await recordPlay({ gameId: game.id, countsForMpr: true });
    expect(await snapshot(game.id)).toBeUndefined();
  });

  it("becomes stale when a preset is applied", async () => {
    const { team, game, players } = await seedActiveGame();
    const preset = await createPreset(team.id, { name: "Defense", type: "defense", playerIds: players.slice(5, 16).map((p) => p.id) });
    await setLineup(game.id, players.slice(0, 11));
    await clearCurrentLineup(game.id);
    await applyLineupPreset(game.id, preset.id);
    expect(await snapshot(game.id)).toBeUndefined();
  });

  it("is discarded when the game is completed or abandoned", async () => {
    const a = await seedActiveGame();
    await setLineup(a.game.id, a.players.slice(0, 11));
    await clearCurrentLineup(a.game.id);
    await completeGame(a.game.id);
    expect(await snapshot(a.game.id)).toBeUndefined();

    const draft = await createGame({ teamId: a.team.id });
    const g2 = await startGame(draft.id);
    await setLineup(g2.id, a.players.slice(0, 11));
    await clearCurrentLineup(g2.id);
    await abandonGame(g2.id);
    expect(await snapshot(g2.id)).toBeUndefined();
  });

  it("skips players who became unavailable since the clear", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await clearCurrentLineup(game.id);
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[0].id, status: "injured" });
    const result = await restoreClearedLineup(game.id);
    expect(result).toEqual({ selectedCount: 10, skippedCount: 1 });
    expect(await lineupIds(game.id)).not.toContain(players[0].id);
  });

  it("round-trips through backup validation", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await clearCurrentLineup(game.id);
    const preview = await previewBackup(JSON.stringify(await buildBackup()));
    expect(preview.backup.games[0].clearedLineup?.playerIds).toHaveLength(11);
  });
});

describe("in-game roster status management", () => {
  it("marking an IN player absent removes them from the lineup and keeps their plays", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 4);
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[2].id, status: "absent", reason: "never showed" });
    const v = await view(game.id);
    const row = v.rowsById.get(players[2].id)!;
    expect(row.inLineup).toBe(false);
    expect(row.count).toBe(4);
    expect(row.risk.level).toBe("excluded");
    await expect(togglePlayerInLineup(game.id, players[2].id, true)).rejects.toSatisfy((e: unknown) =>
      isDomainError(e, "PLAYER_NOT_AVAILABLE"),
    );
    const ev = await db.gameEvents.where("[gameId+type]").equals([game.id, "player_status_changed"]).toArray();
    expect(ev.at(-1)).toMatchObject({ entityId: players[2].id, before: { status: "active" }, after: { status: "absent" }, message: "never showed" });
  });

  it("reactivating an injured player makes them selectable again with counts intact", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 3);
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[0].id, status: "injured" });
    await recordN(game.id, 2);
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[0].id, status: "active" });
    await togglePlayerInLineup(game.id, players[0].id, true);
    await recordN(game.id, 1);
    const v = await view(game.id);
    expect(v.rowsById.get(players[0].id)?.count).toBe(4);
    expect(v.rowsById.get(players[0].id)?.risk.level).not.toBe("excluded");
  });

  it("activating a late player does not alter earlier plays", async () => {
    const { team, players } = await seedTeam(14);
    const draft = await createGame({ teamId: team.id });
    await updateGamePlayerStatus({ gameId: draft.id, playerId: players[13].id, status: "late" });
    const game = await startGame(draft.id);
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 3);
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[13].id, status: "active" });
    await togglePlayerInLineup(game.id, players[0].id, false);
    await togglePlayerInLineup(game.id, players[13].id, true);
    await recordN(game.id, 1);
    const v = await view(game.id);
    expect(v.rowsById.get(players[13].id)?.count).toBe(1);
    expect(v.plays.slice(0, 3).every((p) => !p.participantIds.includes(players[13].id))).toBe(true);
  });
});
