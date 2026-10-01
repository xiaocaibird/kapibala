// Developer mechanism check. Native browser chrome capture is optional and
// macOS-only; page/DOM assertions alone cannot prove that a cached icon cleared.
// PLAYWRIGHT_MODULE=<module> CAPTURE_BROWSER_CHROME=1 node scripts/verify-browser-attention-icon.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const output = resolve(
  process.env.EVIDENCE_DIR ?? ".runtime/browser-attention-icon",
);
const nativeCapture = process.env.CAPTURE_BROWSER_CHROME === "1";
if (nativeCapture) assert.equal(process.platform, "darwin");
await mkdir(output, { recursive: true });
const html = await readFile("apps/web/index.html", "utf8");
const icons = [...html.matchAll(/<link[^>]*rel="icon"[^>]*>/g)]
  .map((match) => match[0])
  .join("");
assert.ok(icons, "the application must supply a normal favicon");
const swiftPath = resolve(output, "capture-window.swift");
if (nativeCapture)
  await writeFile(
    swiftPath,
    `import CoreGraphics
let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
for window in windows {
  let title = window[kCGWindowName as String] as? String ?? ""
  if title.contains("Icon verification") {
    print(window[kCGWindowNumber as String] as! Int)
    break
  }
}
`,
  );

const vite = await createServer({
  configFile: false,
  root: "apps/web",
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [
    {
      name: "browser-icon-mechanism",
      configureServer(server) {
        server.middlewares.use("/icon-verification", (_request, response) => {
          response.setHeader("Content-Type", "text/html;charset=utf-8");
          response.end(`<!doctype html><html><head><title>Icon verification initial</title>${icons}</head>
<body><h1>Independent browser icon verification</h1><p>The native tab icon is the observation target.</p>
<script type="module">
import { ownBrowserAttention } from '/src/attention/browser.ts';
window.iconCheck = {ownBrowserAttention, first: ownBrowserAttention('Icon verification first'), icon: document.querySelector('link[rel~="icon"]')};
</script></body></html>`);
        });
      },
    },
  ],
});
let browser;
const observations = [];
try {
  await vite.listen();
  browser = await chromium.launch({
    headless: false,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
    args: ["--window-size=1100,750"],
  });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(vite.resolvedUrls.local[0] + "icon-verification");
  await page.waitForFunction(() => Boolean(window.iconCheck));
  const observe = async (name, title, pending) => {
    await page.waitForTimeout(800);
    const actual = await page.evaluate(() => ({
      title: document.title,
      icons: [...document.querySelectorAll('link[rel~="icon"]')].map(
        (link) => ({
          href: link.getAttribute("href"),
          type: link.getAttribute("type"),
          media: link.getAttribute("media"),
        }),
      ),
      sameNode:
        document.querySelector('link[rel~="icon"]') === window.iconCheck.icon,
    }));
    assert.equal(actual.title, title);
    assert.equal(actual.icons.length, 1);
    assert.equal(actual.sameNode, true);
    assert.equal(actual.icons[0].href.startsWith("data:"), pending);
    if (!pending) assert.equal(actual.icons[0].href, "/favicon.svg");
    let screenshot = null;
    if (nativeCapture) {
      const windowId = execFileSync("/usr/bin/swift", [swiftPath], {
        encoding: "utf8",
      }).trim();
      assert.match(windowId, /^\d+$/);
      screenshot = `${name}.png`;
      execFileSync("/usr/sbin/screencapture", [
        "-x",
        "-l",
        windowId,
        resolve(output, screenshot),
      ]);
    }
    observations.push({ name, ...actual, screenshot });
  };
  await observe("initial", "Icon verification first · Kapibala", false);
  await page.evaluate(() => window.iconCheck.first.update(true));
  await observe("pending", "[有更新] Icon verification first · Kapibala", true);
  await page.evaluate(() => window.iconCheck.first.update(false));
  await observe("confirmed", "Icon verification first · Kapibala", false);
  await page.evaluate(() => window.iconCheck.first.update(true));
  await observe(
    "pending-again",
    "[有更新] Icon verification first · Kapibala",
    true,
  );
  await page.evaluate(() => {
    const state = window.iconCheck;
    state.second = state.ownBrowserAttention("Icon verification second");
    // A late old-scope update or cleanup must not alter the new owner.
    state.first.update(true);
    state.first.dispose();
  });
  await observe("handoff", "Icon verification second · Kapibala", false);
  await page.evaluate(() => window.iconCheck.second.update(true));
  await observe(
    "new-owner-pending",
    "[有更新] Icon verification second · Kapibala",
    true,
  );
  await page.evaluate(() => {
    window.iconCheck.second.dispose();
    window.iconCheck.second.dispose();
    window.iconCheck.second.update(true);
  });
  await observe("disposed", "Icon verification initial", false);
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "observations.json"),
    JSON.stringify(
      {
        browser: browser.version(),
        nativeCapture,
        observations,
        errors,
        note: "DOM checks are automated; native tab screenshots require visual inspection. This isolated harness imports the actual attention implementation.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      checks: observations.length,
      nativeCapture,
      browser: browser.version(),
      output,
    }),
  );
} finally {
  try {
    await browser?.close();
  } finally {
    await vite.close();
  }
}
