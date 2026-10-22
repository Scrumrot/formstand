import path from "node:path";
import type { NextConfig } from "next";

// The one setting: this app lives inside the formstand repo, whose root
// and sibling packages carry their own lockfiles, so Next would otherwise
// infer the workspace root by guessing and warn about it on every build.
// A copy of this folder outside the repo can delete the line.
const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
