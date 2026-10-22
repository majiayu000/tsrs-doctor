import { describe, expect, test } from "bun:test";
import { alignDiagnostics, goneInGoMode, isUnstable, parseDiagnostics, unstableKeys } from "../src/diagnostics.ts";

describe("parseDiagnostics", () => {
  test("file, global, continuation and unrecognized lines", () => {
    const out = [
      "src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/b.ts(5,18): error TS2322: Type '{ a: number; }' is not assignable to type 'Foo'.",
      "  Types of property 'a' are incompatible.",
      "    Type 'number' is not assignable to type 'string'.",
      "error TS5110: Option 'module' must be set to 'NodeNext'.",
      "something unexpected",
      "",
    ].join("\n");
    const d = parseDiagnostics(out);
    expect(d.map((x) => x.kind)).toEqual(["file", "file", "global", "other"]);
    expect(d[0]).toMatchObject({ file: "src/a.ts", line: 1, col: 7, category: "error", code: 2322 });
    expect(d[1]!.text.split("\n")).toHaveLength(3);
    expect(d[2]).toMatchObject({ code: 5110, file: "" });
    expect(d[3]!.text).toBe("something unexpected");
  });

  test("normalizes Windows separators and strips an absolute cwd prefix", () => {
    const d = parseDiagnostics("/repo/src\\x.ts(2,1): error TS1005: ';' expected.", "/repo");
    expect(d[0]!.file).toBe("src/x.ts");
  });
});

const line = (file: string, l: number, code: number, msg = "m", col = 1) => `${file}(${l},${col}): error TS${code}: ${msg}`;

describe("alignDiagnostics", () => {
  test("order does not matter", () => {
    const a = parseDiagnostics([line("a.ts", 1, 1), line("b.ts", 2, 2)].join("\n"));
    const b = parseDiagnostics([line("b.ts", 2, 2), line("a.ts", 1, 1)].join("\n"));
    const r = alignDiagnostics(a, b);
    expect(r).toMatchObject({ same: 2, missing: [], extra: [], changed: [] });
  });

  test("classifies missing, extra and changed", () => {
    const base = parseDiagnostics([line("a.ts", 1, 2322, "x"), line("a.ts", 3, 7006), line("a.ts", 9, 1)].join("\n"));
    const tsrs = parseDiagnostics([line("a.ts", 1, 2322, "y"), line("a.ts", 9, 1), line("c.ts", 4, 4111)].join("\n"));
    const r = alignDiagnostics(base, tsrs);
    expect(r.same).toBe(1);
    expect(r.missing.map((d) => d.code)).toEqual([7006]);
    expect(r.extra.map((d) => d.code)).toEqual([4111]);
    expect(r.changed).toHaveLength(1);
    expect(r.changed[0]!.baseline.text).toBe("x");
    expect(r.changed[0]!.tsrs.text).toBe("y");
  });

  test("a column change on the same line and code is 'changed', not missing+extra", () => {
    const r = alignDiagnostics(parseDiagnostics(line("a.ts", 1, 2322, "m", 3)), parseDiagnostics(line("a.ts", 1, 2322, "m", 5)));
    expect(r.changed).toHaveLength(1);
    expect(r.missing.length + r.extra.length).toBe(0);
  });

  test("duplicates are counted, not collapsed", () => {
    const base = parseDiagnostics([line("a.ts", 1, 1), line("a.ts", 1, 1)].join("\n"));
    const tsrs = parseDiagnostics(line("a.ts", 1, 1));
    const r = alignDiagnostics(base, tsrs);
    expect(r.same).toBe(1);
    expect(r.missing).toHaveLength(1);
  });

  test("continuation lines are part of the identity", () => {
    const base = parseDiagnostics([line("a.ts", 1, 2322), "  Type 'A' vs 'B'."].join("\n"));
    const tsrs = parseDiagnostics([line("a.ts", 1, 2322), "  Type 'B' vs 'A'."].join("\n"));
    expect(alignDiagnostics(base, tsrs).changed).toHaveLength(1);
  });
});

describe("unstableKeys", () => {
  test("flags diagnostics that differ between baseline runs", () => {
    const r1 = parseDiagnostics([line("a.ts", 1, 1), line("a.ts", 2, 2)].join("\n"));
    const r2 = parseDiagnostics(line("a.ts", 1, 1));
    const u = unstableKeys([r1, r2]);
    expect(isUnstable(r1[0]!, u)).toBe(false);
    expect(isUnstable(r1[1]!, u)).toBe(true);
  });

  test("a single run is never unstable", () => {
    expect(unstableKeys([parseDiagnostics(line("a.ts", 1, 1))]).size).toBe(0);
  });
});

describe("goneInGoMode", () => {
  test("only differences left in the Go-mode alignment persist", () => {
    const base = parseDiagnostics([line("a.ts", 1, 1, "x"), line("a.ts", 2, 2)].join("\n"));
    const tsrsDefault = parseDiagnostics([line("a.ts", 1, 1, "y"), line("a.ts", 5, 4111)].join("\n"));
    const tsrsGo = parseDiagnostics([line("a.ts", 1, 1, "x"), line("a.ts", 5, 4111)].join("\n"));
    const def = alignDiagnostics(base, tsrsDefault);
    const gone = goneInGoMode(alignDiagnostics(base, tsrsGo));
    expect(gone(def.changed[0]!.baseline, "changed")).toBe(true);
    expect(gone(def.missing[0]!, "missing")).toBe(false);
    expect(gone(def.extra[0]!, "extra")).toBe(false);
  });
});
