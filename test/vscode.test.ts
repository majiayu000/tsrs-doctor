import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parse } from "jsonc-parser";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DoctorError } from "../src/resolve.ts";
import { setupVscode, TSDK_DIR, undoVscode } from "../src/vscode.ts";

const SELF = resolve(import.meta.dir, "..");
const quiet = () => {};
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tsrs-doctor-vscode-"));
  // A project that has tsrs installed: reuse this repo's install.
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  symlinkSync(join(SELF, "node_modules", "tsrs"), join(root, "node_modules", "tsrs"));
  symlinkSync(join(SELF, "node_modules", "@tsrs"), join(root, "node_modules", "@tsrs"));
  symlinkSync(join(SELF, "node_modules", "tsrs", "bin", "tsrs"), join(root, "node_modules", ".bin", "tsrs"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const settingsPath = () => join(root, ".vscode", "settings.json");
const settings = () => parse(readFileSync(settingsPath(), "utf8"));

describe("vscode setup", () => {
  test("creates settings and a working shim, undo removes everything", () => {
    setupVscode(root, quiet);
    expect(settings()).toEqual({ "js/ts.tsdk.path": TSDK_DIR, "js/ts.experimental.useTsgo": true });
    const v = Bun.spawnSync([join(root, TSDK_DIR, "tsgo"), "--version"]).stdout.toString();
    expect(v).toContain("tsrs");
    undoVscode(root, quiet);
    expect(existsSync(settingsPath())).toBe(false);
    expect(existsSync(join(root, TSDK_DIR))).toBe(false);
  });

  test("keeps comments and other keys, restores previous values on undo", () => {
    mkdirSync(join(root, ".vscode"));
    const original = `{
  // keep me
  "editor.tabSize": 4,
  "js/ts.tsdk.path": "node_modules/typescript/lib",
}
`;
    writeFileSync(settingsPath(), original);
    setupVscode(root, quiet);
    const text = readFileSync(settingsPath(), "utf8");
    expect(text).toContain("// keep me");
    expect(settings()["editor.tabSize"]).toBe(4);
    expect(settings()["js/ts.tsdk.path"]).toBe(TSDK_DIR);
    expect(readFileSync(join(root, TSDK_DIR, "settings.json.bak"), "utf8")).toBe(original);

    // A change made after setup survives the undo.
    writeFileSync(settingsPath(), text.replace('"editor.tabSize": 4', '"editor.tabSize": 8'));
    undoVscode(root, quiet);
    expect(settings()).toEqual({ "editor.tabSize": 8, "js/ts.tsdk.path": "node_modules/typescript/lib" });
    expect(readFileSync(settingsPath(), "utf8")).toContain("// keep me");
  });

  test("running setup twice keeps the first backup", () => {
    mkdirSync(join(root, ".vscode"));
    writeFileSync(settingsPath(), `{ "js/ts.experimental.useTsgo": false }\n`);
    setupVscode(root, quiet);
    setupVscode(root, quiet);
    undoVscode(root, quiet);
    expect(settings()).toEqual({ "js/ts.experimental.useTsgo": false });
  });

  test("refuses a project without tsrs and invalid settings", () => {
    rmSync(join(root, "node_modules"), { recursive: true });
    expect(() => setupVscode(root, quiet)).toThrow(DoctorError);
    expect(existsSync(join(root, ".vscode"))).toBe(false);
  });

  test("refuses to touch an unparseable settings.json", () => {
    mkdirSync(join(root, ".vscode"));
    writeFileSync(settingsPath(), "{ not json");
    expect(() => setupVscode(root, quiet)).toThrow(DoctorError);
    expect(readFileSync(settingsPath(), "utf8")).toBe("{ not json");
  });

  test("undo without a backup is an error", () => {
    expect(() => undoVscode(root, quiet)).toThrow(DoctorError);
  });
});
