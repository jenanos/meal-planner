import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    // root barrel
    "index": "src/index.ts",
    // shadcn
    "components/shadcn/badge": "src/components/shadcn/badge.tsx",
    "components/shadcn/button": "src/components/shadcn/button.tsx",
    "components/shadcn/card": "src/components/shadcn/card.tsx",
    "components/shadcn/checkbox": "src/components/shadcn/checkbox.tsx",
    "components/shadcn/input": "src/components/shadcn/input.tsx",
    "components/shadcn/label": "src/components/shadcn/label.tsx",
    "components/shadcn/select": "src/components/shadcn/select.tsx",
    "components/shadcn/separator": "src/components/shadcn/separator.tsx",
    "components/shadcn/textarea": "src/components/shadcn/textarea.tsx",
    // magicui
    "components/magicui/grid-beams": "src/components/magicui/grid-beams.tsx",
    // lib (for components.json aliases.utils/lib)
    "lib/utils": "src/lib/utils.ts"
  },
  dts: true,
  format: ["esm", "cjs"],
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  outDir: "dist",
  target: "es2019",
  skipNodeModulesBundle: true
});
