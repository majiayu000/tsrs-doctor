# tsrs-doctor

**Can your repo switch to [tsrs](https://github.com/oxc-project/tsrs)? One command runs tsgo and tsrs on your own project and tells you whether the diagnostics match, how much faster it is and how much memory it saves. A second command wires tsrs into VS Code.**

```sh
bunx tsrs-doctor
```

```
performance, median of 5 runs:
                wall                 cpu (user+sys)          peak RSS
  tsgo          7.17s (6.27s–7.47s)  22.57s (21.37s–24.16s)  7562 MiB (7212 MiB–7916 MiB)
  tsrs          2.29s (2.13s–2.61s)  8.40s (8.28s–8.75s)     1881 MiB (1877 MiB–1893 MiB)
  tsrs vs tsgo  3.1× faster                                  4.0× less memory

diagnostics: tsgo 0, tsrs 0; same 0, missing in tsrs 0, extra in tsrs 0, text differs 0

tsrs is 3.1× faster and uses 4.0× less memory than tsgo on this repo, identical diagnostics
```

(type-fest, Apple Silicon. More in [`examples/`](examples).)

## Why

The tsrs README asks users for feedback on performance, memory and conformance, but you can't get a useful answer from `diff`ing two compiler outputs:

- tsgo's diagnostic order changes from run to run, so a plain diff is mostly noise.
- Some differences come from checker order or lazy members and go away with `--checkerAssignment go --noLazyMembers`. Others are real.
- Your project's tsgo nightly may not be the TypeScript commit that tsrs ports.
- Running the npm launchers adds Node startup time and measures Node's memory, not the compiler's.

tsrs-doctor handles all four.

## What it does

1. **Finds both compilers.** It uses the project's own `tsrs` and `typescript@7` / `@typescript/native-preview` when they are installed. Otherwise it falls back to the pair it bundles: tsrs 0.18.0 and the exact TypeScript 7.1 nightly that tsrs ports. It always runs the native binaries directly.
2. **Times them fairly.** Runs alternate between the two compilers (`--runs`, default 3), each in a fresh process with `--noEmit` and no incremental cache. It reports the median and range of wall time, CPU time and peak RSS.
3. **Aligns diagnostics by file, line and error code**, so output order doesn't matter. Each difference is classified as missing in tsrs, extra in tsrs, or same place with different text. Differences can also be tagged:
   - *baseline unstable*: tsgo itself didn't agree across runs.
   - *gone in Go mode*: tsrs re-run with `--checkerAssignment go --noLazyMembers --checkers 4` no longer differs.

   An untagged difference is the kind worth [reporting upstream](https://github.com/oxc-project/tsrs/issues).
4. **Warns about version skew** between the TypeScript commit tsrs ports and your tsgo.
5. **Writes reports**: `--json` for CI and `--md` to paste into an issue.

Exit codes: `0` identical diagnostics, `1` differences or a crash/timeout, `2` tool error.

## Install

Requires [Bun](https://bun.sh), which reads child-process peak memory directly. macOS arm64 or Linux, the platforms tsrs ships binaries for.

```sh
bunx tsrs-doctor                 # no install
bun add -d tsrs-doctor           # or keep it in the project
```

## Usage

```
tsrs-doctor [dir] [options] [-- <compiler args>]
tsrs-doctor vscode [dir] [--undo]

  -p, --project <path>   tsconfig, relative to dir (default: tsconfig.json)
      --runs <n>         timed runs per compiler (default: 3)
      --tsrs <bin>       native tsrs binary (default: auto-detect)
      --baseline <bin>   baseline compiler, tsgo or tsc (default: auto-detect)
      --timeout <sec>    per-run timeout (default: 600)
      --json <file>      full report as JSON
      --md <file>        full report as Markdown
  -- <args>              passed to both compilers, e.g. -- --checkers 4
```

For a solution-style `tsconfig.json` (only `references`), point `-p` at a referenced project. tsrs-doctor warns when nothing would be checked.

## VS Code

The TypeScript 7 extension looks for an executable named `tsgo` or `tsc` in `js/ts.tsdk.path`, and the `tsrs` package ships neither ([oxc-project/tsrs#661](https://github.com/oxc-project/tsrs/issues/661)). The documented workaround is a hand-made symlink in your home directory, redone on every machine.

```sh
bun add -d tsrs
bunx tsrs-doctor vscode
```

This writes two things:

- `.vscode/tsrs-tsdk/tsgo`: a three-line `sh` script that runs `node_modules/.bin/tsrs`. It contains no absolute paths, so you can commit it and every teammate gets the tsrs from the lockfile.
- Two keys merged into `.vscode/settings.json`, keeping your comments and other settings: `"js/ts.tsdk.path": ".vscode/tsrs-tsdk"` and `"js/ts.experimental.useTsgo": true`.

Before it writes anything, it backs up the original settings into `.vscode/tsrs-tsdk/` (git-ignored). Afterwards it checks that the shim really starts tsrs. `tsrs-doctor vscode --undo` puts back the previous values of those two keys, leaves any other edits you made, and removes the directory.

In VS Code: install `TypeScriptTeam.native-preview`, trust the workspace, accept the prompt to use the workspace version, then run "TypeScript 7: Restart Server".

## Example results

| project | config | tsgo | tsrs | speed | memory | diagnostics |
|---|---|---|---|---|---|---|
| [type-fest](examples/type-fest.md) | `tsconfig.json` | 7.17s / 7562 MiB | 2.29s / 1881 MiB | 3.1× | 4.0× | identical (0) |
| [hono](examples/hono-pinned.md) | `tsconfig.spec.json` | 0.10s / 196 MiB | 0.05s / 94 MiB | 1.8× | 2.1× | identical (6) |
| [ky](examples/ky.md) | `tsconfig.json` | 0.06s / 67 MiB | 0.03s / 42 MiB | 1.9× | 1.6× | identical (0) |

Measured on an Apple Silicon Mac, 2026-10-22, against `typescript@7.1.0-dev.20260930.4`, the nightly tsrs 0.18.0 ports.

hono shows why the version check matters. Its own `@typescript/native-preview@7.0.0-dev.20260210` [disagrees with tsrs on 3 diagnostics](examples/hono.md). Against the matching 7.1 nightly the diagnostics are identical, so all 3 come from TypeScript changes between the two nightlies, not from tsrs. Two of them are a 7.1 regression ([microsoft/TypeScript#64431](https://github.com/microsoft/TypeScript/issues/64431), first reported against tsrs as oxc-project/tsrs#664) that tsrs faithfully ports.

## License

MIT
