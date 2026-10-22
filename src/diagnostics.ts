// Parse `--pretty false` compiler output and align two diagnostic sets by (file, line, code).

export interface Diagnostic {
  kind: "file" | "global" | "other";
  file: string;
  line: number;
  col: number;
  category: string;
  code: number;
  /** Header message plus indented continuation lines (message chain, related info). */
  text: string;
}

const FILE_RE = /^(.+?)\((\d+),(\d+)\): (error|warning|message|suggestion) TS(\d+): (.*)$/;
const GLOBAL_RE = /^(error|warning|message|suggestion) TS(\d+): (.*)$/;

export function parseDiagnostics(output: string, cwd?: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const prefix = cwd ? toSlash(cwd).replace(/\/?$/, "/") : undefined;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line === "") continue;
    const last = out[out.length - 1];
    if (/^\s/.test(line) && last && last.kind !== "other") {
      last.text += "\n" + line.trim();
      continue;
    }
    let m = FILE_RE.exec(line);
    if (m) {
      let file = toSlash(m[1]!);
      if (prefix && file.startsWith(prefix)) file = file.slice(prefix.length);
      out.push({ kind: "file", file, line: +m[2]!, col: +m[3]!, category: m[4]!, code: +m[5]!, text: m[6]! });
      continue;
    }
    m = GLOBAL_RE.exec(line);
    if (m) {
      out.push({ kind: "global", file: "", line: 0, col: 0, category: m[1]!, code: +m[2]!, text: m[3]! });
      continue;
    }
    // Unrecognized output is kept and compared verbatim so nothing is dropped silently.
    out.push({ kind: "other", file: "", line: 0, col: 0, category: "", code: 0, text: line.trim() });
  }
  return out;
}

function toSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

export function formatDiagnostic(d: Diagnostic): string {
  if (d.kind === "other") return d.text;
  const head = `${d.category} TS${d.code}: ${d.text}`;
  return d.kind === "file" ? `${d.file}(${d.line},${d.col}): ${head}` : head;
}

export function diagKey(d: Diagnostic): string {
  return `${d.kind}\0${d.file}\0${d.line}\0${d.code}`;
}

function exactKey(d: Diagnostic): string {
  return `${diagKey(d)}\0${d.col}\0${d.category}\0${d.text}`;
}

export interface Changed {
  baseline: Diagnostic;
  tsrs: Diagnostic;
}

export interface Alignment {
  same: number;
  /** In the baseline only: tsrs misses it. */
  missing: Diagnostic[];
  /** In tsrs only. */
  extra: Diagnostic[];
  /** Same file, line and code, different column or text. */
  changed: Changed[];
}

export function alignDiagnostics(baseline: Diagnostic[], tsrs: Diagnostic[]): Alignment {
  const groups = new Map<string, { b: Diagnostic[]; t: Diagnostic[] }>();
  const group = (d: Diagnostic) => {
    const k = diagKey(d);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { b: [], t: [] }));
    return g;
  };
  for (const d of baseline) group(d).b.push(d);
  for (const d of tsrs) group(d).t.push(d);

  const result: Alignment = { same: 0, missing: [], extra: [], changed: [] };
  for (const { b, t } of groups.values()) {
    const rest = [...t];
    const unmatched: Diagnostic[] = [];
    for (const d of b) {
      const i = rest.findIndex((x) => exactKey(x) === exactKey(d));
      if (i >= 0) {
        rest.splice(i, 1);
        result.same++;
      } else {
        unmatched.push(d);
      }
    }
    const n = Math.min(unmatched.length, rest.length);
    for (let i = 0; i < n; i++) result.changed.push({ baseline: unmatched[i]!, tsrs: rest[i]! });
    result.missing.push(...unmatched.slice(n));
    result.extra.push(...rest.slice(n));
  }
  const byPos = (a: Diagnostic, b: Diagnostic) =>
    a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col || a.code - b.code;
  result.missing.sort(byPos);
  result.extra.sort(byPos);
  result.changed.sort((a, b) => byPos(a.baseline, b.baseline));
  return result;
}

export function hasDifferences(a: Alignment): boolean {
  return a.missing.length + a.extra.length + a.changed.length > 0;
}

/** Diagnostics (by exact identity) that do not appear in every run. */
export function unstableKeys(runs: Diagnostic[][]): Set<string> {
  const unstable = new Set<string>();
  if (runs.length < 2) return unstable;
  const counts = runs.map((r) => countBy(r, exactKey));
  const all = new Set(counts.flatMap((c) => [...c.keys()]));
  for (const k of all) {
    const first = counts[0]!.get(k) ?? 0;
    if (counts.some((c) => (c.get(k) ?? 0) !== first)) unstable.add(k);
  }
  return unstable;
}

export function isUnstable(d: Diagnostic, unstable: Set<string>): boolean {
  return unstable.has(exactKey(d));
}

export type Side = "missing" | "extra" | "changed";

/** Returns a predicate: does this default-mode difference disappear when tsrs runs in Go mode? */
export function goneInGoMode(goAlign: Alignment): (d: Diagnostic, side: Side) => boolean {
  const baselineLeft = new Set([...goAlign.missing, ...goAlign.changed.map((c) => c.baseline)].map(exactKey));
  const tsrsLeft = new Set([...goAlign.extra, ...goAlign.changed.map((c) => c.tsrs)].map(exactKey));
  const groupsLeft = new Set(
    [...goAlign.missing, ...goAlign.extra, ...goAlign.changed.map((c) => c.baseline)].map(diagKey),
  );
  return (d, side) => {
    if (side === "missing") return !baselineLeft.has(exactKey(d));
    if (side === "extra") return !tsrsLeft.has(exactKey(d));
    return !groupsLeft.has(diagKey(d));
  };
}

function countBy<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return m;
}
