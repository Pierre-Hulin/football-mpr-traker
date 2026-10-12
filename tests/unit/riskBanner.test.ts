import { describe, expect, it } from "vitest";
import { getRiskBanner, type PlayerView } from "../../src/domain/selectors/getGameState";
import type { MprRiskLevel } from "../../src/domain/enums";

function row(id: string, level: MprRiskLevel): PlayerView {
  return {
    player: { id, teamId: "t", jerseyNumber: id, displayName: `P${id}`, activeOnTeam: true, createdAt: "", updatedAt: "" },
    gamePlayer: { id: `g:${id}`, gameId: "g", playerId: id, status: "active", minimumRequiredPlays: 8, createdAt: "", updatedAt: "" },
    count: 2,
    required: 8,
    remaining: 6,
    risk: { level, remaining: 6, reason: "" },
    inLineup: false,
    fieldEligible: true,
    quarterCounts: {},
  };
}

// getRiskBanner receives the actionable list (missed / critical / at risk) built by buildGameView.
describe("risk banner is proportionate to urgency", () => {
  it("hidden when nobody needs action", () => {
    for (const q of [1, 2, 3, 4]) expect(getRiskBanner([], q, 4)).toBeNull();
  });

  it("at-risk players alone do not raise the banner in Q1/Q2", () => {
    expect(getRiskBanner([row("7", "at_risk")], 1, 4)).toBeNull();
    expect(getRiskBanner([row("7", "at_risk")], 2, 4)).toBeNull();
  });

  it("at-risk players raise an amber banner from Q3 onward", () => {
    expect(getRiskBanner([row("7", "at_risk")], 3, 4)).toMatchObject({ tone: "at_risk" });
    expect(getRiskBanner([row("7", "at_risk")], 4, 4)).toMatchObject({ tone: "at_risk" });
  });

  it("critical players always raise a red banner, even in Q1/Q2", () => {
    const b = getRiskBanner([row("9", "critical"), row("7", "at_risk")], 2, 4);
    expect(b?.tone).toBe("critical");
    // In Q2 the at-risk player is left to the inline cue.
    expect(b?.rows.map((r) => r.player.id)).toEqual(["9"]);
  });

  it("late in the game the red banner lists urgent players first, then at-risk ones", () => {
    const b = getRiskBanner([row("9", "critical"), row("4", "missed"), row("7", "at_risk")], 5, 4);
    expect(b?.tone).toBe("critical");
    expect(b?.rows.map((r) => r.player.id)).toEqual(["9", "4", "7"]);
  });

  it("respects an earlier deadline", () => {
    expect(getRiskBanner([row("7", "at_risk")], 1, 2)).toMatchObject({ tone: "at_risk" });
  });
});
