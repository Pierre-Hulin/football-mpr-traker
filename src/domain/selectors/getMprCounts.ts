import type { Play, PlayParticipant } from "../models";

/** Plays that count toward MPR: not voided and flagged as counting. */
export function isQualifying(play: Play): boolean {
  return !play.voided && play.countsForMpr;
}

export function groupParticipantsByPlay(participants: PlayParticipant[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const p of participants) {
    const list = map.get(p.playId);
    if (list) list.push(p.playerId);
    else map.set(p.playId, [p.playerId]);
  }
  return map;
}

/** MPR count per player (01_DATA_MODEL.md §10). */
export function computeMprCounts(plays: Play[], participants: PlayParticipant[]): Map<string, number> {
  const qualifying = new Set(plays.filter(isQualifying).map((p) => p.id));
  const counts = new Map<string, number>();
  for (const part of participants) {
    if (!qualifying.has(part.playId)) continue;
    counts.set(part.playerId, (counts.get(part.playerId) ?? 0) + 1);
  }
  return counts;
}

/** Qualifying participation per player per quarter. */
export function computeQuarterCounts(
  plays: Play[],
  participants: PlayParticipant[],
): Map<string, Record<number, number>> {
  const quarterByPlay = new Map(plays.filter(isQualifying).map((p) => [p.id, p.quarter]));
  const result = new Map<string, Record<number, number>>();
  for (const part of participants) {
    const quarter = quarterByPlay.get(part.playId);
    if (quarter === undefined) continue;
    const row = result.get(part.playerId) ?? {};
    row[quarter] = (row[quarter] ?? 0) + 1;
    result.set(part.playerId, row);
  }
  return result;
}

/** Number of qualifying plays in each quarter. */
export function countQualifyingPlaysByQuarter(plays: Play[]): Record<number, number> {
  const result: Record<number, number> = {};
  for (const play of plays) {
    if (!isQualifying(play)) continue;
    result[play.quarter] = (result[play.quarter] ?? 0) + 1;
  }
  return result;
}

export function remainingPlays(required: number, completed: number): number {
  return Math.max(required - completed, 0);
}

/** Highest non-voided play number + 1 (01_DATA_MODEL.md §8.2). */
export function computeNextPlayNumber(plays: Play[]): number {
  let max = 0;
  for (const p of plays) if (!p.voided && p.playNumber > max) max = p.playNumber;
  return max + 1;
}
