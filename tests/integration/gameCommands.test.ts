import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db/db";
import { createGame, updateDraftGame } from "../../src/domain/commands/createGame";
import { startGame } from "../../src/domain/commands/startGame";
import { updateTeamSettings, createTeam, archiveTeam, deleteTeam } from "../../src/domain/commands/createTeam";
import { createPlayer, updatePlayer } from "../../src/domain/commands/createPlayer";
import { importRoster } from "../../src/domain/commands/importRoster";
import { recordPlay } from "../../src/domain/commands/recordPlay";
import { restorePlay, undoLastPlay, voidPlay } from "../../src/domain/commands/undoLastPlay";
import { correctPlay } from "../../src/domain/commands/correctPlay";
import { endQuarter } from "../../src/domain/commands/endQuarter";
import { abandonGame, completeGame } from "../../src/domain/commands/completeGame";
import { updateGamePlayerStatus } from "../../src/domain/commands/updateGamePlayerStatus";
import {
  applyLineupPreset,
  clearCurrentLineup,
  setLineupMembership,
  togglePlayerInLineup,
} from "../../src/domain/commands/setCurrentLineup";
import { createPreset } from "../../src/domain/commands/presets";
import { isDomainError } from "../../src/domain/errors";
import { getActiveGame } from "../../src/domain/selectors/queries";
import { getGameSummary } from "../../src/domain/selectors/getGameSummary";
import { recordN, resetDb, seedActiveGame, seedTeam, setLineup, view } from "../helpers";

beforeEach(resetDb);

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => isDomainError(e) && e.code === code);
}

describe("teams and roster", () => {
  it("creates a team with default settings and a roster", async () => {
    const { team, players } = await seedTeam(18);
    expect(players).toHaveLength(18);
    const settings = await db.teamSettings.get(team.id);
    expect(settings?.defaultRequiredPlays).toBe(8);
    expect(settings?.defaultExpectedPlayersOnField).toBe(11);
  });

  it("rejects an empty team name", async () => {
    await expectCode(createTeam({ name: "   " }), "VALIDATION_FAILED");
  });

  it("detects duplicate jerseys and allows explicit override", async () => {
    const { team } = await seedTeam(3);
    await expectCode(createPlayer(team.id, { jerseyNumber: "2", displayName: "Dup" }), "DUPLICATE_JERSEY");
    const p = await createPlayer(team.id, { jerseyNumber: "2", displayName: "Dup", allowDuplicateJersey: true });
    expect(p.jerseyNumber).toBe("2");
    await expectCode(updatePlayer(p.id, { jerseyNumber: "3", displayName: "Dup" }), "DUPLICATE_JERSEY");
  });

  it("rolls back a roster import if any write fails", async () => {
    const { team } = await seedTeam(2);
    const spy = vi.spyOn(db.importRecords, "add").mockRejectedValueOnce(new Error("disk full"));
    await expectCode(
      importRoster({ teamId: team.id, kind: "roster_text", rows: [{ jerseyNumber: "50", displayName: "New Kid" }] }),
      "DB_WRITE_FAILED",
    );
    spy.mockRestore();
    expect(await db.players.where("teamId").equals(team.id).count()).toBe(2);
  });

  it("blocks deleting a team with games but allows archive", async () => {
    const { team } = await seedActiveGame();
    await expectCode(deleteTeam(team.id), "TEAM_HAS_GAMES");
    await archiveTeam(team.id);
    expect((await db.teams.get(team.id))?.archivedAt).toBeTruthy();
  });
});

