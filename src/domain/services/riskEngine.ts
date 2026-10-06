import type { MprRiskLevel } from "../enums";

export interface RiskInput {
  requiredPlays: number;
  completedPlays: number;
  currentQuarter: number;
  deadlineQuarter: number;
  /** Qualifying (non-voided, counting) plays recorded so far in the game. */
  totalGamePlaysSoFar: number;
  /** Qualifying plays per quarter number. */
  playsByQuarter: Record<number, number>;
  playerEligible: boolean;
}

export interface RiskResult {
  level: MprRiskLevel;
  remaining: number;
  reason: string;
  projectedOpportunitiesRemaining?: number;
}

/** Tunable thresholds — risk logic is meant to be refined from real usage. */
export interface RiskConfig {
  /** Assumed qualifying plays per quarter before any quarter has completed. */
  defaultPlaysPerQuarter: number;
  /** Share of remaining opportunities at/above which a player is critical. */
  criticalShare: number;
  /** Share of remaining opportunities at/above which a player is at risk. */
  atRiskShare: number;
  /** Pace check only applies once this fraction of the pre-deadline game has elapsed. */
  paceGraceFraction: number;
  /** A player is behind pace if completed < expected * paceTolerance. */
  paceTolerance: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  defaultPlaysPerQuarter: 12,
  criticalShare: 0.8,
  atRiskShare: 0.5,
  paceGraceFraction: 0.25,
  paceTolerance: 0.75,
};

/**
 * Estimate qualifying plays per quarter: the average of completed quarters, or
 * a conservative default while Q1 is in progress.
 */
export function estimatePlaysPerQuarter(
  currentQuarter: number,
  playsByQuarter: Record<number, number>,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): number {
  const completedQuarters = Math.max(currentQuarter - 1, 0);
  if (completedQuarters === 0) {
    // During Q1, if the current pace is already higher than the default, trust it.
    return Math.max(config.defaultPlaysPerQuarter, playsByQuarter[1] ?? 0);
  }
  let total = 0;
  for (let q = 1; q <= completedQuarters; q++) total += playsByQuarter[q] ?? 0;
  if (total === 0) return config.defaultPlaysPerQuarter;
  return total / completedQuarters;
}

/**
 * Estimated qualifying plays still to come before the end of the deadline quarter.
 */
export function estimateOpportunitiesRemaining(
  currentQuarter: number,
  deadlineQuarter: number,
  playsByQuarter: Record<number, number>,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): number {
  if (currentQuarter > deadlineQuarter) return 0;
  const perQuarter = estimatePlaysPerQuarter(currentQuarter, playsByQuarter, config);
  const playedThisQuarter = playsByQuarter[currentQuarter] ?? 0;
  const restOfCurrent = Math.max(perQuarter - playedThisQuarter, 0);
  const futureQuarters = deadlineQuarter - currentQuarter;
  return Math.round(restOfCurrent + futureQuarters * perQuarter);
}

/** Pure, deterministic MPR risk evaluation (01_DATA_MODEL.md §13). */
export function evaluatePlayerRisk(input: RiskInput, config: RiskConfig = DEFAULT_RISK_CONFIG): RiskResult {
  const remaining = Math.max(input.requiredPlays - input.completedPlays, 0);

  if (!input.playerEligible) {
    return { level: "excluded", remaining, reason: "Not currently eligible for MPR tracking" };
  }
  if (remaining === 0) {
    return { level: "met", remaining: 0, reason: "Minimum requirement satisfied" };
  }

  const deadline = Math.max(input.deadlineQuarter, 1);
  if (input.currentQuarter > deadline) {
    return {
      level: "critical",
      remaining,
      reason: "MPR deadline has passed",
      projectedOpportunitiesRemaining: 0,
    };
  }

  const opportunities = estimateOpportunitiesRemaining(input.currentQuarter, deadline, input.playsByQuarter, config);
  const inDeadlineQuarter = input.currentQuarter === deadline;

  if (opportunities <= 0 || remaining >= opportunities) {
    return {
      level: "critical",
      remaining,
      reason: `Needs ${remaining} with about ${opportunities} plays left`,
      projectedOpportunitiesRemaining: opportunities,
    };
  }

  const share = remaining / opportunities;
  if (share >= config.criticalShare) {
    return {
      level: "critical",
      remaining,
      reason: `Must play about ${Math.round(share * 100)}% of remaining plays`,
      projectedOpportunitiesRemaining: opportunities,
    };
  }

  // Pace: compare progress against elapsed share of the pre-deadline game.
  let playedBeforeDeadline = 0;
  for (let q = 1; q <= Math.min(input.currentQuarter, deadline); q++) {
    playedBeforeDeadline += input.playsByQuarter[q] ?? 0;
  }
  const projectedTotal = playedBeforeDeadline + opportunities;
  const elapsed = projectedTotal > 0 ? playedBeforeDeadline / projectedTotal : 0;
  const expectedSoFar = input.requiredPlays * elapsed;
  const behindPace =
    elapsed >= config.paceGraceFraction && input.completedPlays < expectedSoFar * config.paceTolerance;

  if (share >= config.atRiskShare || behindPace || inDeadlineQuarter) {
    return {
      level: "at_risk",
      remaining,
      reason: inDeadlineQuarter
        ? `Last quarter before the deadline and still needs ${remaining}`
        : behindPace
        ? `Behind pace: ${input.completedPlays} of ~${Math.round(expectedSoFar)} expected by now`
        : `Must play about ${Math.round(share * 100)}% of remaining plays`,
      projectedOpportunitiesRemaining: opportunities,
    };
  }

  return {
    level: "needs_plays",
    remaining,
    reason: `Needs ${remaining} more`,
    projectedOpportunitiesRemaining: opportunities,
  };
}

export const RISK_ORDER: Record<MprRiskLevel, number> = {
  critical: 0,
  at_risk: 1,
  needs_plays: 2,
  met: 3,
  excluded: 4,
};
