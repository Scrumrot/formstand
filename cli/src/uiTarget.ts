// The parsed `--ui` value: which UI kit to emit for, and — for kits that
// formstand supports across several majors — which major to target. Pure
// data + a parser, shared by the flag parser, the config loader, and the
// emitters (browser-safe: no Node built-ins).

// @mui/material majors formstand-cli can emit for. Only React-19-capable
// majors qualify (formstand peers react ^19, so MUI 4 and older can never
// install alongside it), and MUI skipped major 8 entirely (7.x jumps to
// 9.0.0 on the registry) — hence the gap.
export type MuiVersion = 5 | 6 | 7 | 9;

export const MUI_VERSIONS: readonly MuiVersion[] = [5, 6, 7, 9];

// Bare `--ui mui` keeps meaning "current MUI" — the latest supported major.
export const DEFAULT_MUI_VERSION: MuiVersion = 9;

// The discriminated target the CLI threads to the emitters. Future phases
// add more kits here — extend the union, do not widen `kit` to string.
//
// chakra carries no version: @chakra-ui/react 3 is the only major the
// backend targets (v2 and older predate the compound-component API the
// emitter speaks, and formstand peers react ^19). "chakra@3" is accepted as
// an explicit spelling of the same target.
//
// mantine carries no version either: the backend targets the current
// @mantine/core major (9) only. Unlike chakra this is not an API-existence
// scope — the emitted surface typechecks identically against 7.x-latest and
// 8.x (verified empirically; the one delta found is the `bdrs` style prop,
// absent in 7) — but 9 is the only major the matrix verifies, so it is the
// only accepted target. "mantine@9" is the explicit spelling.
//
// antd carries no version either: the backend targets antd 6 (the current
// major, which peers react >=18 — React 19 natively in range). antd 5 also
// runs on React 19 but only via the @ant-design/v5-patch-for-react-19 host
// patch, and the emitted surface is verified against the v6 .d.ts only, so
// 5 errors honestly rather than claiming support. "antd@6" is the explicit
// spelling.
export type UiTarget =
  | Readonly<{ kit: "plain" }>
  | Readonly<{ kit: "shadcn" }>
  | Readonly<{ kit: "chakra" }>
  | Readonly<{ kit: "mantine" }>
  | Readonly<{ kit: "antd" }>
  | Readonly<{ kit: "mui"; version: MuiVersion }>;

// The flag/config spelling of a target — what `--ui` and the config file's
// `ui` key accept. `defineConfig` completion comes from this union.
export type Ui =
  | "plain"
  | "shadcn"
  | "mui"
  | `mui@${MuiVersion}`
  | "chakra"
  | "chakra@3"
  | "mantine"
  | "mantine@9"
  | "antd"
  | "antd@6";

// The list HELP and error messages show.
export const UI_CHOICES =
  'plain, mui, mui@<5|6|7|9>, shadcn, chakra, mantine, antd';

export type ParseUiResult =
  | Readonly<{ kind: "ok"; target: UiTarget }>
  | Readonly<{ kind: "error"; message: string }>;

const err = (message: string): ParseUiResult => ({ kind: "error", message });

const muiVersionOf = (text: string): MuiVersion | undefined =>
  MUI_VERSIONS.find((version) => String(version) === text);