describe("game setup", () => {
  it("creates GamePlayer snapshots and is unaffected by later team default changes", async () => {
    const { team, players } = await seedTeam(12);
    const draft = await createGame({ teamId: team.id, opponent: "Wildcats" });
    await updateTeamSettings(team.id, {
      defaultRequiredPlays: 12,
      defaultExpectedPlayersOnField: 8,
      defaultMprDeadlineQuarter: 4,
      defaultCountsSpecialTeams: true,
      defaultCountsPat: true,
      defaultCountsAcceptedPenaltyPlays: false,
    });
    const game = await db.games.get(draft.id);
    expect(game?.requiredPlaysDefault).toBe(8);
    expect(game?.expectedPlayersOnField).toBe(11);
    const gps = await db.gamePlayers.where("gameId").equals(draft.id).toArray();
    expect(gps).toHaveLength(players.length);
    expect(gps.every((gp) => gp.minimumRequiredPlays === 8 && gp.status === "active")).toBe(true);
  });

  it("validates rules", async () => {
    const { team } = await seedTeam(3);
    const draft = await createGame({ teamId: team.id });
    await expectCode(
      updateDraftGame(draft.id, {
        requiredPlays: -1,
        expectedPlayersOnField: 11,
        countsPat: true,
        countsSpecialTeams: true,
        countsAcceptedPenaltyPlays: false,
      }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      updateDraftGame(draft.id, {
        requiredPlays: 8,
        expectedPlayersOnField: 0,
        countsPat: true,
        countsSpecialTeams: true,
        countsAcceptedPenaltyPlays: false,
      }),
      "VALIDATION_FAILED",
    );
  });

  it("prevents starting with zero eligible players", async () => {
    const { team, players } = await seedTeam(2);
    const draft = await createGame({ teamId: team.id });
    for (const p of players) await updateGamePlayerStatus({ gameId: draft.id, playerId: p.id, status: "absent" });
    await expectCode(startGame(draft.id), "NO_ELIGIBLE_PLAYERS");
  });

  it("starts the game, logs an event and records the active pointer", async () => {
    const { game } = await seedActiveGame();
    expect(game.status).toBe("active");
    const settings = await db.appSettings.get("app");
    expect(settings?.lastActiveGameId).toBe(game.id);
    expect(await db.gameEvents.where("[gameId+type]").equals([game.id, "game_started"]).count()).toBe(1);
  });

  it("does not allow two active games", async () => {
    const { team } = await seedActiveGame();
    const other = await createGame({ teamId: team.id });
    await expectCode(startGame(other.id), "GAME_ALREADY_ACTIVE");
  });

  it("active game resumes after database re-open", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 2);
    db.close();
    await db.open();
    const active = await getActiveGame();
    expect(active?.id).toBe(game.id);
    const v = await view(game.id);
    expect(v.game.nextPlayNumber).toBe(3);
    expect(v.selectedCount).toBe(11);
    expect(v.rowsById.get(players[0].id)?.count).toBe(2);
  });
});

describe("lineup", () => {
  it("toggles, persists after record, and clears", async () => {
    const { game, players } = await seedActiveGame();
    for (const p of players.slice(0, 11)) await togglePlayerInLineup(game.id, p.id);
    expect((await view(game.id)).selectedCount).toBe(11);
    await recordPlay({ gameId: game.id, countsForMpr: true });
    expect((await view(game.id)).selectedCount).toBe(11);
    // One substitution.
    await togglePlayerInLineup(game.id, players[0].id);
    await togglePlayerInLineup(game.id, players[11].id);
    expect((await view(game.id)).selectedCount).toBe(11);
    await clearCurrentLineup(game.id);
    expect((await view(game.id)).selectedCount).toBe(0);
    expect(await db.gameEvents.where("[gameId+type]").equals([game.id, "lineup_cleared"]).count()).toBe(1);
  });

  it("applies a batch of IN/OUT choices in one go; the last choice per player wins", async () => {
    const { game, players } = await seedActiveGame();
    const ids = players.map((p) => p.id);
    const r = await setLineupMembership(game.id, [
      ...ids.slice(0, 11).map((id) => [id, true] as const),
      [ids[0], false],
      [ids[11], true],
      [ids[11], false],
      [ids[12], true],
    ]);
    expect(r.rejected).toEqual([]);
    const v = await view(game.id);
    expect(v.selectedCount).toBe(11);
    expect(v.rowsById.get(ids[0])?.inLineup).toBe(false);
    expect(v.rowsById.get(ids[11])?.inLineup).toBe(false);
    expect(v.rowsById.get(ids[12])?.inLineup).toBe(true);
  });

  it("skips unavailable players in a batch but still commits the rest", async () => {
    const { game, players } = await seedActiveGame();
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[0].id, status: "absent" });
    const r = await setLineupMembership(game.id, [
      [players[0].id, true],
      [players[1].id, true],
    ]);
    expect(r.rejected).toEqual([players[0].id]);
    const v = await view(game.id);
    expect(v.rowsById.get(players[0].id)?.inLineup).toBe(false);
    expect(v.rowsById.get(players[1].id)?.inLineup).toBe(true);
  });

  it("refuses to put an unavailable player IN", async () => {
    const { game, players } = await seedActiveGame();
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[0].id, status: "absent" });
    await expectCode(togglePlayerInLineup(game.id, players[0].id), "PLAYER_NOT_AVAILABLE");
  });

  it("applies a preset, filtering absent and injured players", async () => {
    const { team, game, players } = await seedActiveGame();
    const preset = await createPreset(team.id, {
      name: "Offense",
      type: "offense",
      playerIds: players.slice(0, 11).map((p) => p.id),
    });
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[0].id, status: "absent" });
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[1].id, status: "injured" });
    const result = await applyLineupPreset(game.id, preset.id);
    expect(result.selectedCount).toBe(9);
    expect(result.skippedCount).toBe(2);
    const v = await view(game.id);
    expect(v.selectedCount).toBe(9);
    expect(v.rowsById.get(players[0].id)?.inLineup).toBe(false);
  });

  it("preset with more players than expected loads all of them", async () => {
    const { team, game, players } = await seedActiveGame();
    const preset = await createPreset(team.id, { name: "Big", type: "custom", playerIds: players.slice(0, 13).map((p) => p.id) });
    expect((await applyLineupPreset(game.id, preset.id)).selectedCount).toBe(13);
  });
});

