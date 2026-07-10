// Real-browser e2e for the BUILT playground bundle — the class of bug jsdom
// can't see (the dual-React crash shipped past a green jsdom suite). Runs
// `vite preview` over dist/ and drives Chromium through the shell features
// that have each caught a real regression at least once this repo's life:
// mobile drawer, bottom sheet, theme flip + persistence, hash routing,
// viewport pinning, sticky chrome, and render integrity per tab.
//
// Plain script on the `playwright` library (no @playwright/test dep): run
// with `node e2e/playground.e2e.mjs` from examples/ after `npm run build`.
// Screenshots land in e2e/artifacts/ (CI uploads them for eyeballing).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PORT = 4179;
const BASE = `http://localhost:${PORT}/formstand/examples/`;
const ARTIFACTS = path.join(import.meta.dirname, "artifacts");

const failures = [];
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  failures.push(message);
};
const ok = (message) => console.log(`ok: ${message}`);

const waitForServer = async (url, tries = 50) => {
  for (const attempt of Array.from({ length: tries }, (_, i) => i)) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200 + attempt * 0));
  }
  throw new Error(`preview server never came up at ${url}`);
};

fs.mkdirSync(ARTIFACTS, { recursive: true });
const preview = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "preview", "--port", String(PORT)],
  { cwd: path.join(import.meta.dirname, ".."), stdio: "ignore", shell: true },
);

try {
  await waitForServer(BASE);
  const browser = await chromium.launch();

  // ---- mobile shell -------------------------------------------------------
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const pageErrors = [];
  phone.on("pageerror", (e) => pageErrors.push(String(e)));

  await phone.goto(BASE, { waitUntil: "networkidle" });
  if (!(await phone.locator(".topbar").isVisible())) {
    fail("mobile topbar not visible at 390px");
  }
  const closedX = (await phone.locator(".sidebar").boundingBox())?.x ?? 0;
  if (closedX >= 0) fail(`drawer should start off-canvas, x=${closedX}`);

  await phone.getByRole("button", { name: "open demo list" }).click();
  await phone.waitForTimeout(350);
  if ((await phone.locator(".sidebar").boundingBox())?.x !== 0) {
    fail("drawer did not slide in");
  }
  await phone
    .locator(".nav-tab .MuiTreeItem-content", { hasText: "Schema builder" })
    .first()
    .click();
  await phone.waitForTimeout(400);
  if (!phone.url().includes("#/schema-builder")) {
    fail(`hash route missing after drawer pick: ${phone.url()}`);
  }
  if (((await phone.locator(".sidebar").boundingBox())?.x ?? 0) >= 0) {
    fail("drawer should close after picking a demo");
  }
  ok("mobile drawer + hash routing");

  // Bottom sheet hugs the viewport; its Close button dismisses it.
  await phone.getByRole("button", { name: "View code" }).click();
  await phone.waitForTimeout(300);
  const sheet = await phone.locator(".demo-panel").boundingBox();
  const viewport = phone.viewportSize();
  if (
    sheet === null ||
    Math.abs(sheet.y + sheet.height - viewport.height) > 2
  ) {
    fail(`bottom sheet not pinned to viewport bottom (y=${sheet?.y})`);
  }
  await phone.screenshot({ path: path.join(ARTIFACTS, "mobile-sheet.png") });
  await phone.getByRole("button", { name: "Close" }).click();
  await phone.waitForTimeout(200);
  if ((await phone.locator(".demo-panel").count()) !== 0) {
    fail("sheet Close button did not dismiss the panel");
  }
  ok("bottom sheet open/close");

  // Viewport pinning: the widest tabs must not pan sideways.
  for (const route of ["#/schema-builder", "#/gen-mui", "#/perf", "#/basic"]) {
    await phone.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const metrics = await phone.evaluate(() => ({
      scrollW: document.scrollingElement.scrollWidth,
      clientW: document.scrollingElement.clientWidth,
    }));
    if (metrics.scrollW > metrics.clientW) {
      fail(`${route}: horizontal overflow ${metrics.scrollW}>${metrics.clientW}`);
    }
  }
  ok("no horizontal overflow on the widest tabs");

  // Theme: flip, body background changes, persists across reload.
  await phone.goto(BASE, { waitUntil: "networkidle" });
  const darkBg = await phone.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  await phone.getByRole("button", { name: "switch to light theme" }).click();
  // reduced motion → the background is final at once; a tick covers the
  // React commit.
  await phone.waitForTimeout(50);
  const lightBg = await phone.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  if (darkBg === lightBg) fail("theme toggle did not change body background");
  await phone.reload({ waitUntil: "networkidle" });
  const persisted = await phone.evaluate(
    () => document.documentElement.dataset.theme,
  );
  if (persisted !== "light") fail(`theme did not persist (${persisted})`);
  await phone.screenshot({ path: path.join(ARTIFACTS, "mobile-light.png") });
  ok("theme flip + persistence");
  await phone.close();

  // ---- desktop shell + per-tab render integrity ---------------------------
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  desktop.on("pageerror", (e) => pageErrors.push(String(e)));

  await desktop.goto(BASE, { waitUntil: "networkidle" });
  if (await desktop.locator(".topbar").isVisible()) {
    fail("topbar should hide on desktop");
  }
  await desktop.evaluate(() => window.scrollTo(0, 1200));
  await desktop.waitForTimeout(200);
  if (((await desktop.locator(".sidebar").boundingBox())?.y ?? -1) !== 0) {
    fail("desktop sidebar lost its sticky position");
  }
  ok("desktop chrome");

  // Render integrity: a sample of tabs must paint real content — a header,
  // a non-empty demo body, and at least one interactive control. This is
  // the blank-page assertion (a build that renders 17KB of invisible DOM
  // passes networkidle; it must not pass this).
  const SAMPLE = [
    "#/basic",
    "#/onboarding",
    "#/mui-invoice",
    "#/shad-signup",
    "#/schema-builder",
    "#/gen-mui",
    "#/cli-command",
  ];
  for (const route of SAMPLE) {
    await desktop.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const integrity = await desktop.evaluate(() => {
      const body = document.querySelector(".demo-body");
      const title = document.querySelector(".demo-title");
      const controls =
        body?.querySelectorAll("input, select, textarea, button").length ?? 0;
      return {
        title: title?.textContent?.trim() ?? "",
        bodyHeight: body?.getBoundingClientRect().height ?? 0,
        controls,
      };
    });
    if (integrity.title === "") fail(`${route}: empty demo title`);
    if (integrity.bodyHeight < 40) {
      fail(`${route}: demo body height ${integrity.bodyHeight}`);
    }
    if (integrity.controls === 0) fail(`${route}: no interactive controls`);
  }
  await desktop.screenshot({
    path: path.join(ARTIFACTS, "desktop-dark.png"),
    fullPage: false,
  });
  ok(`render integrity on ${SAMPLE.length} tabs`);

  if (pageErrors.length > 0) {
    fail(`page errors: ${pageErrors.slice(0, 3).join(" | ")}`);
  }
  await browser.close();
} finally {
  preview.kill();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} e2e failure(s)`);
  process.exit(1);
}
console.log("\nALL PLAYGROUND E2E CHECKS PASSED");
