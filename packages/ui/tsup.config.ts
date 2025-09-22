import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "framer-motion",
    "clsx",
    "tailwind-merge",
    "lucide-react",
    "class-variance-authority",
    "@radix-ui/react-slot",
    "@radix-ui/react-select",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-label",
    "@radix-ui/react-separator",
  ],
});