describe("record play", () => {
  it("records a play with 11 participants and advances", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    const { play, participantIds } = await recordPlay({ gameId: game.id, countsForMpr: true });
    expect(play.playNumber).toBe(1);
    expect(play.quarter).toBe(1);
    expect(play.playerCountOverrideConfirmed).toBe(false);
    expect(participantIds).toHaveLength(11);
    const v = await view(game.id);
    expect(v.game.nextPlayNumber).toBe(2);
    expect(v.rowsById.get(players[0].id)?.count).toBe(1);
    expect(v.rowsById.get(players[12].id)?.count).toBe(0);
    expect(await db.gameEvents.where("[gameId+type]").equals([game.id, "play_recorded"]).count()).toBe(1);
  });

  it("requires confirmation for a wrong count and writes nothing without it", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 10));
    await expectCode(recordPlay({ gameId: game.id, countsForMpr: true }), "PLAYER_COUNT_CONFIRMATION_REQUIRED");
    expect(await db.plays.count()).toBe(0);
    expect((await db.games.get(game.id))?.nextPlayNumber).toBe(1);
    const { play } = await recordPlay({ gameId: game.id, countsForMpr: true, confirmWrongPlayerCount: true });
    expect(play.recordedPlayerCount).toBe(10);
    expect(play.playerCountOverrideConfirmed).toBe(true);
    expect((await view(game.id)).rowsById.get(players[0].id)?.count).toBe(1);
  });

  it("non-counting plays advance the play number but not MPR totals", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await recordPlay({ gameId: game.id, countsForMpr: false, nonCountingReason: "Accepted penalty" });
    const v = await view(game.id);
    expect(v.game.nextPlayNumber).toBe(2);
    expect(v.rowsById.get(players[0].id)?.count).toBe(0);
    expect(v.plays[0].play.nonCountingReason).toBe("Accepted penalty");
    expect(v.plays[0].participantCount).toBe(11);
  });

  it("leaves no partial play if participant write fails", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    const spy = vi.spyOn(db.playParticipants, "bulkAdd").mockRejectedValueOnce(new Error("boom"));
    await expectCode(recordPlay({ gameId: game.id, countsForMpr: true }), "DB_WRITE_FAILED");
    spy.mockRestore();
    expect(await db.plays.count()).toBe(0);
    expect(await db.playParticipants.count()).toBe(0);
    expect((await db.games.get(game.id))?.nextPlayNumber).toBe(1);
    expect(await db.gameEvents.where("[gameId+type]").equals([game.id, "play_recorded"]).count()).toBe(0);
  });

  it("cannot record on a non-active game", async () => {
    const { team } = await seedTeam(11);
    const draft = await createGame({ teamId: team.id });
    await expectCode(recordPlay({ gameId: draft.id, countsForMpr: true }), "GAME_NOT_ACTIVE");
  });
});

