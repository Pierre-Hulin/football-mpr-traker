/** Shared Playwright helpers for the E2E flows. */
import { expect, type Page } from "@playwright/test";

const ROSTER = Array.from({ length: 14 }, (_, i) => `${i + 1} Player ${String.fromCharCode(65 + i)}`).join("\n");

export async function createTeamWithRoster(page: Page) {
  await page.goto("/");
  await page.getByTestId("create-team").click();
  await page.getByLabel("Team name").fill("Trojans");
  await page.getByRole("button", { name: "CREATE TEAM" }).click();
  await expect(page).toHaveURL(/\/roster$/);
  await page.getByTestId("import-roster").click();
  await page.getByLabel(/One player per line/).fill(ROSTER);
  await page.getByTestId("parse-roster").click();
  await expect(page.getByTestId("review-list").locator("li")).toHaveCount(14);
  await page.getByTestId("confirm-import").click();
  await expect(page).toHaveURL(/\/roster$/);
}

export async function startGame(
  page: Page,
  opts: { requiredPlays?: number; beforeReview?: (page: Page) => Promise<void> } = {},
) {
  await page.getByRole("link", { name: "Start Game" }).click();
  await page.getByTestId("continue-team").click();
  await page.getByLabel("Opponent / game label").fill("Wildcats");
  if (opts.requiredPlays !== undefined) {
    await page.getByRole("spinbutton", { name: "Minimum required plays" }).fill(String(opts.requiredPlays));
  }
  await page.getByTestId("next-availability").click();
  if (opts.beforeReview) await opts.beforeReview(page);
  await page.getByTestId("review-game").click();
  await page.getByTestId("start-game").click();
  await expect(page).toHaveURL(/\/live$/);
}

export const row = (page: Page, jersey: number) => page.locator(`[data-testid=player-row][data-jersey="${jersey}"]`);
export const toggle = (page: Page, jersey: number) => row(page, jersey).getByTestId("toggle");

export async function selectPlayers(page: Page, jerseys: number[]) {
  for (const j of jerseys) await toggle(page, j).click();
}

export const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export async function record(page: Page, expectedNext: number) {
  await page.getByTestId("record").click();
  await expect(page.getByTestId("next-play")).toHaveText(String(expectedNext));
}
