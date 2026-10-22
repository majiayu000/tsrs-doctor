#!/usr/bin/env bun
// tsrs-doctor: compare tsgo/tsc with tsrs on your own repository, and set up VS Code.

import { parse as parseJsonc } from "jsonc-parser";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  alignDiagnostics,
  formatDiagnostic,
  goneInGoMode,
  hasDifferences,
  isUnstable,
  parseDiagnostics,
  unstableKeys,
  type Diagnostic,
  type Side,
} from "./diagnostics.ts";
import { renderMarkdown, renderTerminal, differenceCount, type Measure, type Report } from "./report.ts";
import { DoctorError, resolveBaseline, resolveTsrs, tsVersionOf } from "./resolve.ts";
import { crashReason, runOnce, stats, type RunResult } from "./run.ts";
import { setupVscode, undoVscode } from "./vscode.ts";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version as string;
export const GO_MODE_ARGS = ["--checkerAssignment", "go", "--noLazyMembers", "--checkers", "4"];

const HELP = `tsrs-doctor ${VERSION}: can this repo switch to tsrs?

Usage
  tsrs-doctor [dir] [options] [-- <compiler args>]
  tsrs-doctor vscode [dir] [--undo]

Compare options
  -p, --project <path>   tsconfig, relative to dir (default: tsconfig.json)
      --runs <n>         timed runs per compiler, median reported (default: 3)
      --tsrs <bin>       native tsrs binary (default: auto-detect)
      --baseline <bin>   baseline compiler, tsgo or tsc (default: auto-detect)
      --timeout <sec>    per-run timeout (default: 600)
      --json <file>      write the full report as JSON
      --md <file>        write the full report as Markdown
  -- <args>              passed to both compilers, e.g. -- --checkers 4

Exit codes: 0 identical diagnostics, 1 differences or a crash, 2 tool error.`;

function log(s: string) {
  console.error(s);
}

