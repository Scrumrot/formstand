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
// add more kits here (chakra, mantine, antd) — extend the union, do not
// widen `kit` to string.
export type UiTarget =
  | Readonly<{ kit: "plain" }>
  | Readonly<{ kit: "shadcn" }>
  | Readonly<{ kit: "mui"; version: MuiVersion }>;

// The flag/config spelling of a target — what `--ui` and the config file's
// `ui` key accept. `defineConfig` completion comes from this union.
export type Ui = "plain" | "shadcn" | "mui" | `mui@${MuiVersion}`;

// The list HELP and error messages show.
export const UI_CHOICES = 'plain, mui, mui@<5|6|7|9>, shadcn';

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
            `"${kit}" takes no version (only mui is versioned), got "${value}"`,
          );
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
