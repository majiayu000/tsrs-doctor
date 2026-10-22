// End-to-end: run the CLI against small fixture projects with the bundled tsrs and tsgo.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
let dir: string;

function project(name: string, files: Record<string, string>): string {
  const p = join(dir, name);
  mkdirSync(join(p, "src"), { recursive: true });
  writeFileSync(
    join(p, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, target: "es2022", module: "preserve", types: [] }, include: ["src"] }),
  );
  for (const [f, src] of Object.entries(files)) writeFileSync(join(p, "src", f), src);
  return p;
}

function run(args: string[]) {
  const r = Bun.spawnSync(["bun", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "tsrs-doctor-cli-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("cli", () => {
  test("identical diagnostics exit 0 and write JSON and Markdown", () => {
    const p = project("errors", { "a.ts": `const x: number = "s";\nexport function f(a) { return a; }\n` });
    const json = join(dir, "r.json");
    const md = join(dir, "r.md");
    const r = run([p, "--runs", "2", "--json", json, "--md", md]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("identical diagnostics");
    const report = JSON.parse(readFileSync(json, "utf8"));
    expect(report.schemaVersion).toBe(1);
    expect(report.diagnostics).toMatchObject({ baselineCount: 2, tsrsCount: 2, same: 2 });
    expect(report.perf.tsrs.maxRssBytes.median).toBeGreaterThan(1024 * 1024);
    expect(report.perf.speedup).toBeGreaterThan(0);
    const mdText = readFileSync(md, "utf8");
    expect(mdText).toContain("## Performance");
    expect(mdText).toMatch(/img\.shields\.io\/badge\/tsrs-[\d.]+%C3%97%20faster/);
  });

  test("a baseline that disagrees is reported as differences, exit 1", () => {
    // A fake baseline that reports a different diagnostic than tsrs.
    const p = project("diff", { "a.ts": `export function f(a) { return a; }\n` });
    const fake = join(dir, "fake-baseline.sh");
    writeFileSync(fake, `#!/bin/sh\nif [ "$1" = --version ]; then echo "Version 7.1.0-dev.20260930.4"; exit 0; fi\necho "src/a.ts(1,9): error TS9999: made up."\nexit 2\n`, { mode: 0o755 });
    const r = run([p, "--runs", "1", "--baseline", fake]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("missing in tsrs 1, extra in tsrs 1");
    expect(r.out).toContain("- src/a.ts(1,9): error TS9999: made up.");
    expect(r.out).toContain("+ src/a.ts(1,19): error TS7006");
  });

  test("a crashing compiler is reported, exit 1", () => {
    const p = project("crash", { "a.ts": `export {};\n` });
    const fake = join(dir, "crash.sh");
    writeFileSync(fake, `#!/bin/sh\nif [ "$1" = --version ]; then echo "Version 7.1.0-dev.20260930.4"; exit 0; fi\necho "thread main panicked at checker.rs" >&2\nexit 101\n`, { mode: 0o755 });
    const r = run([p, "--runs", "1", "--tsrs", fake]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("CRASH tsrs: exit code 101");
  });

  test("a solution-style tsconfig is an error that lists the referenced projects", () => {
    const p = join(dir, "solution");
    mkdirSync(p, { recursive: true });
    writeFileSync(join(p, "tsconfig.json"), `{ "files": [], "references": [{ "path": "./packages/a" }, { "path": "./tsconfig.lib.json" }] }`);
    const r = run([p]);
    expect(r.code).toBe(2);
    expect(r.err).toContain(`-p packages/a`);
    expect(r.err).toContain(`-p tsconfig.lib.json`);
  });

  test("the node launcher forwards arguments and the exit code", () => {
    const launcher = resolve(import.meta.dir, "..", "bin", "tsrs-doctor.js");
    const r = Bun.spawnSync(["node", launcher, "--bogus"], { stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("tsrs-doctor:");
  });

  test.skipIf(!!Bun.spawnSync(["node", "-p", "process.versions.bun ?? ''"]).stdout.toString().trim())(
    "the node launcher explains that Bun is required when it is missing",
    () => {
      const launcher = resolve(import.meta.dir, "..", "bin", "tsrs-doctor.js");
      const node = Bun.which("node")!;
      const r = Bun.spawnSync([node, launcher], { stdout: "pipe", stderr: "pipe", env: { PATH: "/nonexistent" } });
      expect(r.exitCode).toBe(2);
      expect(r.stderr.toString()).toContain("needs Bun");
    },
  );

  test("tool errors exit 2", () => {
    expect(run([join(dir, "nope")]).code).toBe(2);
    expect(run([project("args", { "a.ts": "export {};\n" }), "--runs", "0"]).code).toBe(2);
    expect(run(["--bogus"]).code).toBe(2);
  });
});
