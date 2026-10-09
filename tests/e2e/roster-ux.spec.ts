import { expect, test, type Page } from "@playwright/test";
import { createTeamWithRoster, range, record, row, selectPlayers, startGame, toggle } from "./helpers";

const tile = (page: Page, jersey: number) => page.locator(`[data-testid=player-tile][data-jersey="${jersey}"] button`);
const statusRow = (page: Page, jersey: number) => page.locator(`[data-testid=status-row][data-jersey="${jersey}"]`);

async function setPregameStatus(page: Page, jersey: number, status: string) {
  await statusRow(page, jersey).click();
  await page.getByRole("radio", { name: new RegExp(`^${status}`) }).click();
  await expect(statusRow(page, jersey)).toContainText(status.toUpperCase());
}

async function switchView(page: Page, to: "grid" | "list") {
  await page.getByTestId("view-toggle").click();
  await expect(page.getByTestId(to === "grid" ? "roster-grid" : "roster-list")).toBeVisible();
}

test("pregame status selection uses the status sheet, not dropdowns", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page, {
    beforeReview: async (p) => {
      await expect(p.locator("select")).toHaveCount(0);
      await expect(p.getByTestId("availability-summary")).toHaveText("14 of 14 active");
      await setPregameStatus(p, 13, "Absent");
      await setPregameStatus(p, 14, "Late");
      await expect(p.getByTestId("availability-summary")).toHaveText("12 of 14 active");
      // Changing your mind is one more tap.
      await setPregameStatus(p, 13, "Active");
      await setPregameStatus(p, 13, "Absent");
    },
  });
  await expect(row(page, 13)).toContainText("ABSENT");
  await expect(row(page, 14).getByRole("button", { name: /Activate late player/ })).toBeVisible();
  await expect(toggle(page, 13)).toHaveCount(0);
});

test("Clear → toast expires → Restore lineup brings back the exact lineup", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  const lineup = [1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 14];
  await selectPlayers(page, lineup);
  await expect(page.getByTestId("selected-count")).toContainText("11/11");
  await expect(page.getByTestId("restore-lineup")).toHaveCount(0);

  await page.getByRole("button", { name: /Clear lineup/ }).click();
  await expect(page.getByTestId("selected-count")).toContainText("0/11");
  await expect(page.getByTestId("toast")).toBeHidden({ timeout: 8000 });

  await expect(page.getByTestId("restore-lineup")).toHaveText("↺ RESTORE 11");
  await page.getByTestId("restore-lineup").click();
  await expect(page.getByTestId("selected-count")).toContainText("11/11");
  for (const j of lineup) await expect(toggle(page, j)).toHaveAttribute("aria-pressed", "true");
  for (const j of [4, 8, 13]) await expect(toggle(page, j)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("restore-lineup")).toHaveCount(0);
});

test("Clear → reload → Restore lineup still offered; recording a play retires it", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await selectPlayers(page, range(1, 11));
  await page.getByRole("button", { name: /Clear lineup/ }).click();
  await expect(page.getByTestId("restore-lineup")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("restore-lineup")).toHaveText("↺ RESTORE 11");
  await page.getByTestId("restore-lineup").click();
  await expect(page.getByTestId("selected-count")).toContainText("11/11");

  // Clear again, rebuild by hand, record: the snapshot is now stale and disappears.
  await page.getByRole("button", { name: /Clear lineup/ }).click();
  await selectPlayers(page, range(4, 14));
  await expect(page.getByTestId("restore-lineup")).toBeVisible();
  await record(page, 2);
  await expect(page.getByTestId("restore-lineup")).toHaveCount(0);
});

test("Grid and List share one lineup; view preference persists", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await switchView(page, "grid");
  await expect(page.getByTestId("player-tile")).toHaveCount(14);

  // Select #9 and #14 in Grid.
  await tile(page, 9).click();
  await tile(page, 14).click();
  await expect(tile(page, 9)).toHaveAttribute("aria-pressed", "true");
  await expect(tile(page, 9)).toHaveAccessibleName(/^#9 Player I, IN, 0 of 8 minimum plays/);
  await expect(page.getByTestId("selected-count")).toContainText("2/11");

  // Switch to List: both IN.
  await switchView(page, "list");
  await expect(toggle(page, 9)).toHaveAttribute("aria-pressed", "true");
  await expect(toggle(page, 14)).toHaveAttribute("aria-pressed", "true");

  // Toggle #14 OUT in List, back to Grid: #14 OUT, #9 still IN.
  await toggle(page, 14).click();
  await switchView(page, "grid");
  await expect(tile(page, 14)).toHaveAttribute("aria-pressed", "false");
  await expect(tile(page, 9)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selected-count")).toContainText("1/11");

  // Record from Grid works identically, including wrong-count confirmation.
  await page.getByTestId("record").click();
  await page.getByTestId("record-anyway").click();
  await expect(page.getByTestId("next-play")).toHaveText("2");
  await expect(tile(page, 9)).toContainText("1/8");

  // Preference survives reload.
  await page.reload();
  await expect(page.getByTestId("roster-grid")).toBeVisible();
  await expect(tile(page, 9)).toHaveAttribute("aria-pressed", "true");
});

test("Manage players: injuring an IN player removes them from the lineup and keeps their plays", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await selectPlayers(page, range(1, 11));
  await record(page, 2);
  await record(page, 3);
  await expect(row(page, 4)).toContainText("2 / 8");

  await page.getByRole("button", { name: "Game menu" }).click();
  await page.getByTestId("manage-players").click();
  await expect(statusRow(page, 4)).toContainText("IN now");
  await statusRow(page, 4).click();
  await page.getByRole("button", { name: "Mark injured" }).click();
  await page.getByLabel("Note (optional)").fill("ankle");
  await page.getByRole("dialog").getByRole("button", { name: "Mark injured" }).click();
  await expect(statusRow(page, 4)).toContainText("INJURED");
  await expect(statusRow(page, 4)).not.toContainText("IN now");
  await expect(statusRow(page, 4)).toContainText("2/8 plays");

  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByTestId("selected-count")).toContainText("10/11");
  await expect(row(page, 4)).toContainText("2 / 8");
  await expect(row(page, 4)).toContainText("INJURED");
  await expect(toggle(page, 4)).toHaveCount(0);

  await switchView(page, "grid");
  await expect(tile(page, 4)).toHaveAttribute("aria-label", /Injured, 2 of 8 plays/);
  await expect(tile(page, 4)).not.toHaveAttribute("aria-pressed", /.*/);
});

test("Activating a late player from the Grid makes them selectable", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page, { beforeReview: (p) => setPregameStatus(p, 14, "Late") });
  await switchView(page, "grid");
  await expect(tile(page, 14)).toContainText("LATE");
  await tile(page, 14).click();
  await page.getByRole("button", { name: "Activate player" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Activate player" }).click();
  await expect(tile(page, 14)).toHaveAttribute("aria-pressed", "false");
  await tile(page, 14).click();
  await expect(tile(page, 14)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selected-count")).toContainText("1/11");
});