describe("undo and corrections", () => {
  it("undo voids the latest play, restores next play and reverts counts", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 3);
    const undone = await undoLastPlay(game.id);
    expect(undone.playNumber).toBe(3);
    expect(undone.voided).toBe(true);
    const v = await view(game.id);
    expect(v.game.nextPlayNumber).toBe(3);
    expect(v.rowsById.get(players[0].id)?.count).toBe(2);
    expect(await db.plays.count()).toBe(3); // history preserved
  });

  it("undo with nothing to undo errors", async () => {
    const { game } = await seedActiveGame();
    await expectCode(undoLastPlay(game.id), "NO_PLAY_TO_UNDO");
  });

  it("restore re-enables a voided play unless its number was reused", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 2);
    const undone = await undoLastPlay(game.id);
    await restorePlay(undone.id);
    let v = await view(game.id);
    expect(v.game.nextPlayNumber).toBe(3);
    expect(v.rowsById.get(players[0].id)?.count).toBe(2);

    const again = await undoLastPlay(game.id);
    await recordN(game.id, 1); // reuses play number 2
    await expectCode(restorePlay(again.id), "PLAY_NUMBER_CONFLICT");
    v = await view(game.id);
    expect(v.game.nextPlayNumber).toBe(3);
  });

  it("voiding a historical play does not renumber", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 3);
    const v0 = await view(game.id);
    await voidPlay(v0.plays[0].play.id);
    const v = await view(game.id);
    expect(v.game.nextPlayNumber).toBe(4);
    expect(v.plays.map((p) => p.play.playNumber)).toEqual([1, 2, 3]);
    expect(v.rowsById.get(players[0].id)?.count).toBe(2);
  });

  it("correction adds and removes participants with an audit trail", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    const { play } = await recordPlay({ gameId: game.id, countsForMpr: true });
    const newIds = [...players.slice(1, 11), players[12]].map((p) => p.id);
    const corrected = await correctPlay(play.id, { participantIds: newIds });
    expect(corrected.revision).toBe(2);
    expect(corrected.createdAt).toBe(play.createdAt);
    const v = await view(game.id);
    expect(v.rowsById.get(players[0].id)?.count).toBe(0);
    expect(v.rowsById.get(players[12].id)?.count).toBe(1);
    expect(v.rowsById.get(players[12].id)?.quarterCounts[1]).toBe(1);
    const events = await db.gameEvents.where("[gameId+type]").equals([game.id, "play_corrected"]).toArray();
    expect(events).toHaveLength(1);
    expect((events[0].before as { participantIds: string[] }).participantIds).toContain(players[0].id);
    expect((events[0].after as { participantIds: string[] }).participantIds).toContain(players[12].id);
  });

  it("correction can flip counting status", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    const { play } = await recordPlay({ gameId: game.id, countsForMpr: true });
    await correctPlay(play.id, { countsForMpr: false, nonCountingReason: "Kneel / spike" });
    expect((await view(game.id)).rowsById.get(players[0].id)?.count).toBe(0);
    await correctPlay(play.id, { countsForMpr: true });
    const p = await db.plays.get(play.id);
    expect(p?.countsForMpr).toBe(true);
    expect(p?.nonCountingReason).toBeUndefined();
  });
});

