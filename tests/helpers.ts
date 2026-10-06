import { db } from "../src/db/db";
import { initializeDatabase } from "../src/db/migrations";
import { createTeam } from "../src/domain/commands/createTeam";
import { importRoster } from "../src/domain/commands/importRoster";
import { createGame, type CreateGameInput } from "../src/domain/commands/createGame";
import { startGame } from "../src/domain/commands/startGame";
import { replaceCurrentLineup } from "../src/domain/commands/setCurrentLineup";
import { recordPlay } from "../src/domain/commands/recordPlay";
import { loadGameData } from "../src/domain/selectors/queries";
import { buildGameView } from "../src/domain/selectors/getGameState";
import type { Player } from "../src/domain/models";
import { sortPlayers } from "../src/utils/sort";

export async function resetDb() {
  db.close();
  await db.delete();
  await db.open();
  await initializeDatabase();
}

export async function seedTeam(size = 18, name = "Trojans") {
  const team = await createTeam({ name, seasonLabel: "Fall 2026" });
  const players = await importRoster({
    teamId: team.id,
    kind: "roster_text",
    rows: Array.from({ length: size }, (_, i) => ({ jerseyNumber: String(i + 1), displayName: `Player ${i + 1}` })),
  });
  return { team, players: sortPlayers(players) };
}

export async function seedActiveGame(opts: { size?: number; game?: Partial<CreateGameInput> } = {}) {
  const { team, players } = await seedTeam(opts.size ?? 18);
  const draft = await createGame({ teamId: team.id, opponent: "Wildcats", requiredPlays: 8, ...opts.game });
  const game = await startGame(draft.id);
  return { team, players, game };
}

export async function setLineup(gameId: string, players: Player[]) {
  await replaceCurrentLineup(gameId, players.map((p) => p.id));
}

export async function recordN(gameId: string, n: number, countsForMpr = true) {
  for (let i = 0; i < n; i++) await recordPlay({ gameId, countsForMpr, confirmWrongPlayerCount: true });
}

export async function view(gameId: string) {
  const data = await loadGameData(gameId);
  if (!data) throw new Error("game missing");
  return buildGameView(data);
}
