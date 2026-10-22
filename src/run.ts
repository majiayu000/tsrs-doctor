// Run a compiler once and measure wall time, CPU time and peak RSS.

export interface RunResult {
  wallMs: number;
  cpuMs: number;
  maxRssBytes: number;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export async function runOnce(bin: string, args: string[], cwd: string, timeoutSec: number): Promise<RunResult> {
  const start = performance.now();
  const proc = Bun.spawn([bin, ...args], { cwd, stdout: "pipe", stderr: "pipe", timeout: timeoutSec * 1000 });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  await proc.exited;
  const wallMs = performance.now() - start;
  const usage = proc.resourceUsage();
  if (!usage) throw new Error(`no resource usage reported for ${bin}`);
  return {
    wallMs,
    cpuMs: Number(usage.cpuTime.total) / 1000,
    maxRssBytes: usage.maxRSS,
    exitCode: proc.exitCode,
    signal: proc.signalCode === null ? null : String(proc.signalCode),
    timedOut: proc.signalCode !== null && wallMs >= timeoutSec * 1000,
    stdout,
    stderr,
  };
}

/** tsc-style compilers exit 0 (clean), 1 or 2 (diagnostics reported). Anything else is a crash. */
export function crashReason(r: RunResult): string | undefined {
  if (r.timedOut) return "timed out";
  if (r.signal) return `killed by ${r.signal}`;
  if (r.exitCode !== 0 && r.exitCode !== 1 && r.exitCode !== 2) return `exit code ${r.exitCode}`;
  if (/\bpanic(ked)?\b/i.test(r.stderr)) return "panic in stderr";
  return undefined;
}

export interface Stats {
  median: number;
  min: number;
  max: number;
}

export function stats(values: number[]): Stats {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const median = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return { median, min: s[0]!, max: s[s.length - 1]! };
}
