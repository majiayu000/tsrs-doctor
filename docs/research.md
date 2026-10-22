# 调研：tsrs 上游与竞品（2026-10-22 实查）

## 1. 上游 tsrs

| 项 | 实查结果 |
|---|---|
| 仓库 | `oxc-project/tsrs`（选题报告写的 "Cloudflare 的" 不准确：仓库在 Oxc 名下，公告发在 Cloudflare 博客，作者 Max Schwenk，赞助方 Owner.com / Depot） |
| 定位 | "drop-in replacement for the TypeScript 7 compiler and language server, written in Rust" |
| 热度 | 1,785★（10-22），仓库 10-01 创建 |
| 最新版 | `0.18.0-ts7.1.0-dev.20260929`（10-19），13 天内发了 18 个 0.x 版本 |
| 对齐目标 | `microsoft/TypeScript` main，pin `b85298b6a81f`，对应 `typescript@7.1.0-dev.20260930.4`（release binary 的 `--version` 直接报这个版本） |
| 平台 | darwin-arm64、linux x64/arm64（gnu/musl）。**没有 Windows、没有 Intel Mac**（#676） |
| PR 政策 | 不接受 PR，只收 issue（"Please include a minimal reproduction"） |
| 许可 | Apache-2.0 |

### 和本工具相关的事实

- **CLI 与 tsc 同形**：`tsrs -p . --noEmit`，诊断格式与 tsgo 完全相同（`file(line,col): error TSxxxx: msg`），实测在玩具项目上逐字节一致。
- **顺序问题是已知的**：README 原话大意是 tsgo 的诊断会随并行解析/检查顺序变化，而 tsrs 默认把部分 checker 历史规范化；要最接近的比较用 `--checkerAssignment go --noLazyMembers`，并且对齐 `--checkers`。→ 直接 `diff` 两份输出没有意义，必须按位置和错误码归并；还要能区分"换成 Go 模式就消失"的差异。
- **已知真差异**：#649（drizzle-orm `SQLiteTable["$inferInsert"]`，默认模式多报 TS4111，加 `--noLazyMembers` 消失）；#373 top-400 仓库里 18 个不一致，大多是对象字面量联合属性顺序（已由上游 PR 修），backstage 少报 TS2322、vuejs/core 多报 TS6307。
- **性能工具**：`--checkers N`、`--singleThreaded`、`--maxMemory`、`--extendedDiagnostics`；默认 checker 数 = 每核一个（≤16），tsgo 默认 4。比较速度时线程数默认不同，报告里必须写明。
- **npm 布局**：`tsrs` 包的 `bin` 只有 `tsrs`（node 启动器），真二进制在 `@tsrs/<os>-<arch>[-gnu|-musl]/tsrs`；包内有 `lib/getExePath.js`（处理 `TSRS_BINARY` 和 libc）。`typescript@7` 的 `bin` 是 `tsc`，真二进制在 `@typescript/typescript-<os>-<arch>/lib/tsc`，同样有 `lib/getExePath.js`（未在 exports 中导出）。

### 编辑器集成痛点（#661，10-21 开，P3，无修复）

VS Code 的 TypeScript 7 扩展（`TypeScriptTeam.native-preview` 1.0.1，源码 `microsoft/TypeScript/packages/vscode-typescript/src/util.ts`）这样找可执行文件：

1. 读 `js/ts.tsdk.path`（也认 `typescript.tsdk`、`typescript.native-preview.tsdk`），相对路径按工作区根解析；
2. 目录（或其父目录）有 `package.json` 且 `bin` 里有 `tsgo`（包名是 `typescript` 时要 `tsc`）→ 用对应平台包里的二进制；
3. 否则目录里有名为 `tsc` / `tsgo` 的文件就直接启动它（`--lsp --stdio`）。
4. 工作区级 tsdk 需要 **workspace trust + 用户点一次同意**（存在 workspaceState 的 `typescript.native-preview.useWorkspaceTsdk`）。

`tsrs` 包两条都不满足，官方文档的方案是手工在 `~/.tsrs-tsdk/tsgo` 建 symlink 并写**用户级**设置——每台机器、每个人重做一遍，且绑死绝对路径。issue 作者的做法是在仓库里提交一个两行 shell 脚本。另外，内置 TS 扩展需要 `js/ts.experimental.useTsgo: true` 才让位给 TS7 扩展（`microsoft/vscode` `typescript-language-features/src/commands/useTsgo.ts`）。

## 2. 配套仓库（`tsrs created:>2026-10-01`，27 个，真正相关的 9 个）

