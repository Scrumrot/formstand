// Brand collateral: the OG images for the docs and the playground,
// rendered from one HTML template at the OG-standard 1200x630 so link
// unfurls (Slack, social, GitHub) carry the identity instead of a blank
// card. Committed alongside the PNGs it produces — regenerate with
// `node scripts/generate-og-images.mjs` after changing the template.
//
// Playwright is resolved from examples/ (it lives there as the e2e dev
// dependency; ESM resolves relative to the require seam, not this file).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromExamples = createRequire(
  pathToFileURL(path.join(root, "examples", "package.json")),
);
const { chromium } = requireFromExamples("playwright");

// The identity, verbatim from the docs brand layer and logo.svg: brass
// strokes on ink, the sap-green check meaning "valid".
const BRASS = "#e2a94e";
const BRASS_DEEP = "#c96f2f";
const CHECK = "#86c166";
const INK = "#0b0d12";
const INK_SOFT = "#12151c";
const TEXT = "#e6ebf5";
const MUTED = "#9aa7bd";

const MARK = `
<svg width="150" height="150" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g stroke="${BRASS}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="12" y="7" width="40" height="29" rx="6"/>
    <path d="M20 17h16"/>
    <path d="M20 26h9"/>
    <path d="M32 36v13"/>
    <path d="M32 49l-11 9"/>
    <path d="M32 49l11 9"/>
    <path d="M32 49v9"/>
  </g>
  <path d="M37 25l4 4 7.5-8.5" stroke="${CHECK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const page = (subtitle) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: radial-gradient(1100px 700px at 18% 0%, ${INK_SOFT}, ${INK});
    color: ${TEXT}; font-family: "Segoe UI", system-ui, sans-serif;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 96px; position: relative;
  }
  .row { display: flex; align-items: center; gap: 44px; }
  h1 { font-size: 118px; font-weight: 650; letter-spacing: -2px; }
  h1 .accent { color: ${BRASS}; }
  .tagline { margin-top: 26px; font-size: 40px; color: ${MUTED}; font-weight: 400; }
  .subtitle {
    margin-top: 40px; display: inline-flex; align-self: flex-start;
    font-size: 30px; color: ${BRASS}; border: 2px solid rgba(226,169,78,0.45);
    border-radius: 999px; padding: 10px 28px; background: rgba(226,169,78,0.10);
  }
  .rule {
    position: absolute; left: 0; right: 0; bottom: 0; height: 14px;
    background: linear-gradient(90deg, ${BRASS} 20%, ${BRASS_DEEP} 90%);
  }
</style></head>
<body>
  <div class="row">${MARK}<h1>form<span class="accent">stand</span></h1></div>
  <div class="tagline">Zod-schema-first form state for React 19, backed by zustand</div>
  ${subtitle === undefined ? "" : `<div class="subtitle">${subtitle}</div>`}
  <div class="rule"></div>
</body></html>`;

const shots = [
  { file: path.join(root, "docs", "public", "og.png"), subtitle: undefined },
  {
    file: path.join(root, "examples", "public", "og.png"),
    subtitle: "Live playground: every feature, running",
  },
];

const browser = await chromium.launch();
const tab = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  // The template is dark by design; pin the scheme so headless defaults
  // can't flip any UA styling.
  colorScheme: "dark",
});
for (const shot of shots) {
  await tab.setContent(page(shot.subtitle), { waitUntil: "networkidle" });
  await tab.screenshot({ path: shot.file });
  console.log(`wrote ${path.relative(root, shot.file)}`);
}
await browser.close();
