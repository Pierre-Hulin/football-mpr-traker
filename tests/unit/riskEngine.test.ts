import { describe, expect, it } from "vitest";
import {
  estimateOpportunities,
  estimateOpportunitiesRemaining,
  evaluatePlayerRisk,
  isActionable,
  riskPhase,
  type RiskInput,
} from "../../src/domain/services/riskEngine";
import type { MprRiskLevel } from "../../src/domain/enums";

/** A typical game: 12 qualifying plays per completed quarter, `inQuarter` plays so far in the current one. */
function at(currentQuarter: number, inQuarter: number, completedPlays: number, extra: Partial<RiskInput> = {}): RiskInput {
  const playsByQuarter: Record<number, number> = {};
  for (let q = 1; q < currentQuarter; q++) playsByQuarter[q] = 12;
  playsByQuarter[currentQuarter] = inQuarter;
  const totalGamePlaysSoFar = Object.values(playsByQuarter).reduce((a, b) => a + b, 0);
  return {
    requiredPlays: 8,
    completedPlays,
    currentQuarter,
    deadlineQuarter: 4,
    totalGamePlaysSoFar,
    playsByQuarter,
    playerEligible: true,
    ...extra,
  };
}

const level = (input: RiskInput): MprRiskLevel => evaluatePlayerRisk(input).level;

describe("phases follow the deadline", () => {
  it.each([
    [1, 4, "early"],
    [2, 4, "building"],
    [3, 4, "late"],
    [4, 4, "deadline"],
    [5, 4, "past"],
    [1, 2, "late"],
    [2, 2, "deadline"],
    [3, 2, "past"],
  ] as const)("Q%i with deadline Q%i is %s", (q, d, phase) => {
    expect(riskPhase(q, d)).toBe(phase);
  });
});

describe("Q1: no warnings unless mathematically necessary", () => {
  it("on track", () => expect(level(at(1, 6, 3))).toBe("needs_plays"));
  it("zero plays midway through Q1 is not a warning", () => expect(level(at(1, 6, 0))).toBe("needs_plays"));
  it("zero plays late in Q1 is still not a warning", () => expect(level(at(1, 14, 0))).toBe("needs_plays"));
  it("only warns when the requirement exceeds even an optimistic estimate of what is left", () => {
    // ~42 plays expected before the deadline, at most ~59.
    expect(level(at(1, 6, 0, { requiredPlays: 60 }))).toBe("critical");
    expect(level(at(1, 6, 0, { requiredPlays: 40 }))).toBe("needs_plays");
  });
});

describe("Q2: subtle indicators only", () => {
  it("on track", () => expect(level(at(2, 6, 4))).toBe("needs_plays"));
  it("zero plays is at most a subtle 'behind', never critical", () => {
    // Sat out all of Q1: worth a quiet nudge, nothing more.
    expect(level(at(2, 0, 0))).toBe("behind");
    expect(level(at(2, 6, 0))).toBe("behind");
    expect(level(at(2, 11, 0))).toBe("behind");
  });
  it("falling behind pace", () => expect(level(at(2, 8, 1))).toBe("behind"));
  it("genuinely at risk only when the remaining need is large", () => {
    // ~26 plays expected before the deadline; needs 20 of them.
    expect(level(at(2, 10, 0, { requiredPlays: 20 }))).toBe("at_risk");
    expect(level(at(2, 10, 0, { requiredPlays: 15 }))).toBe("behind");
  });
  it("critically behind when the need exceeds conservative opportunities", () => {
    expect(level(at(2, 10, 0, { requiredPlays: 28 }))).toBe("critical");
  });
});

describe("Q3: prominent warnings when genuinely at risk", () => {
  it("on track", () => expect(level(at(3, 6, 6))).toBe("needs_plays"));
  it("falling behind", () => expect(level(at(3, 0, 2))).toBe("behind"));
  it("at risk late in Q3 with no plays", () => expect(level(at(3, 10, 0))).toBe("at_risk"));
  it("critically behind", () => expect(level(at(3, 10, 0, { requiredPlays: 12 }))).toBe("critical"));
});

