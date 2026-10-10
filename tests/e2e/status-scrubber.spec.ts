import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { createTeamWithRoster } from "./helpers";

/**
 * Real touch input via CDP so Chrome's own touch-action / scroll arbitration
 * runs exactly as on a phone (synthetic pointer events would bypass it).
 */
class Finger {
  constructor(private cdp: CDPSession, private page: Page) {}
  private x = 0;
  private y = 0;
  static async create(page: Page) {
    return new Finger(await page.context().newCDPSession(page), page);
  }
  async down(x: number, y: number) {
    this.x = x;
    this.y = y;
    await this.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  }
  async move(dx: number, dy: number, steps = 12) {
    const sx = this.x;
    const sy = this.y;
    for (let i = 1; i <= steps; i++) {
      this.x = sx + (dx * i) / steps;
      this.y = sy + (dy * i) / steps;
      await this.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: this.x, y: this.y }] });
      await this.page.waitForTimeout(16);
    }
  }
  async up() {
    await this.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await this.page.waitForTimeout(50);
  }
  async drag(x: number, y: number, dx: number, dy: number) {
    await this.down(x, y);
    await this.move(dx, dy);
    await this.up();
  }
}

const scrubber = (page: Page, jersey: number) =>
  page.locator(`[data-testid=status-row][data-jersey="${jersey}"] [data-testid=status-scrubber]`);
const nameButton = (page: Page, jersey: number) =>
  page.locator(`[data-testid=status-row][data-jersey="${jersey}"] .status-row-main`);

async function center(page: Page, jersey: number, part: "scrubber" | "name" = "scrubber") {
  const loc = part === "scrubber" ? scrubber(page, jersey) : nameButton(page, jersey);
  await loc.scrollIntoViewIfNeeded();
  const box = (await loc.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function openAvailability(page: Page) {
  await page.setViewportSize({ width: 390, height: 640 });
  await createTeamWithRoster(page);
  await page.getByRole("link", { name: "Start Game" }).click();
  await page.getByTestId("continue-team").click();
  await page.getByLabel("Opponent / game label").fill("Wildcats");
  await page.getByTestId("next-availability").click();
  await expect(page.getByTestId("availability-summary")).toHaveText("14 of 14 active");
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

/** Resolve once the page has stopped scrolling (touch flings keep going after release). */
const scrollSettled = (page: Page) =>
  page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    let last = window.scrollY;
    let still = 0;
    while (still < 6) {
      await frame();
      still = window.scrollY === last ? still + 1 : 0;
      last = window.scrollY;
    }
    return last;
  });

/**
 * Scroll so the scrubber's centre sits at `viewportY`, and report how far the
 * page can still scroll in the direction a finger moving by `dy` would scroll it.
 */
async function placeScrubber(page: Page, jersey: number, viewportY: number, dy: number) {
  await scrubber(page, jersey).evaluate((el, vy) => {
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - vy, behavior: "instant" });
  }, viewportY);
  const y = await scrollSettled(page);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  return dy < 0 ? max - y : y; // finger up scrolls the page down, and vice versa
}

