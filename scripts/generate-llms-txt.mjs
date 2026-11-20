// The agent-facing copy of the docs, written into the built site after
// `vitepress build docs`:
//
//   dist/llms.txt            an index of every documentation page, in sidebar
//                            order, each linked at its markdown URL
//   dist/llms-full.txt       the same header followed by every page in full
//   dist/documentation/*.md  one plain-markdown copy per page, at the page's
//                            own URL plus a .md suffix
//
// Why generate rather than hand-write: an assistant that has never seen
// formstand writes react-hook-form shapes against it, and the cure is the
// docs themselves, reachable as text without a headless browser. The
// llms.txt convention (llmstxt.org) asks for exactly this: a small index at
// the site root, and a markdown version of each page at its URL with .md
// appended. The sidebar module is the single list of pages, so a page added
// there is indexed here with no second edit.
//
// What the copies change from the source: VitePress-only syntax. The
// `<<<` includes become fenced blocks with the same harness stripping the
// site applies, `:::` containers become a bold lead line, the StackBlitz
// opener component is dropped, and relative links are made absolute so a
// page read on its own still points somewhere.
//
// Run AFTER `vitepress build docs` (it refuses to run without the dist).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { sidebar } from "../docs/.vitepress/sidebar.mjs";
import pkg from "../package.json" with { type: "json" };
import cliPkg from "../cli/package.json" with { type: "json" };

const SITE = "https://scrumrot.github.io/formstand/";
const REPO = "https://github.com/Scrumrot/formstand";
const RAW = "https://raw.githubusercontent.com/Scrumrot/formstand/main";

const root = process.cwd();
const docsDir = join(root, "docs");
const dist = join(docsDir, ".vitepress/dist");

if (!existsSync(join(dist, "index.html"))) {
  console.error("generate-llms-txt: docs/.vitepress/dist is missing; run `vitepress build docs` first");
  process.exit(1);
}

// A sidebar link ("/documentation/cli/") -> the page's identity: its source
// file, the site path of its markdown copy, and the URLs of both renderings.
const pageOf = (link) => {
  const stem = link.endsWith("/") ? `${link}index` : link; // "/documentation/cli/index"
  const rel = stem.replace(/^\//, ""); // "documentation/cli/index"
  return {
    link,
    source: join(docsDir, `${rel}.md`),
    mdPath: `${rel}.md`,
    mdUrl: `${SITE}${rel}.md`,
    htmlUrl: `${SITE}${link.replace(/^\//, "")}`,
  };
};

const groups = sidebar["/documentation/"].map((group) => ({
  title: group.text,
  pages: group.items
    .filter((item) => item.link.startsWith("/"))
    .map((item) => ({ title: item.text, ...pageOf(item.link) })),
}));

// --- source transforms ---------------------------------------------------

// `<<< ../../examples/src/...` includes: the site inlines the demo source,
// the copies link to the raw file instead. Twenty listings would make the
// examples page 190k characters and llms-full.txt mostly playground code,
// and an agent that wants a demo's source can fetch the one it needs.
const linkIncludes = (text) =>
  text.replace(
    /^<<< \.\.\/\.\.\/(examples\/src\/\S+)$/gm,
    (_line, rel) => `Source: ${RAW}/${rel}`,
  );

const dropComponents = (text) => text.replace(/^<StackBlitzLink\b[^\n]*\/>[ \t]*\n?/gm, "");

// `::: warning Title` ... `:::` has no markdown equivalent; the lead line
// keeps the kind and title so the emphasis survives, the body stays as is.
const CONTAINER_LEAD = {
  details: (title) => `**${title === "" ? "Details" : title}**`,
  warning: (title) => `**Warning${title === "" ? "" : `: ${title}`}**`,
  tip: (title) => `**Tip${title === "" ? "" : `: ${title}`}**`,
  info: (title) => `**Note${title === "" ? "" : `: ${title}`}**`,
  danger: (title) => `**Danger${title === "" ? "" : `: ${title}`}**`,
};

const flattenContainers = (text) =>
  text
    .replace(/^:::[ \t]*([a-z]+)(?:[ \t]+(.*))?[ \t]*$/gm, (_line, kind, title = "") => {
      const lead = CONTAINER_LEAD[kind];
      return lead === undefined ? `**${title}**` : lead(title.trim());
    })
    .replace(/^:::[ \t]*$/gm, "");

// Relative and site-absolute links become absolute URLs to the markdown
// copies, so a page fetched alone still leads to the next one.
const absolutizeLinks = (text, page) => {
  const pageDir = posix.dirname(page.link.endsWith("/") ? `${page.link}index` : page.link);
  return text.replace(/\]\(([^)\s]+)\)/g, (match, raw) => {
    if (/^(https?:|mailto:)/.test(raw)) return match;
    if (raw.startsWith("#")) return `](${page.mdUrl}${raw})`;
    const [path, anchor] = raw.split("#");
    const resolved = path.startsWith("/") ? posix.normalize(path) : posix.normalize(posix.join(pageDir, path));
    const stem = resolved.endsWith("/") ? `${resolved}index` : resolved;
    const url = `${SITE}${stem.replace(/^\//, "")}.md`;
    return `](${anchor === undefined ? url : `${url}#${anchor}`})`;
  });
};

