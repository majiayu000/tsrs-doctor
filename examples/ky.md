# tsrs-doctor report

**tsrs is 1.9× faster and uses 1.6× less memory than tsgo on this repo, identical diagnostics**

|  |  |
| --- | --- |
| project | `tsconfig.json` |
| command | `<compiler> -p tsconfig.json --noEmit --pretty false` |
| baseline | `Version 7.1.0-dev.20260930.4` (tsrs-doctor) |
| tsrs | `Version 7.1.0-dev.20260930.4 (tsrs 0.18.0-ts7.1.0-dev.20260929, microsoft/TypeScript@b85298b6a81f)` (tsrs-doctor) |
| platform | darwin-arm64, 12 cores |
| date | 2026-10-22T03:40:00.314Z |

## Performance

Median of 5 fresh runs each, interleaved, no incremental cache. Each compiler uses its default thread count unless the command says otherwise.

|  | wall | cpu (user+sys) | peak RSS |
| --- | --- | --- | --- |
| tsgo | 0.06s (0.05s–0.07s) | 0.13s (0.12s–0.15s) | 67 MiB (66 MiB–68 MiB) |
| tsrs | 0.03s (0.03s–0.04s) | 0.08s (0.07s–0.08s) | 42 MiB (42 MiB–44 MiB) |
| tsrs vs tsgo | 1.9× faster |  | 1.6× less memory |

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
