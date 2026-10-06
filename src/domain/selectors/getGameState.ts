import { isFieldEligible, type PlayerSort } from "../enums";
import type {
  CurrentLineupMember,
  Game,
  GameEvent,
  GamePlayer,
  LineupPreset,
  LineupPresetMember,
  Play,
  PlayParticipant,
  Player,
  QuarterSnapshot,
  Team,
} from "../models";
import { evaluatePlayerRisk, RISK_ORDER, type RiskResult } from "../services/riskEngine";
import {
  computeMprCounts,
  computeQuarterCounts,
  countQualifyingPlaysByQuarter,
  groupParticipantsByPlay,
  isQualifying,
} from "./getMprCounts";
import { comparePlayers } from "../../utils/sort";

/** Everything persisted for one game, as loaded from IndexedDB. */
export interface GameData {
  game: Game;
  team?: Team;
  players: Player[];
  gamePlayers: GamePlayer[];
  lineup: CurrentLineupMember[];
  plays: Play[];
  participants: PlayParticipant[];
  events: GameEvent[];
  presets: LineupPreset[];
  presetMembers: LineupPresetMember[];
}

export interface PlayerView {
  player: Player;
  gamePlayer: GamePlayer;
  count: number;
  required: number;
  remaining: number;
  risk: RiskResult;
  inLineup: boolean;
  fieldEligible: boolean;
  quarterCounts: Record<number, number>;
}

export interface PlayView {
  play: Play;
  participantIds: string[];
  participantCount: number;
  countMismatch: boolean;
}

export interface GameView {
  game: Game;
  rows: PlayerView[];
  rowsById: Map<string, PlayerView>;
  selectedCount: number;
  expected: number;
  /** Critical first, then at risk; stable jersey order within each level. */
  atRisk: PlayerView[];
  playsByQuarter: Record<number, number>;
  qualifyingTotal: number;
  plays: PlayView[];
  lastPlay?: PlayView;
  quarterSnapshots: QuarterSnapshot[];
}

/** MPR-eligible players: active, or late players once activated. */
export function isMprEligible(gp: GamePlayer): boolean {
  return gp.status === "active";
}

export function getQuarterSnapshots(events: GameEvent[]): QuarterSnapshot[] {
  return events
    .filter((e) => e.type === "quarter_ended" && e.metadata)
    .map((e) => e.metadata as unknown as QuarterSnapshot)
    .sort((a, b) => a.endedQuarter - b.endedQuarter);
}

export function buildPlayViews(plays: Play[], participants: PlayParticipant[]): PlayView[] {
  const byPlay = groupParticipantsByPlay(participants);
  return [...plays]
    .sort((a, b) => a.playNumber - b.playNumber || a.createdAt.localeCompare(b.createdAt))
    .map((play) => {
      const ids = byPlay.get(play.id) ?? [];
      return {
        play,
        participantIds: ids,
        participantCount: ids.length,
        countMismatch: ids.length !== play.expectedPlayerCount,
      };
    });
}

export function buildGameView(data: GameData, sort: PlayerSort = "jersey"): GameView {
  const { game } = data;
  const counts = computeMprCounts(data.plays, data.participants);
  const quarterCounts = computeQuarterCounts(data.plays, data.participants);
  const playsByQuarter = countQualifyingPlaysByQuarter(data.plays);
  const qualifyingTotal = data.plays.filter(isQualifying).length;
  const lineupIds = new Set(data.lineup.map((m) => m.playerId));
  const playersById = new Map(data.players.map((p) => [p.id, p]));
  const deadlineQuarter = game.mprDeadlineQuarter ?? 4;

  const rows: PlayerView[] = [];
  for (const gp of data.gamePlayers) {
    const player = playersById.get(gp.playerId);
    if (!player) continue;
    const count = counts.get(gp.playerId) ?? 0;
    const risk = evaluatePlayerRisk({
      requiredPlays: gp.minimumRequiredPlays,
      completedPlays: count,
      currentQuarter: game.currentQuarter,
      deadlineQuarter,
      totalGamePlaysSoFar: qualifyingTotal,
      playsByQuarter,
      playerEligible: isMprEligible(gp),
    });
    const fieldEligible = isFieldEligible(gp.status);
    rows.push({
      player,
      gamePlayer: gp,
      count,
      required: gp.minimumRequiredPlays,
      remaining: risk.remaining,
      risk,
      inLineup: fieldEligible && lineupIds.has(gp.playerId),
      fieldEligible,
      quarterCounts: quarterCounts.get(gp.playerId) ?? {},
    });
  }

  rows.sort((a, b) => {
    if (sort === "name") return a.player.displayName.localeCompare(b.player.displayName);
    if (sort === "risk") {
      const diff = RISK_ORDER[a.risk.level] - RISK_ORDER[b.risk.level];
      if (diff !== 0) return diff;
    }
    return comparePlayers(a.player, b.player);
  });

  const atRisk = rows
    .filter((r) => r.risk.level === "critical" || r.risk.level === "at_risk")
    .sort((a, b) => RISK_ORDER[a.risk.level] - RISK_ORDER[b.risk.level] || comparePlayers(a.player, b.player));

  const plays = buildPlayViews(data.plays, data.participants);
  const livePlays = plays.filter((p) => !p.play.voided);

  return {
    game,
    rows,
    rowsById: new Map(rows.map((r) => [r.player.id, r])),
    selectedCount: rows.filter((r) => r.inLineup).length,
    expected: game.expectedPlayersOnField,
    atRisk,
    playsByQuarter,
    qualifyingTotal,
    plays,
    lastPlay: livePlays[livePlays.length - 1],
    quarterSnapshots: getQuarterSnapshots(data.events),
  };
}

export type CountState = "exact" | "under" | "over";

export function countState(selected: number, expected: number): CountState {
  if (selected === expected) return "exact";
  return selected < expected ? "under" : "over";
}
