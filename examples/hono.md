# tsrs-doctor report

**tsrs is 5.3× faster and uses 2.7× less memory than tsgo on this repo, 3 diagnostic differences**

|  |  |
| --- | --- |
| project | `tsconfig.spec.json` |
| command | `<compiler> -p tsconfig.spec.json --noEmit --pretty false` |
| baseline | `Version 7.0.0-dev.20260210.1` (project) |
| tsrs | `Version 7.1.0-dev.20260930.4 (tsrs 0.18.0-ts7.1.0-dev.20260929, microsoft/TypeScript@b85298b6a81f)` (tsrs-doctor) |
| platform | darwin-arm64, 12 cores |
| date | 2026-10-22T03:40:22.344Z |

> **Warning:** tsrs ports TypeScript 7.1.0-dev.20260930.4 but the baseline is 7.0.0-dev.20260210.1; some differences may come from TypeScript itself.

## Performance

Median of 5 fresh runs each, interleaved, no incremental cache. Each compiler uses its default thread count unless the command says otherwise.

|  | wall | cpu (user+sys) | peak RSS |
| --- | --- | --- | --- |
| tsgo | 0.79s (0.73s–0.88s) | 3.34s (2.90s–3.34s) | 741 MiB (719 MiB–750 MiB) |
| tsrs | 0.15s (0.14s–0.15s) | 0.74s (0.72s–0.81s) | 270 MiB (270 MiB–271 MiB) |
| tsrs vs tsgo | 5.3× faster |  | 2.7× less memory |

## Diagnostics

|  | count |
| --- | --- |
| tsgo reported | 5 |
| tsrs reported | 6 |
| identical | 4 |
| missing in tsrs | 1 |
| extra in tsrs | 2 |
| same file, line and code, different text | 0 |

Diagnostics are matched by file, line and error code, so output order does not matter.
"gone in Go mode" means the difference disappears with `tsrs --checkerAssignment go --noLazyMembers --checkers 4` (checker order or lazy members, see the tsrs README).

### Missing in tsrs

persistent

```
src/jsx/index.test.tsx(191,9): error TS2322: Type '({ buffer }: HtmlEscapedCallbackOpts) => void' is not assignable to type 'HtmlEscapedCallback'.
Type 'void' is not assignable to type 'Promise<string> | undefined'.
```

### Extra in tsrs

persistent

```
src/helper/css/index.ts(192,31): error TS7031: Binding element 'children' implicitly has an 'any' type.
```

persistent

```
src/helper/css/index.ts(192,41): error TS7031: Binding element 'nonce' implicitly has an 'any' type.
```
