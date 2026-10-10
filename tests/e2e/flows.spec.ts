import { expect, test } from "@playwright/test";
import { createTeamWithRoster, expectLineupSaved, range, record, row, selectPlayers, startGame, toggle } from "./helpers";

test("E2E 1 — first game: create team, paste roster, record 3 plays", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await expect(page.getByTestId("selected-count")).toContainText("0/11");
  await selectPlayers(page, range(1, 11));
  await expect(page.getByTestId("selected-count")).toContainText("11/11");
  await record(page, 2);
  await record(page, 3);
  await record(page, 4);
  await expect(row(page, 1)).toContainText("3 / 8");
  await expect(row(page, 12)).toContainText("0 / 8");
  // Lineup persists between plays.
  await expect(page.getByTestId("selected-count")).toContainText("11/11");
});

test("E2E 2 — persistence: lineup survives reload", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await selectPlayers(page, range(1, 11));
  await expect(page.getByTestId("selected-count")).toContainText("11/11");
  // 11/11 appears on tap; reload only once the taps are committed (an earlier
  // reload is what the beforeunload guard protects against).
  await expectLineupSaved(page);
  await page.reload();
  await expect(page.getByTestId("selected-count")).toContainText("11/11");
  await expect(toggle(page, 5)).toHaveAttribute("aria-pressed", "true");
  await record(page, 2);
  // One substitution keeps 11.
  await toggle(page, 1).click();
  await toggle(page, 12).click();
  await expect(page.getByTestId("selected-count")).toContainText("11/11");
});

test("E2E 3 — wrong count: warn, cancel, fix, record", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await selectPlayers(page, range(1, 10));
  await page.getByTestId("record").click();
  await expect(page.getByRole("alertdialog")).toContainText("Record play with 10 players?");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("next-play")).toHaveText("1");
  await toggle(page, 11).click();
  await record(page, 2);
});

test("E2E 4 — override: record anyway shows warning in history", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await selectPlayers(page, range(1, 10));
  await page.getByTestId("record").click();
  await page.getByTestId("record-anyway").click();
  await expect(page.getByTestId("next-play")).toHaveText("2");
  await page.getByRole("button", { name: "Game menu" }).click();
  await page.getByRole("link", { name: "Play history" }).click();
  await expect(page.getByTestId("history-row").first()).toContainText("10 players · Counts ⚠");
});

test("E2E 5 — non-counting play advances play but not totals", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await selectPlayers(page, range(1, 11));
  await record(page, 2);
  await page.getByTestId("record-more").click();
  await page.getByTestId("non-counting").click();
  await page.getByRole("radio", { name: "Accepted penalty" }).click();
  await page.getByRole("button", { name: "Record non-counting" }).click();
  await expect(page.getByTestId("next-play")).toHaveText("3");
  await expect(row(page, 1)).toContainText("1 / 8");
});

test("E2E 6 — injury keeps count and removes from lineup and warnings", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await selectPlayers(page, range(1, 11));
  await record(page, 2);
  await record(page, 3);
  await record(page, 4);
  await row(page, 3).locator(".prow-main").click();
  await page.getByRole("button", { name: "Mark injured" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark injured" }).click();
  await expect(row(page, 3)).toContainText("3 / 8");
  await expect(row(page, 3)).toContainText("INJURED");
  await expect(page.getByTestId("selected-count")).toContainText("10/11");
  await expect(row(page, 3).getByTestId("toggle")).toHaveCount(0);
});

test("E2E 7 — quarter end advances and preserves lineup", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await selectPlayers(page, range(1, 11));
  await record(page, 2);
  await page.getByTestId("quarter").click();
  await page.getByTestId("end-quarter").click();
  await expect(page.getByTestId("quarter")).toContainText("Q2");
  await expect(page.getByTestId("selected-count")).toContainText("11/11");
});

test("E2E 8 — undo reverts counts and play number", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await selectPlayers(page, range(1, 11));
  await record(page, 2);
  await record(page, 3);
  await expect(row(page, 1)).toContainText("2 / 8");
  await page.getByTestId("undo-last").click();
  await expect(page.getByTestId("next-play")).toHaveText("2");
  await expect(row(page, 1)).toContainText("1 / 8");
});

test("E2E 9 — complete game shows summary with export", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page, { requiredPlays: 2 });
  await selectPlayers(page, range(1, 11));
  await record(page, 2);
  await record(page, 3);
  await page.getByRole("button", { name: "Game menu" }).click();
  await page.getByTestId("end-game").click();
  await expect(page.getByRole("dialog")).toContainText("11 of 14");
  await page.getByTestId("confirm-end-game").click();
  await expect(page).toHaveURL(/\/summary$/);
  await expect(page.getByTestId("summary-table")).toContainText("Player A");
  const download = page.waitForEvent("download");
  await page.getByTestId("export-summary").click();
  expect((await download).suggestedFilename()).toMatch(/summary\.csv$/);
});

test("E2E 10 — offline: reload and complete core actions with no network", async ({ page, context }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("next-play")).toHaveText("1");
  await selectPlayers(page, range(1, 11));
  await record(page, 2);
  await page.getByTestId("quarter").click();
  await page.getByTestId("end-quarter").click();
  await expect(page.getByTestId("quarter")).toContainText("Q2");
  await page.getByRole("button", { name: "Game menu" }).click();
  await page.getByTestId("end-game").click();
  await page.getByTestId("confirm-end-game").click();
  await expect(page).toHaveURL(/\/summary$/);
  const download = page.waitForEvent("download");
  await page.getByTestId("export-summary").click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});
