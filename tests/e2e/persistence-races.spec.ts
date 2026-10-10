import { expect, test, type Page } from "@playwright/test";
import { createTeamWithRoster, expectLineupSaved, range, row, startGame, toggle } from "./helpers";

/**
 * Regression tests for races between the optimistic live UI and IndexedDB.
 * They drive the page from inside the browser so the interactions land as fast
 * as a real thumb can (Playwright's own clicks are slower and vary per machine,
 * which made these races CI-only).
 */

/**
 * Tap toggles back to back, one event per task like real input (React renders
 * between discrete events), with no delay between them: far faster than a thumb.
 */
const burstToggle = (page: Page, jerseys: number[]) =>
  page.evaluate(async (js) => {
    for (const j of js) {
      document.querySelector<HTMLButtonElement>(`[data-testid=player-row][data-jersey="${j}"] [data-testid=toggle]`)!.click();
      await new Promise((r) => setTimeout(r, 0));
    }
  }, jerseys);

const persistedLineupSize = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("mpr-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction("currentLineupMembers").objectStore("currentLineupMembers").count();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result);
          };
        };
      }),
  );

test("a burst of lineup taps is persisted in full, and the UI reports when it is", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await burstToggle(page, range(1, 11));
  await expect(page.getByTestId("selected-count")).toContainText("11/11");
  await expectLineupSaved(page);
  expect(await persistedLineupSize(page)).toBe(11);
  await page.reload();
  await expect(page.getByTestId("selected-count")).toContainText("11/11");

  // Mixed IN/OUT churn on the same players collapses to the last choice:
  // #1 IN→OUT→IN→OUT, #12 OUT→IN→OUT→IN, #2 IN→OUT.
  await burstToggle(page, [1, 1, 1, 12, 12, 12, 2]);
  await expect(page.getByTestId("selected-count")).toContainText("10/11");
  await expectLineupSaved(page);
  await page.reload();
  await expect(toggle(page, 1)).toHaveAttribute("aria-pressed", "false");
  await expect(toggle(page, 2)).toHaveAttribute("aria-pressed", "false");
  await expect(toggle(page, 12)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selected-count")).toContainText("10/11");
});

test("Record immediately after a burst of taps includes every tapped player", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  await page.evaluate(() => {
    for (let j = 1; j <= 11; j++)
      document.querySelector<HTMLButtonElement>(`[data-testid=player-row][data-jersey="${j}"] [data-testid=toggle]`)!.click();
    document.querySelector<HTMLButtonElement>("[data-testid=record]")!.click();
  });
  await expect(page.getByTestId("next-play")).toHaveText("2");
  await expect(page.getByRole("alertdialog")).toHaveCount(0); // no "only N players" warning
  await expect(row(page, 11)).toContainText("1 / 8");
});

test("a non-counting play from the Record menu right after a regular play is recorded, not swallowed", async ({ page }) => {
  await createTeamWithRoster(page);
  await startGame(page);
  for (const j of range(1, 11)) await toggle(page, j).click();
  await expectLineupSaved(page);
  // Record a regular play, then complete the whole menu flow inside the
  // double-tap guard window that follows it.
  const elapsed = await page.evaluate(async () => {
    const q = <T extends HTMLElement>(sel: string, text?: string) =>
      [...document.querySelectorAll<T>(sel)].find((el) => text === undefined || el.textContent?.includes(text));
    const until = async <T,>(f: () => T | undefined) => {
      let v: T | undefined;
      while (!(v = f())) await new Promise((r) => requestAnimationFrame(r));
      return v;
    };
    q<HTMLButtonElement>("[data-testid=record]")!.click();
    await until(() => (q("[data-testid=next-play]")?.textContent === "2" ? true : undefined));
    const t0 = performance.now();
    q<HTMLButtonElement>("[data-testid=record-more]")!.click();
    (await until(() => q<HTMLButtonElement>("[data-testid=non-counting]"))).click();
    (await until(() => q<HTMLButtonElement>("[role=radio]", "Accepted penalty"))).click();
    (await until(() => q<HTMLButtonElement>("button", "Record non-counting"))).click();
    return performance.now() - t0;
  });
  expect(elapsed).toBeLessThan(400);
  await expect(page.getByTestId("next-play")).toHaveText("3");
  await expect(row(page, 1)).toContainText("1 / 8");
});
