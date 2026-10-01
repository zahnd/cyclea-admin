import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // ReUI's vendored data-grid trips three React Compiler rules. It is
  // registry code we reuse rather than maintain, and editing it would drift
  // from upstream on the next `shadcn add`. Off for that directory only; our
  // own code is still held to them.
  {
    files: ["components/reui/**"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
