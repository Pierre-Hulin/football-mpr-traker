import { expect, test, type Page } from "@playwright/test";
import { createTeamWithRoster, range, startGame } from "./helpers";

const WIDTHS = [320, 375, 390, 430];

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openGameDetails(page: Page) {
  await createTeamWithRoster(page);
  await page.getByRole("link", { name: "Start Game" }).click();
  await page.getByTestId("continue-team").click();
  await expect(page.getByLabel("Date")).toBeVisible();
}

async function addPresets(page: Page, names: [type: string, name: string][]) {
  const teamPath = new URL(page.url()).pathname.replace(/\/roster$/, "");
  for (const [type, name] of names) {
    await page.goto(`${teamPath}/presets/new`);
    await page.getByLabel("Type").selectOption(type);
    await page.getByLabel("Name").fill(name);
    for (const j of range(1, 11)) await page.getByRole("checkbox", { name: new RegExp(`^#${j} `) }).click();
    await page.getByTestId("save-preset").click();
    await expect(page).toHaveURL(/\/presets$/);
  }
  await page.goto(`${teamPath}/roster`);
}

test.describe("date field", () => {
  for (const width of WIDTHS) {
    test(`fits its column and aligns with neighbouring fields at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openGameDetails(page);
      const date = (await page.getByLabel("Date").boundingBox())!;
      const opponent = (await page.getByLabel("Opponent / game label").boundingBox())!;
      const deadline = (await page.getByLabel("MPR deadline").boundingBox())!;
      for (const other of [opponent, deadline]) {
        expect(Math.abs(date.x - other.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(date.x + date.width - (other.x + other.width))).toBeLessThanOrEqual(1);
      }
      expect(date.x + date.width).toBeLessThanOrEqual(width);
      await noHorizontalOverflow(page);
    });
  }

  test("native date value still works and persists", async ({ page }) => {
    await openGameDetails(page);
    const date = page.getByLabel("Date");
    await expect(date).toHaveAttribute("type", "date");
    await date.fill("2026-10-17");
    await page.getByTestId("next-availability").click();
    await expect(page.getByTestId("availability-summary")).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel("Date")).toHaveValue("2026-10-17");
  });
});

test.describe("live toolbar", () => {
  test("presets scroll beside fixed Clear/view buttons without sliding under them", async ({ page }) => {
    test.setTimeout(120_000);
    await createTeamWithRoster(page);
    await addPresets(page, [
      ["offense", "Offense Soft"],
      ["defense", "Defense"],
      ["kickoff", "Kickoff"],
      ["kick_return", "Kick Return Hands"],
      ["punt", "Punt"],
      ["punt_return", "Punt Return"],
    ]);
    await startGame(page);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 740 });
      await noHorizontalOverflow(page);
      const scroller = page.getByTestId("preset-scroll");
      const fixed = (await page.getByTestId("toolbar-fixed").boundingBox())!;
      const scrollBox = (await scroller.boundingBox())!;
      // The scrolling region ends where the fixed group begins: presets are clipped there, never drawn under it.
      expect(scrollBox.x + scrollBox.width).toBeLessThanOrEqual(fixed.x + 0.5);
      expect(await scroller.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
      expect(fixed.x + fixed.width).toBeLessThanOrEqual(width);
      for (const id of ["clear-lineup", "view-toggle"]) {
        const b = (await page.getByTestId(id).boundingBox())!;
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(Math.abs(b.width - b.height)).toBeLessThanOrEqual(1);
      }
    }

    // Overflow is signalled by an edge fade that follows the scroll position.
    await page.setViewportSize({ width: 375, height: 740 });
    const scroller = page.getByTestId("preset-scroll");
    await expect(scroller).toHaveClass(/fade-right/);
    await expect(scroller).not.toHaveClass(/fade-left/);
    await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(scroller).toHaveClass(/fade-left/);
    await expect(scroller).not.toHaveClass(/fade-right/);

    // A preset that was scrolled into view still applies.
    await page.getByRole("button", { name: "Load Punt Return preset" }).click();
    await expect(page.locator(".hdr-count")).toContainText("11/11");
  });

  test("eraser Clear button: accessible, disabled when empty, clears and restores", async ({ page }) => {
    await createTeamWithRoster(page);
    await startGame(page);
    const clear = page.getByRole("button", { name: "Clear field selection (mark everyone out)" });
    await expect(clear).toBeDisabled();
    await expect(clear.locator("svg")).toHaveCount(1);
    for (const j of range(1, 11)) await page.locator(`[data-testid=player-row][data-jersey="${j}"] [data-testid=toggle]`).click();
    await expect(page.locator(".hdr-count")).toContainText("11/11");
    await expect(clear).toBeEnabled();
    await clear.click();
    await expect(page.locator(".hdr-count")).toContainText("0/11");
    await expect(clear).toBeDisabled();
    await page.getByTestId("toast").getByRole("button", { name: "UNDO" }).click();
    await expect(page.locator(".hdr-count")).toContainText("11/11");

    // Works the same from Grid view.
    await page.getByTestId("view-toggle").click();
    await expect(page.getByTestId("roster-grid")).toBeVisible();
    await clear.click();
    await expect(page.locator(".hdr-count")).toContainText("0/11");
    await page.getByTestId("restore-lineup").click();
    await expect(page.locator(".hdr-count")).toContainText("11/11");
  });
});