const toPlainMarkdown = (page) => {
  const source = readFileSync(page.source, "utf8").replace(/\r\n/g, "\n");
  const text = absolutizeLinks(
    flattenContainers(dropComponents(linkIncludes(source))),
    page,
  );
  return `${text.replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
};

// The index wants one line per page: the first sentence of the page's
// opening paragraph, which most pages here write as a summary. The pages
// that open with a code block or a lead-in to a list get a line of their own.
const SUMMARY_OVERRIDES = {
  "/documentation/api/":
    "`createForm`, every `Form` instance method, and the option and result types.",
  "/documentation/api/utilities":
    "The exported core functions (paths, validation, `persistForm`), the complete type list, and the structural form interfaces.",
  "/documentation/cli/quick-start":
    "The three input modes (a zod schema, a TypeScript type, a JSON Schema or OpenAPI document), where the output goes, watch mode, and the formstand version each kind of output needs.",
  "/documentation/cli/reference":
    "Every `formstand-gen` flag, the machine-readable `--json` and `--manifest` output, the supported schema surface, the JSON Schema keyword mapping, generated tests, and how unsupported shapes degrade.",
  "/documentation/ssr":
    "Where server rendering touches a form: creating it, its initial values, persistence, the `createFormHooks` singleton caveat, and the React 19 form-action bridge.",
};

const summaryOf = (markdown) => {
  const paragraph = markdown
    .split("\n\n")
    .map((block) => block.trim())
    .find(
      (block) =>
        block !== "" &&
        !block.startsWith("#") &&
        !block.startsWith("```") &&
        !block.startsWith("**") &&
        !block.startsWith("<") &&
        !block.startsWith("|") &&
        !block.startsWith("-"),
    );
  if (paragraph === undefined) return "";
  const plain = paragraph
    .replace(/\n/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "");
  const sentence = plain.match(/^.*?[.!?](?=\s+[A-Z`"']|\s*$)/);
  return (sentence === null ? plain : sentence[0]).trim().replace(/:$/, ".");
};

// --- the header shared by llms.txt and llms-full.txt ----------------------

const peers = Object.entries(pkg.peerDependencies)
  .map(([name, range]) => `${name} ${range}`)
  .join(", ");

const header = [
  "# formstand",
  "",
  "> Zod-schema-first form state for React 19, backed by zustand. The zod schema you already wrote gives you the value types, the validation, the typed field paths, and enough shape information for formstand-cli to generate the form component itself.",
  "",
  `Two packages: \`formstand\` ${pkg.version} (the library) and \`formstand-cli\` ${cliPkg.version} (the generator, binary \`formstand-gen\`, a dev dependency). Peer dependencies: ${peers}. Install with \`npm install formstand zod zustand\` and \`npm install -D formstand-cli\`. formstand reads the zod schema tree directly for typed paths, introspection and field-scoped validation, so it supports zod only; there is no resolver layer and no \`register\`.`,
  "",
  `Every page below is plain markdown at the linked URL; the rendered page is the same URL without the \`.md\` suffix. The whole set in one file is at ${SITE}llms-full.txt. A skill that teaches a coding agent the library's shapes and the mistakes to avoid is at ${RAW}/skills/formstand/SKILL.md (install with \`npx skills add Scrumrot/formstand\`).`,
  "",
].join("\n");

// --- write -----------------------------------------------------------------

const pages = groups.flatMap((group) => group.pages);
const rendered = new Map(pages.map((page) => [page.mdPath, toPlainMarkdown(page)]));

for (const page of pages) {
  const out = join(dist, page.mdPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, rendered.get(page.mdPath), "utf8");
}

const index = [
  header,
  ...groups.flatMap((group) => [
    `## ${group.title}`,
    "",
    ...group.pages.map((page) => {
      const summary = SUMMARY_OVERRIDES[page.link] ?? summaryOf(rendered.get(page.mdPath));
      return `- [${page.title}](${page.mdUrl})${summary === "" ? "" : `: ${summary}`}`;
    }),
    "",
  ]),
  "## Optional",
  "",
  `- [README](${RAW}/README.md): the package README, a shorter tour with the same quickstart`,
  `- [Changelog](${RAW}/CHANGELOG.md): every release of both packages, newest first`,
  `- [Roadmap](${RAW}/ROADMAP.md): what shipped, what is next, and the path to 1.0`,
  `- [Playground](${SITE}examples/): every demo running against the real library, with its source`,
  `- [Source](${REPO}): the repository, MIT licensed`,
  "",
].join("\n");

writeFileSync(join(dist, "llms.txt"), index, "utf8");

const full = [
  header,
  `This file is every documentation page in sidebar order. Each page starts at its H1; the line under it names the page's own URL.`,
  "",
  ...pages.flatMap((page) => {
    const body = rendered.get(page.mdPath);
    const withSource = body.replace(/^(# .+)\n/, `$1\n\nPage: ${page.mdUrl}\n`);
    return ["---", "", withSource.trimEnd(), ""];
  }),
].join("\n");

writeFileSync(join(dist, "llms-full.txt"), full, "utf8");

console.log(
  `llms.txt (${index.length.toLocaleString()} chars), llms-full.txt (${full.length.toLocaleString()} chars), ${pages.length} markdown pages written to docs/.vitepress/dist`,
);
