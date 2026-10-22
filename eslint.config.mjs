import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["scripts/service-worker.js"],
    languageOptions: {
      globals: {
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Request: "readonly",
        Response: "readonly",
      },
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
    "public/sw.js",
  ]),
]);
