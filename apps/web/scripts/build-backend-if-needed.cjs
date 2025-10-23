#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const rawFlag = (process.env.NEXT_PUBLIC_MOCK_MODE ?? process.env.MOCK_MODE ?? "").toString().toLowerCase();
const isMockMode = rawFlag === "true" || rawFlag === "1";

if (isMockMode) {
  console.log("Skipping backend build in mock mode");
  process.exit(0);
}

const commands = [
  ["pnpm", ["--filter", "@repo/database", "build"]],
  ["pnpm", ["--filter", "@repo/api", "build"]],
];

for (const [cmd, args] of commands) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
