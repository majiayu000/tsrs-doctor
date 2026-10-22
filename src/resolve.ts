// Locate the native tsrs binary and a baseline compiler (tsgo / TS 7 tsc, or a TS 5/6 tsc).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface Compiler {
  name: string;
  bin: string;
  version: string;
  /** Where it was found: "--tsrs", "project", "tsrs-doctor". */
  source: string;
  /** Baseline is a TS 5/6 JavaScript tsc, which tsrs does not target. */
  legacy?: boolean;
}

export class DoctorError extends Error {}

const SELF_DIR = resolve(import.meta.dir, "..");

function findPackageDir(from: string, name: string): string | undefined {
  let dir = resolve(from);
  while (true) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function readVersion(pkgDir: string): string {
  return JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
}

async function exeFromPackage(pkgDir: string): Promise<string> {
  const helper = join(pkgDir, "lib", "getExePath.js");
  if (!existsSync(helper)) throw new DoctorError(`${pkgDir} has no lib/getExePath.js; is this a native TypeScript 7 / tsrs package?`);
  const mod = await import(pathToFileURL(helper).href);
  try {
    return mod.default();
  } catch (e) {
    throw new DoctorError(`${pkgDir}: ${(e as Error).message}`);
  }
}

export function binaryVersion(bin: string): string {
  const r = Bun.spawnSync([bin, "--version"], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) {
    throw new DoctorError(`${bin} --version failed (exit ${r.exitCode}): ${r.stderr.toString().trim()}`);
  }
  return r.stdout.toString().trim();
}

function checkExplicit(bin: string, flag: string): string {
  const abs = resolve(bin);
  if (!existsSync(abs)) throw new DoctorError(`${flag} ${bin}: file not found`);
  return abs;
}

export async function resolveTsrs(projectDir: string, explicit?: string): Promise<Compiler> {
  if (explicit) {
    const bin = checkExplicit(explicit, "--tsrs");
    return { name: "tsrs", bin, version: binaryVersion(bin), source: "--tsrs" };
  }
  for (const [from, source] of [[projectDir, "project"], [SELF_DIR, "tsrs-doctor"]] as const) {
    const pkg = findPackageDir(from, "tsrs");
    if (!pkg) continue;
    const bin = await exeFromPackage(pkg);
    return { name: "tsrs", bin, version: binaryVersion(bin), source };
  }
  throw new DoctorError("tsrs not found. Install it with `bun add -d tsrs` or pass --tsrs <path to native binary>.");
}

export async function resolveBaseline(projectDir: string, explicit?: string): Promise<Compiler> {
  if (explicit) {
    const bin = checkExplicit(explicit, "--baseline");
    const version = binaryVersion(bin);
    // A TS 5/6 tsc works as a baseline, but tsrs ports TypeScript 7, so the caller warns about it.
    const legacy = Number(tsVersionOf(version)?.split(".")[0]) < 7;
    return { name: legacy ? "tsc" : "tsgo", bin, version, source: "--baseline", legacy };
  }
  for (const [from, source] of [[projectDir, "project"], [SELF_DIR, "tsrs-doctor"]] as const) {
    const ts = findPackageDir(from, "typescript");
    const pkg = ts && Number(readVersion(ts).split(".")[0]) >= 7 ? ts : findPackageDir(from, "@typescript/native-preview");
    if (!pkg) continue;
    const bin = await exeFromPackage(pkg);
    return { name: "tsgo", bin, version: binaryVersion(bin), source };
  }
  throw new DoctorError(
    "No TypeScript 7 compiler found. Install `typescript@7` or `@typescript/native-preview`, or pass --baseline <path>.",
  );
}

/** "Version 7.1.0-dev.20260930.4 (tsrs ...)" -> "7.1.0-dev.20260930.4" */
export function tsVersionOf(versionLine: string): string | undefined {
  return /Version (\S+)/.exec(versionLine)?.[1];
}