// Parse a `--ui` / config `ui` value. The message comes back without a flag
// or file prefix — callers prepend their own context ("--ui ...",
// "formstand.config.ts: ui ...").
export const parseUiTarget = (value: string): ParseUiResult => {
  const at = value.indexOf("@");
  const kit = at === -1 ? value : value.slice(0, at);
  const versionText = at === -1 ? undefined : value.slice(at + 1);
  switch (kit) {
    case "plain":
    case "shadcn":
      return versionText === undefined
        ? { kind: "ok", target: { kit } }
        : err(
            `"${kit}" takes no version (only mui, chakra, mantine, and antd are versioned), got "${value}"`,
          );
    case "chakra": {
      // Bare "chakra" IS v3; "chakra@3" is the explicit spelling of the same
      // target. Older majors can't be targeted: the backend emits the v3
      // compound-component API (Field.Root/NativeSelect/Switch.Root), which
      // v2 and older do not have — and formstand peers react ^19, which the
      // pre-v3 architecture predates.
      if (versionText === undefined || versionText === "3") {
        return { kind: "ok", target: { kit: "chakra" } };
      }
      if (/^[0-2]$/.test(versionText)) {
        return err(
          `chakra@${versionText} is not supported: formstand requires React 19, and the backend emits the @chakra-ui/react 3 compound-component API, which older majors do not have; supported: "chakra" (v3, also spelled "chakra@3")`,
        );
      }
      return err(
        `unsupported chakra version "${versionText}"; v3 is the only supported major — use "chakra" or "chakra@3"`,
      );
    }
    case "mantine": {
      // Bare "mantine" IS v9 (the current major); "mantine@9" is the explicit
      // spelling. Only the current major is a target: majors 6 and older
      // predate both formstand's react ^19 peer and the v7 styling rewrite
      // (emotion -> CSS modules); majors 7–8 do accept React 19 — and the
      // emitted surface even compiles there — but the backend is verified
      // against v9 only, so they error rather than silently claim support.
      if (versionText === undefined || versionText === "9") {
        return { kind: "ok", target: { kit: "mantine" } };
      }
      if (/^[0-6]$/.test(versionText)) {
        return err(
          `mantine@${versionText} is not supported: formstand requires React 19, and @mantine/core 7 rewrote styling (emotion → CSS modules) — majors 6 and older predate both; supported: "mantine" (v9, also spelled "mantine@9")`,
        );
      }
      if (versionText === "7" || versionText === "8") {
        return err(
          `mantine@${versionText} is not supported: the backend targets the current @mantine/core major only — Mantine ${versionText} does accept React 19, but generated output is verified against v9 only; use "mantine" (or its explicit spelling "mantine@9")`,
        );
      }
      return err(
        `unsupported mantine version "${versionText}"; v9 is the only supported major — use "mantine" or "mantine@9"`,
      );
    }
    case "antd": {
      // Bare "antd" IS v6 (the current major); "antd@6" is the explicit
      // spelling. Only the current major is a target: antd 6 peers
      // react >=18, so React 19 is natively in range; antd 5 nominally
      // peers react >=16.9 but needs the @ant-design/v5-patch-for-react-19
      // host patch on React 19 — and the emitted surface is verified
      // against the v6 .d.ts only — so it errors rather than silently
      // claim support; 4 and older predate the v5 CSS-in-JS rewrite and
      // parts of the emitted surface (Flex, the Collapse items API, the
      // `status` prop).
      if (versionText === undefined || versionText === "6") {
        return { kind: "ok", target: { kit: "antd" } };
      }
      if (/^[0-4]$/.test(versionText)) {
        return err(
          `antd@${versionText} is not supported: the backend emits the antd 5+ surface (Flex, the Collapse items API, status props), which antd ${versionText} does not have — and antd 4 and older predate the v5 CSS-in-JS rewrite; supported: "antd" (v6, also spelled "antd@6")`,
        );
      }
      if (versionText === "5") {
        return err(
          `antd@5 is not supported: the backend targets the current antd major only — antd 5 can run on React 19 (host apps need the @ant-design/v5-patch-for-react-19 import), but generated output is verified against v6 only; use "antd" (or its explicit spelling "antd@6")`,
        );
      }
      return err(
        `unsupported antd version "${versionText}"; v6 is the only supported major — use "antd" or "antd@6"`,
      );
    }
    case "mui": {
      if (versionText === undefined) {
        return {
          kind: "ok",
          target: { kit: "mui", version: DEFAULT_MUI_VERSION },
        };
      }
      const version = muiVersionOf(versionText);
      if (version !== undefined) {
        return { kind: "ok", target: { kit: "mui", version } };
      }
      if (versionText === "8") {
        return err(
          `there is no @mui/material major 8 (MUI skipped it; 7.x jumps to 9); supported: ${MUI_VERSIONS.map((v) => `"mui@${v}"`).join(", ")}`,
        );
      }
      if (/^[0-4]$/.test(versionText)) {
        return err(
          `mui@${versionText} is not supported: formstand requires React 19, and @mui/material ${versionText} cannot install alongside it; supported: ${MUI_VERSIONS.map((v) => `"mui@${v}"`).join(", ")}`,
        );
      }
      return err(
        `unsupported mui version "${versionText}"; supported: ${MUI_VERSIONS.map((v) => `"mui@${v}"`).join(", ")}`,
      );
    }
    default:
      return err(`must be one of ${UI_CHOICES}; got "${value}"`);
  }
};
