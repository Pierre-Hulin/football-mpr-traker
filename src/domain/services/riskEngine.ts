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

/**
 * Game phase relative to the MPR deadline (for the usual end-of-game deadline:
 * Q1 = early, Q2 = building, Q3 = late, Q4 = deadline, OT = past).
 */
export type RiskPhase = "early" | "building" | "late" | "deadline" | "past";

export interface OpportunityEstimate {
  /** Conservative estimate of qualifying plays left before the deadline. */
  low: number;
  expected: number;
  high: number;
}

export interface RiskResult {
  level: MprRiskLevel;
  remaining: number;
  reason: string;
  phase?: RiskPhase;
  opportunities?: OpportunityEstimate;
  /** Expected qualifying plays left before the deadline. */
  projectedOpportunitiesRemaining?: number;
}

interface PhaseThresholds {
  /**
   * Which end of the opportunity estimate to judge against: optimistic early
   * (don't cry wolf while little is known), conservative late (warn in time).
   */
  basis: keyof OpportunityEstimate;
  /** "need" = remaining / opportunities left (per `basis`). */
  behindNeed: number;
  atRiskNeed: number;
  criticalNeed: number;
  /** Behind pace when completed < expected-so-far × this (0 disables the pace check). */
  paceTolerance: number;
}

/** Tunable thresholds; risk logic is meant to be refined from real usage. */
export interface RiskConfig {
  /** Assumed qualifying plays per quarter before any quarter has completed. */
  defaultPlaysPerQuarter: number;
  /** ± uncertainty on the play-count estimate, by number of completed quarters (last value repeats). */
  uncertaintyByCompletedQuarters: number[];
  phases: Record<Exclude<RiskPhase, "past">, PhaseThresholds>;
}

const NEVER = Number.POSITIVE_INFINITY;

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  defaultPlaysPerQuarter: 12,
  uncertaintyByCompletedQuarters: [0.4, 0.3, 0.2, 0.15],
  phases: {
    // Q1: stay quiet unless the player would need every conservatively-expected play.
    early: { basis: "high", behindNeed: NEVER, atRiskNeed: NEVER, criticalNeed: 1, paceTolerance: 0 },
    // Q2: subtle "behind" for players falling off pace; zero plays alone is never critical.
    building: { basis: "expected", behindNeed: 0.45, atRiskNeed: 0.75, criticalNeed: 1, paceTolerance: 0.5 },
    // Q3: prominent warnings once a player is genuinely at risk.
    late: { basis: "low", behindNeed: 0.35, atRiskNeed: 0.6, criticalNeed: 0.9, paceTolerance: 0.6 },
    // Q4: every short player is flagged, escalating as opportunities run out.
    deadline: { basis: "low", behindNeed: 0, atRiskNeed: 0.3, criticalNeed: 0.6, paceTolerance: 0 },
  },
};

export function riskPhase(currentQuarter: number, deadlineQuarter: number): RiskPhase {
  const quartersLeft = Math.max(deadlineQuarter, 1) - currentQuarter;
  if (quartersLeft < 0) return "past";
  if (quartersLeft === 0) return "deadline";
  if (quartersLeft === 1) return "late";
  if (quartersLeft === 2) return "building";
  return "early";
}

/**
 * Estimate qualifying plays per quarter: the average of completed quarters, or
 * the default while Q1 is in progress (or the current Q1 pace if already higher).
 */
export function estimatePlaysPerQuarter(
  currentQuarter: number,
  playsByQuarter: Record<number, number>,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): number {
  const completedQuarters = Math.max(currentQuarter - 1, 0);
  if (completedQuarters === 0) return Math.max(config.defaultPlaysPerQuarter, playsByQuarter[1] ?? 0);
  let total = 0;
  for (let q = 1; q <= completedQuarters; q++) total += playsByQuarter[q] ?? 0;
  if (total === 0) return config.defaultPlaysPerQuarter;
  return total / completedQuarters;
}

/**
 * Qualifying plays still to come before the end of the deadline quarter, as a
 * range. The spread reflects how little we know: wide in Q1, narrowing as
 * completed quarters give real data.
 */