describe("Q4 (deadline quarter): escalates as opportunities shrink", () => {
  it("one short early in Q4 is a quiet 'behind'", () => expect(level(at(4, 0, 7))).toBe("behind"));
  it("half the requirement left at the start of Q4 is at risk", () => expect(level(at(4, 0, 4))).toBe("at_risk"));
  it("zero plays at the start of Q4 is critical", () => expect(level(at(4, 0, 0))).toBe("critical"));
  it("the same shortfall escalates as Q4 runs down", () => {
    const seq = [0, 6, 9, 11].map((played) => level(at(4, played, 6)));
    expect(seq).toEqual(["behind", "at_risk", "critical", "critical"]);
  });
  it("never claims 'missed' before the deadline, even with no estimated plays left", () => {
    const r = evaluatePlayerRisk(at(4, 14, 1));
    expect(r.level).toBe("critical");
    expect(r.reason).not.toMatch(/cannot|impossible|missed|unable/i);
  });
});

describe("mathematically unable: only once the deadline has passed", () => {
  it("overtime after a Q4 deadline", () => {
    const r = evaluatePlayerRisk(at(5, 2, 6));
    expect(r.level).toBe("missed");
    expect(r.reason).toMatch(/deadline has passed; short by 2 plays/);
  });
  it("Q3 with a halftime deadline", () => {
    expect(level(at(3, 4, 5, { deadlineQuarter: 2 }))).toBe("missed");
  });
  it("a player who met the minimum is never 'missed'", () => {
    expect(level(at(5, 2, 8))).toBe("met");
  });
});

describe("short quarters (few plays per quarter)", () => {
  // Q1 had only 6 qualifying plays.
  const short = (q: number, inQuarter: number, completed: number) => {
    const pbq: Record<number, number> = {};
    for (let i = 1; i < q; i++) pbq[i] = 6;
    pbq[q] = inQuarter;
    return level({ ...at(q, inQuarter, completed), playsByQuarter: pbq });
  };
  it("zero plays in Q2 is still not critical", () => expect(short(2, 6, 0)).toBe("behind"));
  it("but is critical by Q4", () => expect(short(4, 0, 0)).toBe("critical"));
});

describe("always-on rules", () => {
  it("met and excluded take precedence", () => {
    expect(level(at(4, 10, 9))).toBe("met");
    expect(level(at(4, 10, 0, { playerEligible: false }))).toBe("excluded");
    expect(level(at(5, 2, 0, { playerEligible: false }))).toBe("excluded");
    expect(level(at(3, 0, 0, { requiredPlays: 0 }))).toBe("met");
  });
  it("is deterministic", () => {
    const input = at(3, 4, 2);
    expect(evaluatePlayerRisk(input)).toEqual(evaluatePlayerRisk(input));
  });
  it("only at risk / critical / missed are actionable", () => {
    expect(["missed", "critical", "at_risk"].every((l) => isActionable(l as MprRiskLevel))).toBe(true);
    expect(["behind", "needs_plays", "met", "excluded"].some((l) => isActionable(l as MprRiskLevel))).toBe(false);
  });
});

describe("opportunity estimate accounts for uncertainty", () => {
  it("is a range around the expected count", () => {
    const e = estimateOpportunities(2, 4, { 1: 12, 2: 4 });
    expect(e.expected).toBe(32);
    expect(e.low).toBeLessThan(e.expected);
    expect(e.high).toBeGreaterThan(e.expected);
  });
  it("narrows as completed quarters provide data", () => {
    const spread = (q: number) => {
      const pbq: Record<number, number> = {};
      for (let i = 1; i < q; i++) pbq[i] = 12;
      const e = estimateOpportunities(q, 4, pbq);
      return (e.high - e.low) / e.expected;
    };
    expect(spread(1)).toBeGreaterThan(spread(2));
    expect(spread(2)).toBeGreaterThan(spread(3));
    expect(spread(3)).toBeGreaterThan(spread(4));
  });
  it("uses the default rate in Q1 and the observed rate later", () => {
    expect(estimateOpportunitiesRemaining(1, 4, {})).toBe(48);
    expect(estimateOpportunitiesRemaining(3, 4, { 1: 10, 2: 14, 3: 4 })).toBe(20);
    expect(estimateOpportunitiesRemaining(5, 4, { 1: 10 })).toBe(0);
  });
  it("short games (few plays per quarter) escalate earlier", () => {
    const short = (completed: number) =>
      level({ ...at(3, 1, completed), playsByQuarter: { 1: 4, 2: 4, 3: 1 }, totalGamePlaysSoFar: 9 });
    expect(short(1)).toBe("critical");
    expect(level(at(3, 1, 1))).not.toBe("critical");
  });
});
