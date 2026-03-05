import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node22",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/^@web-qa-agent/],
  external: [
    "playwright",
    "pino",
    "pino-pretty",
    "dotenv",
    "commander",
    "zod",
    "uuid",
  ],
});
