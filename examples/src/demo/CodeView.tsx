import { useMemo } from "react";
import Prism from "prismjs";
// Grammar chain: core ships markup/clike/javascript; tsx extends jsx + ts.
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";

export type CodeViewProps = Readonly<{
  source: string;
}>;

// Read-only highlighted source for the "View code" panel. Prism over an
// editor (Monaco et al.) on purpose: the panel never edits, Prism is ~25KB
// of ES5-safe regex-to-markup, and the token CSS lives with the playground
// styles. The HTML injection is safe by construction — `source` is our own
// demo code inlined by Vite's ?raw at build time, and Prism escapes it
// during tokenization.
export const CodeView = ({ source }: CodeViewProps) => {
  const html = useMemo(
    () => Prism.highlight(source, Prism.languages["tsx"] ?? {}, "tsx"),
    [source],
  );

  return (
    <pre className="state-dump code-view" style={{ maxHeight: 480, overflow: "auto" }}>
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
};
