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
import { evaluatePlayerRisk, isActionable, RISK_ORDER, riskPhase, type RiskResult } from "../services/riskEngine";
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
  /** Actionable players (missed, critical, at risk), most urgent first, jersey order within each level. */
  atRisk: PlayerView[];
  /** Proportionate live warning banner, or null when no intervention is needed. */
  banner: RiskBanner | null;
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
    .filter((r) => isActionable(r.risk.level))
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
    banner: getRiskBanner(atRisk, game.currentQuarter, deadlineQuarter),
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

// ---------- Live roster filtering & summary ----------

export type RosterFilter = "all" | "focus";

/**
 * Focus mode: players on the field for the next play, plus available,
 * MPR-eligible players who are still short of their minimum. Built only on
 * the existing eligibility (`fieldEligible`) and risk (`risk.level`) values.
 */
export function isFocusRelevant(row: PlayerView, inLineup: boolean): boolean {
  if (inLineup) return true;
  return row.fieldEligible && row.risk.level !== "met" && row.risk.level !== "excluded";
}

/**
 * Live status line. `onField` is the next-play lineup. `needPlays`, `met` and
 * `unavailable` partition the roster (they always sum to `total`) and overlap
 * with `onField`.
 */
export interface RosterSummary {
  onField: number;
  needPlays: number;
  met: number;
  unavailable: number;
  total: number;
}

export function summarizeRoster(rows: PlayerView[], isIn: (playerId: string) => boolean): RosterSummary {
  let onField = 0;
  let needPlays = 0;
  let met = 0;
  let unavailable = 0;
  for (const r of rows) {
    if (r.fieldEligible && isIn(r.player.id)) onField++;
    if (!r.fieldEligible) unavailable++;
    else if (r.risk.level === "met") met++;
    else needPlays++;
  }
  return { onField, needPlays, met, unavailable, total: rows.length };
}

// ---------- Live warning banner ----------

export interface RiskBanner {
  tone: "critical" | "at_risk";
  /** Urgent players first (missed, critical), then at risk. */
  rows: PlayerView[];
}

/**
 * The banner appears only when intervention is justified: always for missed or
 * critical players, and for at-risk players only from the second-to-last
 * quarter before the deadline onward. "Behind" never triggers it; that stays an
 * inline cue.
 */
export function getRiskBanner(atRisk: PlayerView[], currentQuarter: number, deadlineQuarter: number): RiskBanner | null {
  const urgent = atRisk.filter((r) => r.risk.level === "critical" || r.risk.level === "missed");
  const phase = riskPhase(currentQuarter, deadlineQuarter);
  const lateGame = phase === "late" || phase === "deadline" || phase === "past";
  const amber = lateGame ? atRisk.filter((r) => r.risk.level === "at_risk") : [];
  if (urgent.length) return { tone: "critical", rows: [...urgent, ...amber] };
  if (amber.length) return { tone: "at_risk", rows: amber };
  return null;
}