describe("player status", () => {
  it("injury preserves counts and removes from lineup and warnings", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 3);
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[0].id, status: "injured" });
    const v = await view(game.id);
    const row = v.rowsById.get(players[0].id)!;
    expect(row.count).toBe(3);
    expect(row.inLineup).toBe(false);
    expect(row.risk.level).toBe("excluded");
    expect(v.selectedCount).toBe(10);
    const gp = await db.gamePlayers.get(`${game.id}:${players[0].id}`);
    expect(gp?.deactivatedAtPlayNumber).toBe(4);
  });

  it("late activation works and records the activation play", async () => {
    const { team, players } = await seedTeam(14);
    const draft = await createGame({ teamId: team.id });
    await updateGamePlayerStatus({ gameId: draft.id, playerId: players[13].id, status: "late" });
    const game = await startGame(draft.id);
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 5);
    let v = await view(game.id);
    expect(v.rowsById.get(players[13].id)?.risk.level).toBe("excluded");
    await expectCode(togglePlayerInLineup(game.id, players[13].id), "PLAYER_NOT_AVAILABLE");
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[13].id, status: "active" });
    await togglePlayerInLineup(game.id, players[13].id);
    v = await view(game.id);
    expect(v.rowsById.get(players[13].id)?.inLineup).toBe(true);
    expect(v.rowsById.get(players[13].id)?.risk.level).not.toBe("excluded");
    const gp = await db.gamePlayers.get(`${game.id}:${players[13].id}`);
    expect(gp?.activatedAtPlayNumber).toBe(6);
    expect(await db.gameEvents.where("[gameId+type]").equals([game.id, "player_activated"]).count()).toBe(1);
  });

  it("exempt players are excluded from risk", async () => {
    const { game, players } = await seedActiveGame({ game: { requiredPlays: 8 } });
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[5].id, status: "exempt" });
    await endQuarter(game.id);
    await endQuarter(game.id);
    await endQuarter(game.id);
    const v = await view(game.id);
    expect(v.rowsById.get(players[5].id)?.risk.level).toBe("excluded");
    expect(v.atRisk.some((r) => r.player.id === players[5].id)).toBe(false);
    expect(v.atRisk.length).toBeGreaterThan(0);
  });

  it("rejects moving a player back to late mid-game", async () => {
    const { game, players } = await seedActiveGame();
    await expectCode(
      updateGamePlayerStatus({ gameId: game.id, playerId: players[0].id, status: "late" }),
      "INVALID_PLAYER_STATUS_TRANSITION",
    );
  });
});

describe("quarters and completion", () => {
  it("end quarter stores a snapshot, advances and preserves lineup", async () => {
    const { game, players } = await seedActiveGame();
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 4);
    const { game: g2, snapshot } = await endQuarter(game.id);
    expect(g2.currentQuarter).toBe(2);
    expect(snapshot.endedQuarter).toBe(1);
    expect(snapshot.lastPlayNumber).toBe(4);
    expect(snapshot.playerCounts[players[0].id]).toBe(4);
    await recordN(game.id, 2);
    const v = await view(game.id);
    expect(v.selectedCount).toBe(11);
    expect(v.playsByQuarter).toEqual({ 1: 4, 2: 2 });
    expect(v.rowsById.get(players[0].id)?.quarterCounts).toEqual({ 1: 4, 2: 2 });
    expect(v.quarterSnapshots).toHaveLength(1);
  });

  it("complete game summarizes unmet players and clears active pointer", async () => {
    const { game, players } = await seedActiveGame({ game: { requiredPlays: 3 } });
    await setLineup(game.id, players.slice(0, 11));
    await recordN(game.id, 3);
    await updateGamePlayerStatus({ gameId: game.id, playerId: players[17].id, status: "injured" });
    const { unmet } = await completeGame(game.id);
    // Players 12..17 (6 active minus 1 injured = 5) never played.
    expect(unmet).toHaveLength(6);
    const settings = await db.appSettings.get("app");
    expect(settings?.lastActiveGameId).toBeUndefined();
    const v = await view(game.id);
    const summary = getGameSummary(v);
    expect(summary.metCount).toBe(11);
    expect(summary.shortCount).toBe(6);
    expect(summary.rows.find((r) => r.view.player.id === players[17].id)?.finalStatus).toBe("injured");
    await expectCode(recordPlay({ gameId: game.id, countsForMpr: true }), "GAME_NOT_ACTIVE");
  });

  it("abandon game clears the active pointer", async () => {
    const { game } = await seedActiveGame();
    await abandonGame(game.id);
    expect((await db.games.get(game.id))?.status).toBe("abandoned");
    expect(await getActiveGame()).toBeUndefined();
  });
});