test.describe("status scrubber", () => {
  test("one drag-release changes Active → Injured, with live preview and snapping", async ({ page }) => {
    await openAvailability(page);
    const finger = await Finger.create(page);
    const p = await center(page, 3);

    await finger.down(p.x, p.y);
    await finger.move(40, 2); // ~1 detent past the engage threshold
    await expect(page.getByTestId("scrub-bubble")).toBeVisible();
    await expect(page.getByTestId("scrub-bubble")).toContainText("ABSENT");
    await finger.move(56, -3); // two more detents
    await expect(page.getByTestId("scrub-bubble").locator(".sb-current")).toHaveText("INJURED");
    await expect(scrubber(page, 3)).toHaveAttribute("data-status", "injured");
    await finger.up();

    await expect(page.getByTestId("scrub-bubble")).toHaveCount(0);
    await expect(scrubber(page, 3)).toHaveAttribute("data-status", "injured");
    await expect(page.getByTestId("availability-summary")).toHaveText("13 of 14 active");
    // The release must not also be treated as a tap that opens the picker.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Persisted, not just visual.
    await page.reload();
    await expect(scrubber(page, 3)).toHaveAttribute("data-status", "injured");
  });

  test("clamps at both ends without wrapping", async ({ page }) => {
    await openAvailability(page);
    const finger = await Finger.create(page);
    let p = await center(page, 5);
    await finger.drag(p.x, p.y, 400, 0);
    await expect(scrubber(page, 5)).toHaveAttribute("data-status", "ineligible");
    p = await center(page, 5);
    await finger.drag(p.x, p.y, 40, 0); // already at the end: stays put
    await expect(scrubber(page, 5)).toHaveAttribute("data-status", "ineligible");
    p = await center(page, 5);
    await finger.drag(p.x, p.y, -400, 0);
    await expect(scrubber(page, 5)).toHaveAttribute("data-status", "active");
    await expect(page.getByTestId("availability-summary")).toHaveText("14 of 14 active");
  });

  test("small horizontal jitter below the threshold changes nothing", async ({ page }) => {
    await openAvailability(page);
    const finger = await Finger.create(page);
    const p = await center(page, 4);
    await finger.down(p.x, p.y);
    await finger.move(8, 0);
    await expect(page.getByTestId("scrub-bubble")).toHaveCount(0);
    await finger.up();
    await expect(scrubber(page, 4)).toHaveAttribute("data-status", "active");
  });

  test("vertical scroll starting on the player name scrolls normally", async ({ page }) => {
    await openAvailability(page);
    const finger = await Finger.create(page);
    const p = await center(page, 6, "name");
    const before = await scrollY(page);
    await finger.drag(p.x, p.y, 0, -260);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(before + 100);
    await expect(page.getByTestId("availability-summary")).toHaveText("14 of 14 active");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a mostly-vertical gesture starting on the status control scrolls and never changes status", async ({ page }) => {
    await openAvailability(page);
    const finger = await Finger.create(page);
    const viewport = page.viewportSize()!;
    for (const [dx, dy] of [
      [0, -240],
      [25, -220], // imperfect, slightly diagonal thumb scroll
      [-30, -200],
      [40, 120],
    ]) {
      // Each gesture starts from a known position with room to scroll in its
      // direction. (Chaining them from wherever the previous fling stopped made
      // the result depend on fling distance, which differs between platforms:
      // on Linux CI the third gesture started at the bottom of the page.)
      const room = await placeScrubber(page, 7, dy < 0 ? viewport.height - 100 : 100, dy);
      expect(room, "page must be able to scroll in the gesture's direction").toBeGreaterThan(100);
      const p = await center(page, 7);
      const before = await scrollY(page);
      await finger.drag(p.x, p.y, dx, dy);
      await expect.poll(async () => Math.abs((await scrollY(page)) - before)).toBeGreaterThan(40);
      await scrollSettled(page);
      await expect(page.getByTestId("scrub-bubble")).toHaveCount(0);
      await expect(scrubber(page, 7)).toHaveAttribute("data-status", "active");
    }
    await expect(page.getByTestId("availability-summary")).toHaveText("14 of 14 active");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("tap still opens the explicit picker; keyboard arrows step statuses", async ({ page }) => {
    await openAvailability(page);
    await scrubber(page, 8).tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("radio", { name: /^Late/ }).click();
    await expect(scrubber(page, 8)).toHaveAttribute("data-status", "late");

    await scrubber(page, 9).focus();
    await page.keyboard.press("ArrowRight");
    await expect(scrubber(page, 9)).toHaveAttribute("data-status", "absent");
    await expect(scrubber(page, 9)).toHaveAccessibleName(/Status for #9 Player I: Absent/);
    await page.keyboard.press("ArrowLeft");
    await expect(scrubber(page, 9)).toHaveAttribute("data-status", "active");

    // Reset all still works alongside the scrubber.
    await page.getByRole("button", { name: "Reset all to Active" }).click();
    await expect(page.getByTestId("availability-summary")).toHaveText("14 of 14 active");
  });
});
