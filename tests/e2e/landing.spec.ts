import { expect, test, type Page } from "@playwright/test";
import { createTeamWithRoster, startGame } from "./helpers";

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const WIDTHS = [320, 375, 390, 430];

const prompt = (page: Page) => page.getByTestId("install-prompt");

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Simulate Chrome/Android's beforeinstallprompt after the app has loaded. */
async function fakeNativeInstallPrompt(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __prompted: number };
    w.__prompted = 0;
    window.addEventListener("load", () =>
      setTimeout(() => {
        const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: string }>;
        };
        e.prompt = async () => {
          w.__prompted++;
        };
        e.userChoice = Promise.resolve({ outcome: "accepted" });
        window.dispatchEvent(e);
      }, 200),
    );
  });
}

test.describe("landing page", () => {
  test("themed hero, legible text, build label, no overflow at iPhone widths", async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Minimum Play Tracker" })).toBeVisible();
      await expect(page.getByTestId("create-team")).toBeVisible();
      await noHorizontalOverflow(page);
    }
    const hero = page.locator(".home-hero");
    // The field artwork is inlined into the (precached) CSS, so it is available offline with no extra request.
    const fieldArt = /linear-gradient\(.*\), url\("data:image\/svg\+xml/;
    expect(await hero.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(fieldArt);
    expect(await page.locator(".home").evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(fieldArt);
    expect(await page.locator(".home-hero h1").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
    await expect(page.getByTestId("app-version")).toHaveText(/^v\d+\.\d+\.\d+ · \S+/);

  });

  test("existing flows still start from the landing page", async ({ page }) => {
    await createTeamWithRoster(page);
    await startGame(page);
    await page.getByRole("button", { name: "Game menu" }).click();
    await page.getByRole("link", { name: /^Home/ }).click();
    await expect(page.getByTestId("resume")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.getByTestId("resume").click();
    await expect(page).toHaveURL(/\/live$/);
  });
});

test.describe("install prompt on iPhone", () => {
  test.use({ userAgent: IPHONE_SAFARI_UA, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("compact bar expands to Add to Home Screen steps and never covers actions", async ({ page }) => {
    await page.goto("/");
    await expect(prompt(page)).toBeVisible();
    await expect(prompt(page)).toHaveAttribute("data-mode", "ios");
    await expect(prompt(page)).toContainText("Install MPR Tracker");
    await expect(page.getByTestId("install-steps")).toHaveCount(0);

    await page.getByTestId("install-howto").click();
    const steps = page.getByTestId("install-steps").locator("li");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText("Share in Safari's toolbar");
    await expect(steps.nth(1)).toContainText("Add to Home Screen");
    await expect(steps.nth(2)).toContainText("Add");
    await expect(page.getByTestId("install-howto")).toHaveAttribute("aria-expanded", "true");
    await page.getByTestId("install-howto").click();
    await expect(page.getByTestId("install-steps")).toHaveCount(0);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 760 });
      await noHorizontalOverflow(page);
      const card = (await prompt(page).boundingBox())!;
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(width);
      // The page reserves room for the bar, so every action can be scrolled clear of it.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const importBtn = (await page.getByRole("link", { name: "IMPORT BACKUP" }).boundingBox())!;
      expect(importBtn.y + importBtn.height).toBeLessThanOrEqual(card.y);
    }

    // Primary action remains usable with the bar showing.
    await page.getByTestId("create-team").click();
    await expect(page).toHaveURL(/\/teams\/new$/);
  });

  test("dismissal is remembered, then the bar returns after the snooze period", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("install-later").click();
    await expect(prompt(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Minimum Play Tracker" })).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);

    await page.evaluate(() => localStorage.setItem("mpr-install-dismissed-at", String(Date.now() - 15 * 86_400_000)));
    await page.reload();
    await expect(prompt(page)).toBeVisible();
    await page.getByRole("button", { name: "Dismiss install suggestion" }).click();
    await expect(prompt(page)).toHaveCount(0);
  });

  test("not shown during a game in progress", async ({ page }) => {
    await createTeamWithRoster(page);
    await startGame(page);
    await page.getByRole("button", { name: "Game menu" }).click();
    await page.getByRole("link", { name: /^Home/ }).click();
    await expect(page.getByTestId("resume")).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);
  });
});

test.describe("install prompt variants", () => {
  test.describe("Chrome on iPhone", () => {
    test.use({ userAgent: IPHONE_CHROME_UA, viewport: { width: 390, height: 844 } });
    test("points to Share next to the address bar", async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("install-howto").click();
      await expect(page.getByTestId("install-steps").locator("li").first()).toContainText("next to the address bar");
    });
  });

  test.describe("already installed on iPhone", () => {
    test.use({ userAgent: IPHONE_SAFARI_UA, viewport: { width: 390, height: 844 } });
    test("hidden when running as a Home Screen app", async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Minimum Play Tracker" })).toBeVisible();
      await page.waitForTimeout(500);
      await expect(prompt(page)).toHaveCount(0);
    });
  });

  test("Android/Chrome uses the native install prompt", async ({ page }) => {
    await fakeNativeInstallPrompt(page);
    await page.goto("/");
    await expect(prompt(page)).toBeVisible();
    await expect(prompt(page)).toHaveAttribute("data-mode", "native");
    await page.getByRole("button", { name: "Why?" }).click();
    await expect(prompt(page)).toContainText("Works with no signal on the sideline");
    await page.getByTestId("install-native").click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
    await expect(prompt(page)).toHaveCount(0);
    // Accepted install is remembered; a later visit does not nag.
    await page.reload();
    await page.waitForTimeout(600);
    await expect(prompt(page)).toHaveCount(0);
  });

  test("no prompt when the browser offers no install path", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Minimum Play Tracker" })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(prompt(page)).toHaveCount(0);
  });
});