async function compare(dir: string, values: Record<string, string | boolean | undefined>, passthrough: string[]) {
  const projectDir = resolve(dir);
  const tsconfig = (values.project as string | undefined) ?? "tsconfig.json";
  const tsconfigPath = resolve(projectDir, tsconfig);
  if (!existsSync(tsconfigPath)) throw new DoctorError(`tsconfig not found: ${tsconfigPath}`);
  rejectSolutionConfig(tsconfigPath, tsconfig, dir);
  const runs = positiveInt(values.runs as string | undefined, 3, "--runs");
  const timeout = positiveInt(values.timeout as string | undefined, 600, "--timeout");

  const [baseline, tsrs] = await Promise.all([
    resolveBaseline(projectDir, values.baseline as string | undefined),
    resolveTsrs(projectDir, values.tsrs as string | undefined),
  ]);
  const warnings: string[] = [];
  const portedVersion = tsVersionOf(tsrs.version);
  const baselineVersion = tsVersionOf(baseline.version);
  if (baseline.legacy) {
    warnings.push(`Baseline is TypeScript ${baselineVersion}; tsrs ports TypeScript 7, so many differences are by design. Install typescript@7 for a parity check.`);
  } else if (portedVersion && baselineVersion && portedVersion !== baselineVersion) {
    warnings.push(`tsrs ports TypeScript ${portedVersion} but the baseline is ${baselineVersion}; some differences may come from TypeScript itself.`);
  }

  const args = ["-p", tsconfig, "--noEmit", "--pretty", "false", ...passthrough];
  const results: { baseline: RunResult[]; tsrs: RunResult[] } = { baseline: [], tsrs: [] };
  for (let i = 0; i < runs; i++) {
    for (const [key, c] of [["baseline", baseline], ["tsrs", tsrs]] as const) {
      log(`run ${i + 1}/${runs}: ${c.name}…`);
      results[key].push(await runOnce(c.bin, args, projectDir, timeout));
    }
  }

  const crashes: Report["crashes"] = [];
  for (const [key, c] of [["baseline", baseline], ["tsrs", tsrs]] as const) {
    const bad = results[key].map((r) => [r, crashReason(r)] as const).find(([, reason]) => reason);
    if (bad) crashes.push({ compiler: c.name, reason: bad[1]!, stderrTail: tail(bad[0].stderr || bad[0].stdout) });
  }

  const parse = (r: RunResult) => parseDiagnostics(r.stdout, projectDir);
  const baseRuns = results.baseline.map(parse);
  const tsrsDiags = parse(results.tsrs[0]!);
  const align = alignDiagnostics(baseRuns[0]!, tsrsDiags);
  const unstable = unstableKeys(baseRuns);

  let goModeArgs: string[] | null = null;
  let gone: ((d: Diagnostic, side: Side) => boolean) | null = null;
  if (hasDifferences(align) && !crashes.some((c) => c.compiler === "tsrs")) {
    goModeArgs = [...GO_MODE_ARGS];
    log(`differences found; re-running tsrs ${goModeArgs.join(" ")}…`);
    const goRun = await runOnce(tsrs.bin, [...args, ...goModeArgs], projectDir, timeout);
    const reason = crashReason(goRun);
    if (reason) {
      crashes.push({ compiler: "tsrs (Go mode)", reason, stderrTail: tail(goRun.stderr || goRun.stdout) });
    } else {
      gone = goneInGoMode(alignDiagnostics(baseRuns[0]!, parse(goRun)));
    }
  }

  const entry = (d: Diagnostic, side: Side) => ({
    text: formatDiagnostic(d),
    unstableInBaseline: isUnstable(d, unstable),
    goneInGoMode: gone ? gone(d, side) : null,
  });

  const measure = (rs: RunResult[]): Measure => ({
    wallMs: stats(rs.map((r) => r.wallMs)),
    cpuMs: stats(rs.map((r) => r.cpuMs)),
    maxRssBytes: stats(rs.map((r) => r.maxRssBytes)),
  });
  const perf =
    crashes.length === 0
      ? (() => {
          const b = measure(results.baseline);
          const t = measure(results.tsrs);
          return { baseline: b, tsrs: t, speedup: b.wallMs.median / t.wallMs.median, memoryRatio: b.maxRssBytes.median / t.maxRssBytes.median };
        })()
      : null;

  const report: Report = {
    schemaVersion: 1,
    tool: `tsrs-doctor ${VERSION}`,
    date: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}, ${navigator.hardwareConcurrency} cores`,
    projectDir,
    tsconfig,
    args,
    runs,
    baseline,
    tsrs,
    warnings,
    crashes,
    perf,
    diagnostics: {
      baselineCount: baseRuns[0]!.length,
      tsrsCount: tsrsDiags.length,
      same: align.same,
      missing: align.missing.map((d) => entry(d, "missing")),
      extra: align.extra.map((d) => entry(d, "extra")),
      changed: align.changed.map((c) => ({
        ...entry(c.baseline, "changed"),
        text: formatDiagnostic(c.tsrs),
        baselineText: formatDiagnostic(c.baseline),
      })),
      goModeArgs,
    },
  };

  console.log(renderTerminal(report));
  if (values.json) writeFileSync(values.json as string, JSON.stringify(report, null, 2) + "\n");
  if (values.md) writeFileSync(values.md as string, renderMarkdown(report));
  return crashes.length || differenceCount(report) ? 1 : 0;
}

function tail(s: string, lines = 20): string {
  return s.trimEnd().split("\n").slice(-lines).join("\n");
}

function positiveInt(v: string | undefined, def: number, flag: string): number {
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new DoctorError(`${flag} must be a positive integer, got "${v}"`);
  return n;
}

/** A solution-style tsconfig checks no files, which would report a misleading "identical". */
function rejectSolutionConfig(tsconfigPath: string, tsconfig: string, dir: string): void {
  const config = parseJsonc(readFileSync(tsconfigPath, "utf8"), [], { allowTrailingComma: true }) ?? {};
  if (!Array.isArray(config.references) || !Array.isArray(config.files) || config.files.length || config.include) return;
  const base = dirname(tsconfig);
  const refs = config.references
    .map((r: { path?: string }) => r.path)
    .filter((p: unknown): p is string => typeof p === "string")
    .map((p: string) => `  tsrs-doctor ${dir === "." ? "" : dir + " "}-p ${join(base, p)}`);
  throw new DoctorError(
    `${tsconfig} only lists project references, so it type-checks no files. Run one of:\n${refs.join("\n")}`,
  );
}

export async function main(argv: string[]): Promise<number> {
  const dashdash = argv.indexOf("--");
  const own = dashdash >= 0 ? argv.slice(0, dashdash) : argv;
  const passthrough = dashdash >= 0 ? argv.slice(dashdash + 1) : [];
  const { values, positionals } = parseArgs({
    args: own,
    allowPositionals: true,
    options: {
      project: { type: "string", short: "p" },
      runs: { type: "string" },
      tsrs: { type: "string" },
      baseline: { type: "string" },
      timeout: { type: "string" },
      json: { type: "string" },
      md: { type: "string" },
      undo: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  if (positionals[0] === "vscode") {
    const root = resolve(positionals[1] ?? ".");
    if (values.undo) undoVscode(root);
    else setupVscode(root);
    return 0;
  }
  if (positionals.length > 1) throw new DoctorError(`unexpected arguments: ${positionals.slice(1).join(" ")}`);
  if (values.undo) throw new DoctorError("--undo only applies to `tsrs-doctor vscode`");
  return compare(positionals[0] ?? ".", values, passthrough);
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (e) {
    if (e instanceof DoctorError || (e as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
      log(`tsrs-doctor: ${(e as Error).message}`);
      process.exitCode = 2;
    } else {
      console.error(e);
      process.exitCode = 2;
    }
  }
}
