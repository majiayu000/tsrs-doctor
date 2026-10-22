// Report structure and its terminal / Markdown renderings. JSON output is the Report itself.

import type { Compiler } from "./resolve.ts";
import type { Stats } from "./run.ts";

export interface Measure {
  wallMs: Stats;
  cpuMs: Stats;
  maxRssBytes: Stats;
}

export interface DiffEntry {
  /** Formatted diagnostic, continuation lines included. */
  text: string;
  /** The baseline did not report this identically on every run. */
  unstableInBaseline: boolean;
  /** Gone when tsrs runs with --checkerAssignment go --noLazyMembers; null if that run was skipped. */
  goneInGoMode: boolean | null;
}

export interface ChangedEntry extends DiffEntry {
  baselineText: string;
}

export interface Report {
  schemaVersion: 1;
  tool: string;
  date: string;
  platform: string;
  projectDir: string;
  tsconfig: string;
  args: string[];
  runs: number;
  baseline: Compiler;
  tsrs: Compiler;
  warnings: string[];
  crashes: { compiler: string; reason: string; stderrTail: string }[];
  perf: { baseline: Measure; tsrs: Measure; speedup: number; memoryRatio: number } | null;
  diagnostics: {
    baselineCount: number;
    tsrsCount: number;
    same: number;
    missing: DiffEntry[];
    extra: DiffEntry[];
    changed: ChangedEntry[];
    goModeArgs: string[] | null;
  };
}

export function differenceCount(r: Report): number {
  const d = r.diagnostics;
  return d.missing.length + d.extra.length + d.changed.length;
}

const fmtSec = (ms: number) => (ms / 1000).toFixed(2) + "s";
const fmtMiB = (b: number) => (b / 1024 / 1024).toFixed(0) + " MiB";
const fmtX = (x: number) => x.toFixed(1) + "×";

function range(s: Stats, f: (n: number) => string): string {
  return s.min === s.max ? f(s.median) : `${f(s.median)} (${f(s.min)}–${f(s.max)})`;
}

function perfRows(r: Report): string[][] {
  const p = r.perf!;
  const row = (label: string, m: Measure) => [
    label,
    range(m.wallMs, fmtSec),
    range(m.cpuMs, fmtSec),
    range(m.maxRssBytes, fmtMiB),
  ];
  return [
    ["", "wall", "cpu (user+sys)", "peak RSS"],
    row(r.baseline.name, p.baseline),
    row("tsrs", p.tsrs),
    ["tsrs vs " + r.baseline.name, fmtX(p.speedup) + " faster", "", fmtX(p.memoryRatio) + " less memory"],
  ];
}

export function headline(r: Report): string {
  const n = differenceCount(r);
  const parity = n === 0 ? "identical diagnostics" : `${n} diagnostic difference${n === 1 ? "" : "s"}`;
  if (!r.perf) return `tsrs: ${parity}`;
  return `tsrs is ${fmtX(r.perf.speedup)} faster and uses ${fmtX(r.perf.memoryRatio)} less memory than ${r.baseline.name} on this repo, ${parity}`;
}

function tags(e: DiffEntry): string {
  const t: string[] = [];
  if (e.unstableInBaseline) t.push("baseline unstable");
  if (e.goneInGoMode) t.push("gone in Go mode");
  return t.length ? ` [${t.join(", ")}]` : "";
}

function table(rows: string[][]): string {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows.map((r) => r.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd()).join("\n");
}

const TERMINAL_LIMIT = 20;

export function renderTerminal(r: Report): string {
  const out: string[] = [];
  out.push(`baseline  ${r.baseline.version}  (${r.baseline.source}: ${r.baseline.bin})`);
  out.push(`tsrs      ${r.tsrs.version}  (${r.tsrs.source}: ${r.tsrs.bin})`);
  out.push(`project   ${r.tsconfig}  args: ${r.args.join(" ")}`);
  for (const w of r.warnings) out.push(`warning: ${w}`);
  for (const c of r.crashes) out.push(`CRASH ${c.compiler}: ${c.reason}\n${indent(c.stderrTail)}`);
  if (r.perf) {
    out.push("", `performance, median of ${r.runs} run${r.runs === 1 ? "" : "s"}:`, indent(table(perfRows(r))));
  }
  const d = r.diagnostics;
  out.push(
    "",
    `diagnostics: ${r.baseline.name} ${d.baselineCount}, tsrs ${d.tsrsCount}; ` +
      `same ${d.same}, missing in tsrs ${d.missing.length}, extra in tsrs ${d.extra.length}, text differs ${d.changed.length}`,
  );
  const lines: string[] = [
    ...d.missing.map((e) => `- ${firstLine(e.text)}${tags(e)}`),
    ...d.extra.map((e) => `+ ${firstLine(e.text)}${tags(e)}`),
    ...d.changed.map((e) => `~ ${firstLine(e.text)}${tags(e)}`),
  ];
  out.push(...lines.slice(0, TERMINAL_LIMIT).map(indent));
  if (lines.length > TERMINAL_LIMIT) out.push(`  … ${lines.length - TERMINAL_LIMIT} more; use --md or --json for the full list`);
  out.push("", headline(r));
  return out.join("\n");
}

