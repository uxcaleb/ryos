import { chromium } from "playwright";

/**
 * Records a short MP4 showing the desktop BG visualizer while iPod playback runs.
 *
 * Notes:
 * - This script makes a best effort to drive the UI without hardcoding fragile selectors.
 * - If UI changes break it, it still records a short session for debugging.
 */

const BASE_URL = process.env.RECORD_BASE_URL || "http://127.0.0.1:5174/";
const OUT_DIR = process.env.RECORD_OUT_DIR || "artifacts";
const DURATION_MS = Number(process.env.RECORD_DURATION_MS || 15000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function bestEffortClick(page, candidates) {
  for (const c of candidates) {
    try {
      if (c.role) {
        const el = page.getByRole(c.role, c.opts || {});
        if (await el.first().isVisible({ timeout: 500 })) {
          await el.first().click({ timeout: 1500 });
          return true;
        }
      } else if (c.text) {
        const el = page.getByText(c.text, { exact: c.exact ?? false });
        if (await el.first().isVisible({ timeout: 500 })) {
          await el.first().click({ timeout: 1500 });
          return true;
        }
      } else if (c.selector) {
        const el = page.locator(c.selector);
        if (await el.first().isVisible({ timeout: 500 })) {
          await el.first().click({ timeout: 1500 });
          return true;
        }
      }
    } catch {
      // ignore and try next candidate
    }
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Try to open iPod from the desktop by double clicking the icon.
  // On some themes it may be a desktop shortcut; we still try "iPod" text.
  const ipodIcon = page.getByText("iPod", { exact: false }).first();
  try {
    await ipodIcon.dblclick({ timeout: 2500 });
  } catch {
    // Fallback: try to open from Start menu / Apple menu if present.
    await bestEffortClick(page, [
      { text: "Start", exact: false },
      { selector: "[data-testid='apple-menu']" },
      { role: "button", opts: { name: /apple/i } },
    ]);
    await bestEffortClick(page, [
      { text: "iPod", exact: false },
      { role: "menuitem", opts: { name: /ipod/i } },
    ]);
  }

  // Give the app time to mount.
  await page.waitForTimeout(1500);

  // Start playback (best-effort). Try common control labels, then any "Play" text button.
  await bestEffortClick(page, [
    { role: "button", opts: { name: /play/i } },
    { text: "Play", exact: false },
    { selector: "button[aria-label*='Play' i]" },
  ]);

  // Let it run to show BG visualizer during playback.
  await sleep(DURATION_MS);

  // Close to flush the video to disk.
  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