| 仓库 | ★ | 做什么 | 与本工具关系 |
|---|---|---|---|
| maschwenk/tsrslint | 25 | tsgolint 的 tsrs 移植 | 无重叠 |
| sxzz/tsrs-playground | 3 | 浏览器 playground（WASM） | 无重叠 |
| marcoroth/tsrs-ruby | 2 | Ruby 绑定 | 无重叠 |
| nstudio/ns-tsrs | 1 | NativeScript 集成 | 无重叠 |
| cmsommer/zed-tsrs | 0 | Zed 编辑器配置（无描述） | 编辑器方向，仅 Zed |
| sdneon/tsrs-transpile | 0 | 转译打包 | 无重叠 |
| maschwenk/typescript-go-tsrs | 0 | 作者的 Go 回移植实验 | 内部 |
| bbylw/tsrs-cn | 0 | README 中文翻译 | 无 |
| RomainLanz/tsrs-type-issue | 0 | 某个 issue 的复现 | 无 |

结论：**没有任何"在我的仓库上跑一下对比"的用户侧工具，也没有解决 #661 的工具。**

## 3. 对比/benchmark 类竞品

| 工具 | ★ | 做法 | 缺什么 |
|---|---|---|---|
| 上游 `bench/run.py` | — | Python，固定 6+13 个 pin 了 commit 的项目，报 wall/peak RSS/错误数，CI 出 SVG | 只跑上游选的项目；要 clone tsrs 源码并 `cargo build`；不报具体诊断差异 |
| 上游 `tools/repo-conformance`（#373） | — | top-400 仓库一致性 CI | 内部脚本，不面向用户 |
| danfry1/ts-checker-bench（10-18） | 1 | Node 脚本，固定 3 个项目（type-fest/outline/vscode）× 5 个 checker，7 次中位数，诊断"归一化后比较 +n/−m" | 也是固定项目集，不是"你的仓库"；不配编辑器 |
| beerose/tsc-diagnostics-diff-action | 70 | GitHub Action，对比 PR 前后 tsc 诊断 | 2023 年的，同一编译器前后对比，不认识 tsrs/tsgo |
| tsc-baseline | 16 | 记录已有错误基线 | 不同问题 |
| Bashamega/tsgo-vs-tsc、LF3551/typescript-7-vs-6-benchmark、greg00ry/tsgo-benchmark-demo、idealjs/ts-go-rust-bench | 0 | 一次性 benchmark 仓库 | 不可复用 |

可借鉴的方法：
- 上游和 ts-checker-bench 都用 **fresh process、无增量缓存、多次取中位数、报 peak RSS**，并写明线程数。
- ts-checker-bench 的诊断比较是"归一化后 +n / −m"；本工具再细分出"同位置同错误码但文本不同"和"Go 模式下消失"两类，直接对应上游 triage 的问题类型。
- 上游 issue 模板要求最小复现 + 两边输出 + 版本行，报告的 Markdown 应该直接给出这些。

## 4. 功能矩阵

| 能力 | tsrs-doctor | 上游 bench/run.py | ts-checker-bench | tsc-diagnostics-diff-action | 手工 |
|---|---|---|---|---|---|
| 在任意用户仓库上跑 | ✅ 一条命令 | ❌ 固定项目 | ❌ 固定项目 | ✅（单编译器） | ✅ |
| 无需 clone/编译 tsrs | ✅ | ❌ | ✅ | — | ✅ |
| 诊断按 文件+行+错误码 归并 | ✅ | ❌ 只比数量 | 部分（+n/−m） | 部分 | ❌ |
| 区分 tsgo 自身不稳定 / Go 模式消失 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 墙钟 + CPU + 峰值 RSS 中位数 | ✅ | ✅ | ✅ | ❌ | 手动 `time -l` |
| 版本 pin 一致性检查 | ✅ | ✅ | 部分 | ❌ | ❌ |
| VS Code 配置（可提交、可回滚） | ✅ | ❌ | ❌ | ❌ | 手工 symlink |
| JSON / Markdown 报告 | ✅ | ✅ | ✅ | PR 评论 | ❌ |
| GitHub Action / PR 评论 | ⏳ 后续 | CI 内部 | ❌ | ✅ | ❌ |

## 5. 结论

1. 窗口确实开着：配套仓库没有一个做用户侧对比或编辑器接入。
2. 唯一接近的是 ts-checker-bench（10-18 发布，1★），它回答"tsrs 总体有多快"，本工具回答"**我的**仓库能不能换"。
3. 最强的差异化是两件上游明确不做的事：诊断归并 + 按上游 triage 口径分类；#661 的可提交、可回滚 VS Code 配置。
4. 风险：上游可能在包里加 `tsgo` shim 修掉 #661（triage bot 已经指出改法）。诊断对比这部分不受影响，VS Code 子命令届时改为只写 settings。