function firstLine(s: string): string {
  return s.split("\n")[0]!;
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((l) => "  " + l)
    .join("\n");
}

function mdTable(rows: string[][]): string {
  const [head, ...body] = rows;
  return [head, head!.map(() => "---"), ...body].map((r) => `| ${r!.join(" | ")} |`).join("\n");
}

function fence(s: string): string {
  return "```\n" + s + "\n```";
}

/** shields.io static badge for a project README. */
export function badge(r: Report): string | undefined {
  if (!r.perf) return undefined;
  const esc = (s: string) => encodeURIComponent(s).replace(/-/g, "--");
  const message = `${fmtX(r.perf.speedup)} faster, ${fmtX(r.perf.memoryRatio)} less memory`;
  return `[![tsrs vs ${r.baseline.name}](https://img.shields.io/badge/tsrs-${esc(message)}-00a3a3)](https://github.com/majiayu000/tsrs-doctor)`;
}

export function renderMarkdown(r: Report): string {
  const out: string[] = [`# tsrs-doctor report`, "", `**${headline(r)}**`, ""];
  const b = badge(r);
  if (b) out.push(b, "", "<details><summary>Badge for your README</summary>", "", fence(b), "", "</details>", "");
  out.push(
    mdTable([
      ["", ""],
      ["project", `\`${r.tsconfig}\``],
      ["command", `\`<compiler> ${r.args.join(" ")}\``],
      ["baseline", `\`${r.baseline.version}\` (${r.baseline.source})`],
      ["tsrs", `\`${r.tsrs.version}\` (${r.tsrs.source})`],
      ["platform", r.platform],
      ["date", r.date],
    ]),
  );
  if (r.warnings.length) out.push("", ...r.warnings.map((w) => `> **Warning:** ${w}`));
  for (const c of r.crashes) out.push("", `## Crash: ${c.compiler} (${c.reason})`, "", fence(c.stderrTail));
  if (r.perf) {
    out.push(
      "",
      `## Performance`,
      "",
      `Median of ${r.runs} fresh runs each, interleaved, no incremental cache. Each compiler uses its default thread count unless the command says otherwise.`,
      "",
      mdTable(perfRows(r)),
    );
  }
  const d = r.diagnostics;
  out.push(
    "",
    `## Diagnostics`,
    "",
    mdTable([
      ["", "count"],
      [`${r.baseline.name} reported`, String(d.baselineCount)],
      ["tsrs reported", String(d.tsrsCount)],
      ["identical", String(d.same)],
      ["missing in tsrs", String(d.missing.length)],
      ["extra in tsrs", String(d.extra.length)],
      ["same file, line and code, different text", String(d.changed.length)],
    ]),
    "",
    "Diagnostics are matched by file, line and error code, so output order does not matter.",
  );
  if (d.goModeArgs) {
    out.push(
      `"gone in Go mode" means the difference disappears with \`tsrs ${d.goModeArgs.join(" ")}\` (checker order or lazy members, see the tsrs README).`,
    );
  }
  const section = (title: string, entries: DiffEntry[]) => {
    if (!entries.length) return;
    out.push("", `### ${title}`, "");
    for (const e of entries) out.push(`${tags(e).trim() || "persistent"}`, "", fence(e.text), "");
  };
  section("Missing in tsrs", d.missing);
  section("Extra in tsrs", d.extra);
  if (d.changed.length) {
    out.push("", "### Different text", "");
    for (const e of d.changed) {
      out.push(`${tags(e).trim() || "persistent"}`, "", `${r.baseline.name}:`, fence(e.baselineText), "tsrs:", fence(e.text), "");
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
