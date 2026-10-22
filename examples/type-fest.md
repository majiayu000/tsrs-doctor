# tsrs-doctor report

**tsrs is 3.1× faster and uses 4.0× less memory than tsgo on this repo, identical diagnostics**

|  |  |
| --- | --- |
| project | `tsconfig.json` |
| command | `<compiler> -p tsconfig.json --noEmit --pretty false` |
| baseline | `Version 7.1.0-dev.20260930.4` (tsrs-doctor) |
| tsrs | `Version 7.1.0-dev.20260930.4 (tsrs 0.18.0-ts7.1.0-dev.20260929, microsoft/TypeScript@b85298b6a81f)` (tsrs-doctor) |
| platform | darwin-arm64, 12 cores |
| date | 2026-10-22T03:39:59.805Z |

## Performance

Median of 5 fresh runs each, interleaved, no incremental cache. Each compiler uses its default thread count unless the command says otherwise.

|  | wall | cpu (user+sys) | peak RSS |
| --- | --- | --- | --- |
| tsgo | 7.17s (6.27s–7.47s) | 22.57s (21.37s–24.16s) | 7562 MiB (7212 MiB–7916 MiB) |
| tsrs | 2.29s (2.13s–2.61s) | 8.40s (8.28s–8.75s) | 1881 MiB (1877 MiB–1893 MiB) |
| tsrs vs tsgo | 3.1× faster |  | 4.0× less memory |

## Diagnostics

|  | count |
| --- | --- |
| tsgo reported | 0 |
| tsrs reported | 0 |
| identical | 0 |
| missing in tsrs | 0 |
| extra in tsrs | 0 |
| same file, line and code, different text | 0 |

Diagnostics are matched by file, line and error code, so output order does not matter.
