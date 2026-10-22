#!/usr/bin/env node
// tsrs-doctor runs on Bun, which reports child-process peak memory. This launcher lets `npx` users
// get a clear message instead of "env: bun: No such file or directory".
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const bun = process.versions.bun ? process.execPath : "bun";
const r = spawnSync(bun, [cli, ...process.argv.slice(2)], { stdio: "inherit" });
if (r.error) {
  if (r.error.code === "ENOENT") {
    console.error("tsrs-doctor needs Bun (https://bun.sh) to measure compiler memory.\nInstall it, then run: bunx tsrs-doctor");
  } else {
    console.error(`tsrs-doctor: could not start Bun: ${r.error.message}`);
  }
  process.exit(2);
}
process.exit(r.status ?? 2);
