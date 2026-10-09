import { describe, expect, it } from "vitest";
import { isFocusRelevant, summarizeRoster, type PlayerView } from "../../src/domain/selectors/getGameState";
import type { GamePlayerStatus, MprRiskLevel } from "../../src/domain/enums";

function row(id: string, status: GamePlayerStatus, level: MprRiskLevel): PlayerView {
  return {
    player: { id, teamId: "t", jerseyNumber: id, displayName: `P${id}`, activeOnTeam: true, createdAt: "", updatedAt: "" },
    gamePlayer: { id: `g:${id}`, gameId: "g", playerId: id, status, minimumRequiredPlays: 8, createdAt: "", updatedAt: "" },
    count: 0,
    required: 8,
    remaining: level === "met" ? 0 : 8,
    risk: { level, remaining: level === "met" ? 0 : 8, reason: "" },
    inLineup: false,
    fieldEligible: status === "active",
    quarterCounts: {},
  };
}

describe("isFocusRelevant", () => {
  it.each([
    ["active, needs plays", row("1", "active", "needs_plays"), false, true],
    ["active, at risk", row("2", "active", "at_risk"), false, true],
    ["active, critical", row("3", "active", "critical"), false, true],
    ["active, met, unselected", row("4", "active", "met"), false, false],
    ["active, met, selected", row("5", "active", "met"), true, true],
    ["late", row("6", "late", "excluded"), false, false],
    ["absent", row("7", "absent", "excluded"), false, false],
    ["injured", row("8", "injured", "excluded"), false, false],
    ["exempt", row("9", "exempt", "excluded"), false, false],
    ["ineligible", row("10", "ineligible", "excluded"), false, false],
  ])("%s", (_name, r, selected, expected) => {
    expect(isFocusRelevant(r, selected)).toBe(expected);
  });
});

describe("summarizeRoster", () => {
  it("partitions the roster and counts the lineup separately", () => {
    const rows = [
      row("1", "active", "needs_plays"),
      row("2", "active", "critical"),
      row("3", "active", "met"),
      row("4", "injured", "excluded"),
      row("5", "late", "excluded"),
    ];
    const s = summarizeRoster(rows, (id) => id === "1" || id === "3" || id === "4");
    // #4 is "in" by stale state but not field-eligible, so it is not on the field.
    expect(s).toEqual({ onField: 2, needPlays: 2, met: 1, unavailable: 2, total: 5 });
    expect(s.needPlays + s.met + s.unavailable).toBe(s.total);
  });
});
