// Renders dev/invite-card.html to public/art/invite-card.jpg (the link
// preview image). Needs Playwright: `npx playwright install chromium` once
// if it isn't already available.
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "invite-card.html"));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const out = path.join(__dirname, "..", "public", "art", "invite-card.jpg");
  await page.screenshot({ path: out, type: "jpeg", quality: 86 });
  await browser.close();
  console.log("wrote", out);
})();
