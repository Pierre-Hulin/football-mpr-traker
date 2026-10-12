import { expect, test, type Page } from "@playwright/test";
import { createTeamWithRoster, range, startGame } from "./helpers";

const tile = (page: Page, jersey: number) => page.locator(`[data-testid=player-tile][data-jersey="${jersey}"] button`);

async function recordPlays(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    const next = Number(await page.getByTestId("next-play").textContent());
    await page.getByTestId("record").click();
    await expect(page.getByTestId("next-play")).toHaveText(String(next + 1));
  }
}

async function endQuarter(page: Page, next: string) {
  await page.getByTestId("quarter").click();
  await page.getByTestId("end-quarter").click();
  await expect(page.getByTestId("quarter")).toContainText(next);
}

test("urgency escalates across the four quarters without warning fatigue", async ({ page }) => {
  test.setTimeout(120_000);
  await createTeamWithRoster(page);
  await startGame(page); // 14 players, minimum 8, deadline end of Q4
  await page.getByTestId("view-toggle").click();
  await expect(page.getByTestId("roster-grid")).toBeVisible();
  for (const j of range(1, 11)) await tile(page, j).click();

  // Q1: #12–14 haven't played. No banner, no flags, no "behind" dots.
  await recordPlays(page, 6);
  await expect(page.getByTestId("risk-banner")).toHaveCount(0);
  await expect(page.locator(".pt-flag")).toHaveCount(0);
  await expect(page.locator(".pt-behind")).toHaveCount(0);

  // Q2: still no banner and no amber/red flags. Zero plays shows only a quiet dot.
  await endQuarter(page, "Q2");
  await recordPlays(page, 6);
  await expect(page.getByTestId("risk-banner")).toHaveCount(0);
  await expect(page.locator(".pt-flag")).toHaveCount(0);
  await expect(tile(page, 12).locator(".pt-behind")).toHaveCount(1);
  await expect(tile(page, 12)).toHaveAttribute("aria-label", /falling behind/);
  await expect(tile(page, 1).locator(".pt-behind")).toHaveCount(0);
  // Blue/white still carries IN/OUT.
  await expect(tile(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(tile(page, 12)).toHaveAttribute("aria-pressed", "false");

  // Q3: genuinely at risk players get amber treatment and the banner appears.
  await endQuarter(page, "Q3");
  await expect(page.getByTestId("risk-banner")).toHaveAttribute("data-tone", "at_risk");
  await expect(page.getByTestId("risk-banner")).toContainText("3 PLAYERS AT RISK");
  await expect(tile(page, 12)).toHaveClass(/risk-at_risk/);
  await expect(page.locator(".pt-flag.critical")).toHaveCount(0);

  // Q4: opportunities are running out, so the banner escalates to red.
  await recordPlays(page, 6);
  await endQuarter(page, "Q4");
  await expect(page.getByTestId("risk-banner")).toHaveAttribute("data-tone", "critical");
  await expect(page.getByTestId("risk-banner")).toContainText("PLAY NOW: #12 NEEDS 8");
  await expect(tile(page, 12)).toHaveClass(/risk-critical/);
  await expect(tile(page, 12)).toHaveAttribute("aria-label", /critical/);

  // Getting players on the field clears the warnings: MPR counting is unchanged.
  for (const j of [1, 2, 3]) await tile(page, j).click();
  for (const j of [12, 13, 14]) await tile(page, j).click();
  await recordPlays(page, 8);
  await expect(tile(page, 12)).toContainText("8/8");
  await expect(page.getByTestId("risk-banner")).toHaveCount(0);

  // Overtime: anyone still short has missed the deadline. Here nobody is short.
  await endQuarter(page, "OT");
  await expect(page.locator(".pt-flag")).toHaveCount(0);
});