export function estimateOpportunities(
  currentQuarter: number,
  deadlineQuarter: number,
  playsByQuarter: Record<number, number>,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): OpportunityEstimate {
  if (currentQuarter > deadlineQuarter) return { low: 0, expected: 0, high: 0 };
  const perQuarter = estimatePlaysPerQuarter(currentQuarter, playsByQuarter, config);
  const restOfCurrent = Math.max(perQuarter - (playsByQuarter[currentQuarter] ?? 0), 0);
  const expected = restOfCurrent + (deadlineQuarter - currentQuarter) * perQuarter;
  const u = config.uncertaintyByCompletedQuarters;
  const spread = u[Math.min(Math.max(currentQuarter - 1, 0), u.length - 1)];
  return {
    low: Math.floor(expected * (1 - spread)),
    expected: Math.round(expected),
    high: Math.ceil(expected * (1 + spread)),
  };
}

/** Back-compat helper: expected opportunities only. */
export function estimateOpportunitiesRemaining(
  currentQuarter: number,
  deadlineQuarter: number,
  playsByQuarter: Record<number, number>,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): number {
  return estimateOpportunities(currentQuarter, deadlineQuarter, playsByQuarter, config).expected;
}

const plays = (n: number) => `${n} ${n === 1 ? "play" : "plays"}`;

/**
 * Pure, deterministic, progressive MPR risk evaluation.
 *
 * Urgency is judged by "need": the share of the estimated remaining
 * opportunities the player would have to be on the field for. The estimate is
 * a range; early phases judge against its optimistic end and late phases
 * against its conservative end. Each phase has its own thresholds, so the same
 * shortfall is quiet in Q1 and urgent in Q4. Only once the deadline has passed is a player reported as having
 * missed MPR: before that the true number of remaining plays is unknown, so
 * "cannot make it" is never claimed.
 */
export function evaluatePlayerRisk(input: RiskInput, config: RiskConfig = DEFAULT_RISK_CONFIG): RiskResult {
  const remaining = Math.max(input.requiredPlays - input.completedPlays, 0);

  if (!input.playerEligible) {
    return { level: "excluded", remaining, reason: "Not currently eligible for MPR tracking" };
  }
  if (remaining === 0) {
    return { level: "met", remaining: 0, reason: "Minimum requirement satisfied" };
  }

  const deadline = Math.max(input.deadlineQuarter, 1);
  const phase = riskPhase(input.currentQuarter, deadline);
  if (phase === "past") {
    return {
      level: "missed",
      remaining,
      phase,
      reason: `MPR deadline has passed; short by ${plays(remaining)}`,
      opportunities: { low: 0, expected: 0, high: 0 },
      projectedOpportunitiesRemaining: 0,
    };
  }

  const opportunities = estimateOpportunities(input.currentQuarter, deadline, input.playsByQuarter, config);
  const t = config.phases[phase];
  const need = remaining / Math.max(opportunities[t.basis], 1);

  // Pace: compare progress with the elapsed share of the pre-deadline game.
  let playedBeforeDeadline = 0;
  for (let q = 1; q <= Math.min(input.currentQuarter, deadline); q++) playedBeforeDeadline += input.playsByQuarter[q] ?? 0;
  const projectedTotal = playedBeforeDeadline + opportunities.expected;
  const expectedSoFar = projectedTotal > 0 ? input.requiredPlays * (playedBeforeDeadline / projectedTotal) : 0;
  const behindPace = t.paceTolerance > 0 && input.completedPlays < expectedSoFar * t.paceTolerance;

  const base = { remaining, phase, opportunities, projectedOpportunitiesRemaining: opportunities.expected };
  const left = `about ${opportunities.low}–${opportunities.high} plays likely left`;

  if (need >= t.criticalNeed) {
    return {
      ...base,
      level: "critical",
      reason:
        remaining > opportunities.high
          ? `Needs ${plays(remaining)} with ${left}: keep on the field every play`
          : `Needs ${plays(remaining)} with ${left}: play now and keep in`,
    };
  }
  if (need >= t.atRiskNeed) {
    return { ...base, level: "at_risk", reason: `Needs ${plays(remaining)} with ${left}` };
  }
  if (need >= t.behindNeed || behindPace) {
    return {
      ...base,
      level: "behind",
      reason: behindPace
        ? `Falling behind: ${input.completedPlays} of ~${Math.round(expectedSoFar)} expected by now`
        : `Needs ${plays(remaining)} before the deadline`,
    };
  }
  return { ...base, level: "needs_plays", reason: `On track; needs ${plays(remaining)} more` };
}

export const RISK_ORDER: Record<MprRiskLevel, number> = {
  missed: 0,
  critical: 1,
  at_risk: 2,
  behind: 3,
  needs_plays: 4,
  met: 5,
  excluded: 6,
};

/** Levels that justify a strong (amber/red) visual treatment. */
export function isActionable(level: MprRiskLevel): boolean {
  return level === "at_risk" || level === "critical" || level === "missed";
}
