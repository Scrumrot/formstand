// Every internal docs link and anchor must point at something that exists.
//
// Two failure modes this catches, both of which have already shipped here:
// a page moves (the guide/api -> documentation/ restructure) and a link is
// left behind; or a heading gets reworded and a #deep-link silently stops
// scrolling anywhere. VitePress's own build catches dead .md links WITHIN
// docs/ but never checks anchors, and never looks at the READMEs at all,
// which is how README links can rot without a single red check.
//
// Anchors are verified against the ids VitePress actually rendered, not
// re-derived with a copy of its slugify. Its rules are non-obvious (an em
// dash survives into the id; runs of ASCII punctuation collapse to one
// dash), so a reimplementation would be a second thing to keep in sync.
//
// Run AFTER `npm run docs:build`.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const docsDir = join(root, "docs");
const dist = join(docsDir, ".vitepress/dist");
const SITE = "https://scrumrot.github.io/formstand/";

// The repo's own markdown, minus generated and vendored trees.
const markdown = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return /node_modules|\.vitepress|dist|coverage|\.git/.test(path)
        ? []
        : markdown(path);
    }
    return entry.name.endsWith(".md") ? [path] : [];
  });

const SOURCES = [
  ...markdown(docsDir),
  join(root, "README.md"),
  join(root, "cli/README.md"),
];

// A docs page's built HTML, or undefined when the page doesn't exist.
const htmlFor = (page) => {
  const stem = page.replace(/\/$/, "");
  const candidates =
    stem === ""
      ? ["index.html"]
      : [`${stem}.html`, `${stem}/index.html`];
  const hit = candidates.map((c) => join(dist, c)).find(existsSync);
  return hit === undefined ? undefined : readFileSync(hit, "utf8");
};

// Markdown source path -> its page path under the site root.
const pageOf = (file) => {
  const rel = relative(docsDir, file).replaceAll("\\", "/");
  return rel.replace(/\.md$/, "").replace(/(^|\/)index$/, "$1");
};

const problems = [];

const check = (file, raw, target) => {
  const [page, anchor] = target.split("#");
  const html = htmlFor(page);
  if (html === undefined) {
    problems.push(`${relative(root, file)} -> ${raw}: no such page`);
    return;
  }
  if (anchor !== undefined && anchor !== "" && !html.includes(`id="${anchor}"`)) {
    problems.push(`${relative(root, file)} -> ${raw}: no such anchor`);
  }
};

for (const file of SOURCES) {
  const body = readFileSync(file, "utf8");
  const inDocs = file.startsWith(docsDir);

  for (const [, raw] of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    // The playground is a separate Vite app that the docs DEPLOY copies in
    // as /examples/; `docs:build` never emits it, so there is nothing here
    // to check it against. Its hash routes are covered by the e2e run.
    if (raw.startsWith(`${SITE}examples/`)) continue;
    // Absolute links to our own docs: README deep links live here.
    if (raw.startsWith(SITE)) {
      check(file, raw, raw.slice(SITE.length));
      continue;
    }
    if (/^https?:|^mailto:/.test(raw)) continue;
    // Repo-relative links out of a README (./CONTRIBUTING.md and friends).
    if (!inDocs) {
      const onDisk = resolve(dirname(file), raw.split("#")[0]);
      if (!existsSync(onDisk)) {
        problems.push(`${relative(root, file)} -> ${raw}: no such file`);
      }
      continue;
    }
    // Same-page anchor.
    if (raw.startsWith("#")) {
      check(file, raw, `${pageOf(file)}${raw}`);
      continue;
    }
    const [path, anchor] = raw.split("#");
    const base = path.startsWith("/")
      ? relative(docsDir, join(docsDir, path)).replaceAll("\\", "/")
      : relative(docsDir, resolve(dirname(file), path)).replaceAll("\\", "/");
    check(file, raw, anchor === undefined ? base : `${base}#${anchor}`);
  }
}

if (problems.length > 0) {
  console.error(
    `${problems.length} broken doc link${problems.length === 1 ? "" : "s"}:\n`,
  );
  problems.forEach((p) => console.error(`  ${p}`));
  console.error(
    "\nAnchors are checked against the ids in docs/.vitepress/dist —" +
      " rebuild the docs if they are stale.",
  );
  process.exit(1);
}

console.log(
  `all internal links and anchors resolve (${SOURCES.length} markdown files)`,
);
