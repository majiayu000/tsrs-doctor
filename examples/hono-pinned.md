# tsrs-doctor report

**tsrs is 1.8× faster and uses 2.1× less memory than tsgo on this repo, identical diagnostics**

|  |  |
| --- | --- |
| project | `tsconfig.spec.json` |
| command | `<compiler> -p tsconfig.spec.json --noEmit --pretty false` |
| baseline | `Version 7.1.0-dev.20260930.4` (--baseline) |
| tsrs | `Version 7.1.0-dev.20260930.4 (tsrs 0.18.0-ts7.1.0-dev.20260929, microsoft/TypeScript@b85298b6a81f)` (tsrs-doctor) |
| platform | darwin-arm64, 12 cores |
| date | 2026-10-22T03:40:32.620Z |

## Performance

Median of 3 fresh runs each, interleaved, no incremental cache. Each compiler uses its default thread count unless the command says otherwise.

|  | wall | cpu (user+sys) | peak RSS |
| --- | --- | --- | --- |
| tsgo | 0.10s (0.10s–0.22s) | 0.52s (0.48s–0.58s) | 196 MiB (195 MiB–196 MiB) |
| tsrs | 0.05s (0.04s–0.14s) | 0.27s (0.22s–0.45s) | 94 MiB (94 MiB–196 MiB) |
| tsrs vs tsgo | 1.8× faster |  | 2.1× less memory |

## Diagnostics

|  | count |
| --- | --- |
| tsgo reported | 6 |
| tsrs reported | 6 |
| identical | 6 |
| missing in tsrs | 0 |
| extra in tsrs | 0 |
| same file, line and code, different text | 0 |

Diagnostics are matched by file, line and error code, so output order does not matter.
