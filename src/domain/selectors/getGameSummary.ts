import { GAME_PLAYER_STATUS_LABELS } from "../enums";
import type { GameView, PlayerView } from "./getGameState";

export type FinalStatus = "met" | "short" | "injured" | "absent" | "late" | "exempt" | "ineligible";

export interface SummaryRow {
  view: PlayerView;
  finalStatus: FinalStatus;
  label: string;
  short: number;
}

export interface GameSummary {
  rows: SummaryRow[];
  activeCount: number;
  metCount: number;
  shortCount: number;
  excludedCount: number;
  totalPlays: number;
  qualifyingPlays: number;
  nonCountingPlays: number;
  voidedPlays: number;
  quarters: number[];
  shortRows: SummaryRow[];
}

export function finalStatusFor(view: PlayerView): FinalStatus {
  const status = view.gamePlayer.status;
  if (status === "active") return view.count >= view.required ? "met" : "short";
  return status;
}

export function finalStatusLabel(row: { finalStatus: FinalStatus; short: number }): string {
  switch (row.finalStatus) {
    case "met":
      return "✓ Met";
    case "short":
      return `⚠ Short ${row.short}`;
    default:
      return GAME_PLAYER_STATUS_LABELS[row.finalStatus];
  }
}

export function getGameSummary(view: GameView): GameSummary {
  const rows: SummaryRow[] = view.rows.map((v) => {
    const finalStatus = finalStatusFor(v);
    const short = Math.max(v.required - v.count, 0);
    return { view: v, finalStatus, short, label: finalStatusLabel({ finalStatus, short }) };
  });
  const live = view.plays.filter((p) => !p.play.voided);
  const quarterSet = new Set<number>([1]);
  for (const p of live) quarterSet.add(p.play.quarter);
  for (let q = 1; q <= Math.min(view.game.currentQuarter, 4); q++) quarterSet.add(q);
  return {
    rows,
    activeCount: rows.filter((r) => r.finalStatus === "met" || r.finalStatus === "short").length,
    metCount: rows.filter((r) => r.finalStatus === "met").length,
    shortCount: rows.filter((r) => r.finalStatus === "short").length,
    excludedCount: rows.filter((r) => r.finalStatus !== "met" && r.finalStatus !== "short").length,
    totalPlays: live.length,
    qualifyingPlays: live.filter((p) => p.play.countsForMpr).length,
    nonCountingPlays: live.filter((p) => !p.play.countsForMpr).length,
    voidedPlays: view.plays.length - live.length,
    quarters: [...quarterSet].sort((a, b) => a - b),
    shortRows: rows.filter((r) => r.finalStatus === "short"),
  };
}
