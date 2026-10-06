import { describe, expect, it } from "vitest";
import {
  estimateOpportunitiesRemaining,
  evaluatePlayerRisk,
  type RiskInput,
} from "../../src/domain/services/riskEngine";

const base: RiskInput = {
  requiredPlays: 8,
  completedPlays: 0,
  currentQuarter: 1,
  deadlineQuarter: 4,
  totalGamePlaysSoFar: 0,
  playsByQuarter: {},
  playerEligible: true,
};

describe("evaluatePlayerRisk", () => {
  it("returns met when the requirement is satisfied", () => {
    const r = evaluatePlayerRisk({ ...base, completedPlays: 8 });
    expect(r.level).toBe("met");
    expect(r.remaining).toBe(0);
  });

  it("keeps met above the minimum", () => {
    expect(evaluatePlayerRisk({ ...base, completedPlays: 13 }).level).toBe("met");
  });

  it("returns excluded for ineligible players even when short", () => {
    const r = evaluatePlayerRisk({ ...base, completedPlays: 2, playerEligible: false, currentQuarter: 4 });
    expect(r.level).toBe("excluded");
    expect(r.remaining).toBe(6);
  });

  it("treats a zero requirement as met", () => {
    expect(evaluatePlayerRisk({ ...base, requiredPlays: 0 }).level).toBe("met");
  });

  it("no plays recorded yet: needs plays, not a warning", () => {
    expect(evaluatePlayerRisk(base).level).toBe("needs_plays");
  });

  it("Q1 low participation is not critical", () => {
    const r = evaluatePlayerRisk({ ...base, completedPlays: 0, totalGamePlaysSoFar: 8, playsByQuarter: { 1: 8 } });
    expect(r.level).toBe("needs_plays");
  });

  it("Q3 behind pace is at risk", () => {
    // 12 plays per quarter; Q3 midway: 30 plays done, ~18 left before end of Q4.
    const r = evaluatePlayerRisk({
      ...base,
      currentQuarter: 3,
      completedPlays: 2,
      totalGamePlaysSoFar: 30,
      playsByQuarter: { 1: 12, 2: 12, 3: 6 },
    });
    expect(["at_risk", "critical"]).toContain(r.level);
    expect(r.level).toBe("at_risk");
  });

  it("Q3 on pace stays needs plays", () => {
    const r = evaluatePlayerRisk({
      ...base,
      currentQuarter: 3,
      completedPlays: 6,
      totalGamePlaysSoFar: 30,
      playsByQuarter: { 1: 12, 2: 12, 3: 6 },
    });
    expect(r.level).toBe("needs_plays");
  });

  it("deadline quarter in progress and still short is at least at risk", () => {
    const r = evaluatePlayerRisk({
      ...base,
      currentQuarter: 4,
      completedPlays: 7,
      playsByQuarter: { 1: 12, 2: 12, 3: 12 },
    });
    expect(r.level).toBe("at_risk");
  });

  it("deadline quarter with too few plays left is critical", () => {
    const r = evaluatePlayerRisk({
      ...base,
      currentQuarter: 4,
      completedPlays: 5,
      playsByQuarter: { 1: 12, 2: 12, 3: 12, 4: 10 },
    });
    expect(r.projectedOpportunitiesRemaining).toBe(2);
    expect(r.level).toBe("critical");
  });

  it("after the deadline (overtime) still short is critical", () => {
    const r = evaluatePlayerRisk({ ...base, currentQuarter: 5, completedPlays: 4, playsByQuarter: { 1: 10, 2: 10, 3: 10, 4: 10 } });
    expect(r.level).toBe("critical");
    expect(r.reason).toMatch(/deadline/i);
  });

  it("an earlier deadline quarter is honoured", () => {
    expect(evaluatePlayerRisk({ ...base, deadlineQuarter: 2, currentQuarter: 2, completedPlays: 5, playsByQuarter: { 1: 12 } }).level).toBe("at_risk");
    expect(evaluatePlayerRisk({ ...base, deadlineQuarter: 2, currentQuarter: 3, completedPlays: 5, playsByQuarter: { 1: 12, 2: 12 } }).level).toBe("critical");
  });

  it("late activation mid-Q3 with no plays is at risk", () => {
    // ~14 opportunities left; needs 8 (57%).
    const r = evaluatePlayerRisk({
      ...base,
      currentQuarter: 3,
      completedPlays: 0,
      totalGamePlaysSoFar: 34,
      playsByQuarter: { 1: 12, 2: 12, 3: 10 },
    });
    expect(r.projectedOpportunitiesRemaining).toBe(14);
    expect(r.level).toBe("at_risk");
  });

  it("late activation in the deadline quarter is critical", () => {
    const r = evaluatePlayerRisk({ ...base, currentQuarter: 4, completedPlays: 0, playsByQuarter: { 1: 12, 2: 12, 3: 12, 4: 3 } });
    expect(r.level).toBe("critical");
  });

  it("unusual short game (few plays per quarter) escalates earlier", () => {
    const r = evaluatePlayerRisk({
      ...base,
      currentQuarter: 3,
      completedPlays: 1,
      totalGamePlaysSoFar: 9,
      playsByQuarter: { 1: 4, 2: 4, 3: 1 },
    });
    expect(r.level).toBe("critical");
  });

  it("boundary: exactly 50% of remaining opportunities is at risk", () => {
    // Q2 start: avg 12, 0 played in Q2 -> 12 + 2*12 = 36 opportunities. remaining 18 of 36 = 50%.
    const r = evaluatePlayerRisk({
      ...base,
      requiredPlays: 18,
      completedPlays: 0,
      currentQuarter: 2,
      playsByQuarter: { 1: 12 },
    });
    expect(r.projectedOpportunitiesRemaining).toBe(36);
    expect(r.level).toBe("at_risk");
  });

  it("boundary: exactly 80% of remaining opportunities is critical", () => {
    const r = evaluatePlayerRisk({
      ...base,
      requiredPlays: 30, // 30 of 36 = 83%
      completedPlays: 0,
      currentQuarter: 2,
      playsByQuarter: { 1: 12 },
    });
    expect(r.level).toBe("critical");
  });

  it("is deterministic", () => {
    const input = { ...base, currentQuarter: 2, completedPlays: 3, playsByQuarter: { 1: 14, 2: 4 } };
    expect(evaluatePlayerRisk(input)).toEqual(evaluatePlayerRisk(input));
  });
});

describe("estimateOpportunitiesRemaining", () => {
  it("uses the default during Q1", () => {
    expect(estimateOpportunitiesRemaining(1, 4, {})).toBe(48);
    expect(estimateOpportunitiesRemaining(1, 4, { 1: 5 })).toBe(43);
  });
  it("uses actual average after Q1", () => {
    expect(estimateOpportunitiesRemaining(3, 4, { 1: 10, 2: 14, 3: 4 })).toBe(20);
  });
  it("is zero after the deadline", () => {
    expect(estimateOpportunitiesRemaining(5, 4, { 1: 10 })).toBe(0);
  });
});
