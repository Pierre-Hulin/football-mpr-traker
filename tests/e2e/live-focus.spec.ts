import { expect, test, type Page } from "@playwright/test";
import { createTeamWithRoster, range, startGame } from "./helpers";

const tile = (page: Page, jersey: number) => page.locator(`[data-testid=player-tile][data-jersey="${jersey}"] button`);
const tiles = (page: Page) => page.locator("[data-testid=player-tile]");
const shownJerseys = async (page: Page) =>
  (await tiles(page).evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-jersey"))))) as number[];

async function markPregame(page: Page, jersey: number, status: string) {
  await page.locator(`[data-testid=status-row][data-jersey="${jersey}"] [data-testid=status-scrubber]`).click();
  await page.getByRole("radio", { name: new RegExp(`^${status}`) }).click();
}

async function toGrid(page: Page) {
  await page.getByTestId("view-toggle").click();
  await expect(page.getByTestId("roster-grid")).toBeVisible();
}

async function selectTiles(page: Page, jerseys: number[]) {
  for (const j of jerseys) await tile(page, j).click();
}

async function recordAndWait(page: Page, next: number) {
  await page.getByTestId("record").click();
  await expect(page.getByTestId("next-play")).toHaveText(String(next));
}

const filterAll = (page: Page) => page.getByTestId("filter-all");
const filterFocus = (page: Page) => page.getByTestId("filter-focus");

test.describe("All / Focus modes", () => {
  test("All is default; Focus hides unavailable and satisfied players unless selected; counts update", async ({ page }) => {
    await createTeamWithRoster(page);
    await startGame(page, {
      requiredPlays: 2,
      beforeReview: async (p) => {
        await markPregame(p, 13, "Late");
        await markPregame(p, 14, "Absent");
      },
    });
    await toGrid(page);

    // Default: All, everyone visible, ascending jersey order.
    await expect(filterAll(page)).toHaveAttribute("aria-checked", "true");
    await expect(filterAll(page)).toHaveText("All (14)");
    await expect(filterFocus(page)).toHaveText("Focus (12)");
    expect(await shownJerseys(page)).toEqual(range(1, 14));

    await filterFocus(page).click();
    expect(await shownJerseys(page)).toEqual(range(1, 12));
    await filterAll(page).click();

    // 1–11 reach the minimum while selected: they stay in Focus.
    await selectTiles(page, range(1, 11));
    await recordAndWait(page, 2);
    await recordAndWait(page, 3);
    await expect(tile(page, 1)).toContainText("2/2");
    await filterFocus(page).click();
    await expect(filterFocus(page)).toHaveText("Focus (12)");
    expect(await shownJerseys(page)).toEqual(range(1, 12));
    await expect(page.getByTestId("selected-count")).toContainText("11/11");

    // Deselecting a satisfied player in Focus keeps the tile in place (no reflow under the finger)…
    await tile(page, 1).click();
    await expect(tile(page, 1)).toHaveAttribute("aria-pressed", "false");
    expect(await shownJerseys(page)).toEqual(range(1, 12));
    // …until the mode is switched; selection survives switching both ways.
    await filterAll(page).click();
    await filterFocus(page).click();
    expect(await shownJerseys(page)).toEqual(range(2, 12));
    await expect(filterFocus(page)).toHaveText("Focus (11)");
    await expect(page.getByTestId("selected-count")).toContainText("10/11");
    await filterAll(page).click();
    await expect(tile(page, 1)).toHaveAttribute("aria-pressed", "false");
    await expect(tile(page, 5)).toHaveAttribute("aria-pressed", "true");

    // Undo play 3: #1 is short again, so it reappears in Focus.
    await filterFocus(page).click();
    await page.getByTestId("undo-last").click();
    await expect(page.getByTestId("next-play")).toHaveText("2");
    await expect(tile(page, 1)).toContainText("1/2");
    expect(await shownJerseys(page)).toEqual(range(1, 12));
    await expect(filterFocus(page)).toHaveText("Focus (12)");

    // Availability change: activating late #13 adds them to Focus automatically.
    await filterAll(page).click();
    await tile(page, 13).click();
    await page.getByRole("button", { name: "Activate player" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Activate player" }).click();
    await expect(filterFocus(page)).toHaveText("Focus (13)");
    await filterFocus(page).click();
    expect(await shownJerseys(page)).toEqual(range(1, 13));

    // Injuring a selected player removes them from the lineup and from Focus.
    await filterAll(page).click();
    await page.getByTestId("view-toggle").click();
    await page.locator('[data-testid=player-row][data-jersey="5"] .prow-main').click();
    await page.getByRole("button", { name: "Mark injured" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Mark injured" }).click();
    await filterFocus(page).click();
    await expect(page.locator('[data-testid=player-row][data-jersey="5"]')).toHaveCount(0);
    await expect(filterFocus(page)).toHaveText("Focus (12)");
  });

  test("empty Focus state keeps the toggle usable", async ({ page }) => {
    await createTeamWithRoster(page);
    await startGame(page, { requiredPlays: 0 });
    await expect(filterFocus(page)).toHaveText("Focus (0)");
    await filterFocus(page).click();
    await expect(page.getByTestId("focus-empty")).toContainText("No players need attention");
    await expect(filterAll(page)).toBeVisible();
    await page.getByRole("button", { name: "Show all players" }).click();
    await expect(filterAll(page)).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("[data-testid=player-row]")).toHaveCount(14);
  });

  test("Focus mode survives navigation within the session", async ({ page }) => {
    await createTeamWithRoster(page);
    await startGame(page);
    await filterFocus(page).click();
    await page.getByRole("button", { name: "Game menu" }).click();
    await page.getByTestId("manage-players").click();
    await page.getByRole("link", { name: "Back" }).click();
    await expect(filterFocus(page)).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("Record Play", () => {
  test("red button, single lineup-count indicator, success feedback and status summary", async ({ page }) => {
    await createTeamWithRoster(page);
    await startGame(page, { requiredPlays: 2 });
    const record = page.getByTestId("record");

    await expect(record).toHaveText("RECORD PLAY");
    expect(await record.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(211, 47, 47)");
    expect(await record.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");

    // The header badge is the single lineup-count indicator; no duplicate warning by the button.
    const badge = page.locator(".hdr-count");
    await expect(badge).toContainText("0/11");
    await expect(badge).toContainText(/too few/i);
    await expect(badge).toHaveClass(/under/);
    await expect(page.getByTestId("lineup-warning")).toHaveCount(0);
    await page.locator('[data-testid=player-row] [data-testid=toggle]').first().click();
    for (const j of range(2, 10)) await page.locator(`[data-testid=player-row][data-jersey="${j}"] [data-testid=toggle]`).click();
    await expect(badge).toContainText("10/11");
    await expect(badge).toHaveAttribute("aria-label", "10 of 11 players on field, too few");
    await expect(record).toHaveText("RECORD PLAY");

    // Existing validation unchanged: wrong count still asks for confirmation.
    await record.click();
    await expect(page.getByRole("alertdialog")).toContainText("Record play with 10 players?");
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.locator('[data-testid=player-row][data-jersey="11"] [data-testid=toggle]').click();
    await expect(badge).toContainText("11/11");
    await expect(badge).toContainText(/on field/i);
    await expect(badge).toHaveClass(/exact/);
    // Over-selection is flagged the same way; deselect back to 11.
    await page.locator('[data-testid=player-row][data-jersey="12"] [data-testid=toggle]').click();
    await expect(badge).toContainText("12/11");
    await expect(badge).toContainText(/too many/i);
    await page.locator('[data-testid=player-row][data-jersey="12"] [data-testid=toggle]').click();
    await expect(badge).toContainText("11/11");

    // The bottom summary carries MPR stats only (no duplicate "on field").
    await expect(page.getByTestId("game-summary")).not.toContainText("on field");
    await expect(page.getByTestId("game-summary")).toContainText("14 need plays");
    await record.click();
    await expect(record).toHaveText("✓ PLAY 1 RECORDED");
    await expect(record).toHaveText("RECORD PLAY", { timeout: 3000 });
    await expect(page.getByTestId("next-play")).toHaveText("2");
    await record.click();
    await expect(page.getByTestId("next-play")).toHaveText("3");
    await expect(page.getByTestId("game-summary")).toContainText("3 need plays");
    await expect(page.getByTestId("game-summary")).toContainText("11 met");
    await expect(page.getByTestId("game-summary")).toContainText("0 unavailable");

    // Undo from the persistent chip, without leaving the screen; MPR math reverts.
    await expect(page.getByTestId("undo-last")).toHaveText("↶ UNDO 2");
    await page.getByTestId("undo-last").click();
    await expect(page.getByTestId("next-play")).toHaveText("2");
    await expect(page.locator('[data-testid=player-row][data-jersey="1"]')).toContainText("1 / 2");
    await expect(page.getByTestId("game-summary")).toContainText("14 need plays");
    await expect(page.getByTestId("undo-last")).toHaveText("↶ UNDO 1");
  });

  test("double taps and repeated events record exactly one play; rapid legitimate plays all record", async ({ page }) => {
    await createTeamWithRoster(page);
    await startGame(page, { requiredPlays: 20 });
    for (const j of range(1, 11)) await page.locator(`[data-testid=player-row][data-jersey="${j}"] [data-testid=toggle]`).click();

    // Three synchronous clicks (double/triple tap, repeated handlers).
    await page.evaluate(() => {
      const b = document.querySelector<HTMLButtonElement>("[data-testid=record]")!;
      b.click();
      b.click();
      b.click();
    });
    await expect(page.getByTestId("next-play")).toHaveText("2");

    // A second tap landing just after the first one succeeds is also absorbed.
    await page.waitForTimeout(600); // let the previous guard window lapse
    await page.evaluate(async () => {
      const b = document.querySelector<HTMLButtonElement>("[data-testid=record]")!;
      const next = () => document.querySelector("[data-testid=next-play]")!.textContent;
      b.click();
      while (next() !== "3") await new Promise((r) => setTimeout(r, 2));
      b.click();
    });
    await page.waitForTimeout(800);
    await expect(page.getByTestId("next-play")).toHaveText("3");
    await expect(page.locator('[data-testid=player-row][data-jersey="1"]')).toContainText("2 / 20");

    // Rapid, legitimate consecutive plays.
    for (let n = 4; n <= 9; n++) await recordAndWait(page, n);
    await expect(page.locator('[data-testid=player-row][data-jersey="1"]')).toContainText("8 / 20");
    await page.getByRole("button", { name: "Game menu" }).click();
    await page.getByRole("link", { name: "Play history" }).click();
    await expect(page.getByTestId("history-row")).toHaveCount(8);
  });

  test("storage failure is reported, nothing is recorded, and retry works", async ({ page }) => {
    await createTeamWithRoster(page);
    await startGame(page);
    for (const j of range(1, 11)) await page.locator(`[data-testid=player-row][data-jersey="${j}"] [data-testid=toggle]`).click();
    await recordAndWait(page, 2);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const w = window as unknown as { __restore: () => void };
      const proto = IDBObjectStore.prototype;
      const add = proto.add;
      proto.add = function (this: IDBObjectStore, ...args: Parameters<typeof add>) {
        if (this.name === "plays") throw new DOMException("Simulated quota", "QuotaExceededError");
        return add.apply(this, args);
      };
      w.__restore = () => {
        proto.add = add;
      };
    });
    await page.getByTestId("record").click();
    await expect(page.getByRole("alertdialog")).toContainText("Play was NOT saved.");
    await expect(page.getByTestId("record")).toHaveText("✕ NOT SAVED");
    await expect(page.getByTestId("next-play")).toHaveText("2");

    await page.evaluate(() => (window as unknown as { __restore: () => void }).__restore());
    await page.getByRole("button", { name: "TRY AGAIN" }).click();
    await expect(page.getByTestId("next-play")).toHaveText("3");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.locator('[data-testid=player-row][data-jersey="1"]')).toContainText("2 / 8");
  });

  test("narrow iPhone layout: no overflow, controls in view, toast clear of Record Play", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await createTeamWithRoster(page);
    await startGame(page);
    await toGrid(page);
    for (const j of range(1, 10)) await tile(page, j).click();
    await expect(page.locator(".hdr-count")).toContainText("10/11");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const id of ["record", "record-more", "filter-all", "filter-focus", "game-summary", "clear-lineup", "view-toggle"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.y + box.height).toBeLessThanOrEqual(568);
    }
    for (const id of ["record", "filter-all", "filter-focus", "clear-lineup", "view-toggle"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }

    // A toast (e.g. after Clear) sits above the whole control block.
    await page.getByRole("button", { name: /Clear field selection/ }).click();
    await expect(page.getByTestId("toast")).toBeVisible();
    await page.waitForTimeout(300); // let the slide-in animation finish
    const toast = (await page.getByTestId("toast").boundingBox())!;
    const status = (await page.locator(".record-bar").boundingBox())!;
    expect(toast.y + toast.height).toBeLessThanOrEqual(status.y + 1);

    // Accessible names / states for the mode control.
    await expect(page.getByRole("radiogroup", { name: "Show players" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^All: 14 players/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: /^Focus: \d+ players/ })).toHaveAttribute("aria-checked", "false");
  });
});
