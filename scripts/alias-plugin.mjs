import { existsSync } from "node:fs";
import { join } from "node:path";

/** Resolve `@/` imports to `src/` for esbuild-based test bundles. */
export function srcAliasPlugin(root) {
  const src = join(root, "src");
  const exts = ["", ".ts", ".tsx", ".js", ".css"];

  return {
    name: "src-alias",
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => {
        const base = join(src, args.path.slice(2));
        for (const ext of exts) {
          if (existsSync(base + ext)) return { path: base + ext };
        }
        return { path: base };
      });
    },
  };
}
