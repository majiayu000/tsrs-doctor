# 设计：tsrs-doctor

一句话：在你自己的 TS 仓库上，一条命令回答"能不能换成 tsrs"：诊断是否一致、快多少、省多少内存，再顺手把 VS Code 接好。

## 1. 实现语言：TypeScript on Bun

选 TS on Bun，不选 Rust，理由：

- **交付快**：工具本身只做"起子进程、解析文本、写报告"，没有性能瓶颈；Bun 直接跑 `.ts`，没有构建步骤，10-27 前能发。
- **测内存不用外部命令**：`Bun.spawn(...).resourceUsage()` 直接给出子进程的 `maxRSS`（字节）和 CPU 时间（wait4 rusage）。Node 拿不到子进程 rusage，只能依赖 `/usr/bin/time`，而它在 macOS 和 Linux 上的参数和输出格式都不一样。
- **分发对口**：用户本来就在 npm 生态里装 `tsrs`。`bunx tsrs-doctor` 一条命令，依赖里自带一对**版本互相匹配**的 `tsrs` + `typescript@7`，项目里没装也能跑。
- Rust 的优势（单二进制）在这里用不上，反而要处理多平台打包和 npm 分发，拖慢发布。

代价：用户需要安装 Bun（README 写明）。Windows 不支持，因为 tsrs 本身就没有 Windows 二进制。

## 2. 命令行接口

```
tsrs-doctor [dir] [options]          # 对比（默认）
tsrs-doctor vscode [dir] [--undo]    # 写入 / 回滚 VS Code 配置

对比选项
  -p, --project <path>   tsconfig，相对 dir（默认 tsconfig.json）
  --runs <n>             每个编译器计时几次，取中位数（默认 3）
  --tsrs <bin>           tsrs 原生二进制（默认自动查找）
  --baseline <bin>       参照编译器 tsgo / tsc（默认自动查找）
  --timeout <sec>        单次运行超时（默认 600）
  --json <file>          写 JSON 报告
  --md <file>            写 Markdown 报告
  -- <args...>           原样传给两个编译器（例如 -- --checkers 4）
```

退出码：`0` 诊断完全一致；`1` 有差异或有编译器崩溃/超时；`2` 工具自身错误（找不到编译器、tsconfig 不存在、参数错误）。CI 可以直接用。

## 3. 找编译器

按以下顺序找，找到就停，报告里写明路径、版本和来源：

1. `--tsrs` / `--baseline` 参数；
2. 项目自己的 `node_modules`（从 dir 往上逐级找）：
   - tsrs：`node_modules/tsrs` → 调用包内的 `lib/getExePath.js`（它会处理 `TSRS_BINARY`、平台包和 gnu/musl）；
   - 参照：`typescript` 版本 ≥ 7 → 包内 `lib/getExePath.js` 拿原生 `tsc`；否则 `@typescript/native-preview` → 原生 `tsgo`；
3. tsrs-doctor 自带的依赖（`tsrs` 与它 pin 的 `typescript@7.1.0-dev`）。

项目里只有 TS 5/6 时**不**拿它当参照，而是用自带的 TS 7：tsrs 对齐的是 TS 7，拿 5/6 比较会被大量设计上的差异淹没。确实想和 5/6 比时，用 `--baseline node_modules/.bin/tsc` 显式指定，报告顶部会加警告。

**一律直接运行原生二进制**，不经过 node 启动器：否则计时会多出 node 启动开销，RSS 量到的也是 node 进程。

版本一致性：tsrs 的 `--version` 会打印它移植的 TS 版本（`Version 7.1.0-dev.20260930.4 (tsrs …)`），和参照编译器的 `--version` 比较，不一致时报告顶部给出警告，因为不同 TS 提交本来就可能有不同诊断。

## 4. 运行与测量

- 两个编译器都用 `cwd = dir`，参数 `-p <tsconfig> --noEmit --pretty false`，再加 `--` 后面的透传参数。
- **计时**：交替运行 A、B、A、B…，各 `--runs` 次，避免热身和系统抖动只落在一边。每次都是全新进程，不带增量缓存。墙钟时间用 `performance.now()` 从 spawn 量到退出；CPU 用 rusage 的 user+sys；内存用 rusage 的 `maxRSS`。报告给中位数和 min–max，加速比 = 参照中位数 / tsrs 中位数。
- **线程数**：默认各用各的（tsgo 4 个 checker，tsrs 每核一个），这就是用户换过去以后实际得到的效果；报告里写明。要比同线程，透传 `-- --checkers 4`。
- **Go 模式复跑**：如果默认模式下诊断有差异，再用 `--checkerAssignment go --noLazyMembers --checkers 4` 跑一次 tsrs（上游说这是最接近的对比方式），用来给差异分类（见 §5）。这一次不计入性能数据。

## 5. 诊断对齐

### 解析

`--pretty false` 输出逐行解析：

- `path(line,col): error TS1234: message` → 文件诊断；
- `error TS1234: message` → 全局诊断（例如 tsconfig 错误）；
- 以空白开头的行 → 接在上一条诊断后面（消息链、related information）；
- **其他任何行都不丢**：作为 `kind: "other"` 的原样行参与比较，避免静默漏报。

路径统一成 `/` 分隔、相对 dir。

### 归并

按 **(文件, 行, 错误码)** 分组，组内：

1. 先把列号和全文（含续行）完全相同的配对 → 一致；
2. 剩下的按出现顺序两两配对 → **文本不同**（同一位置、同一错误码，消息或列号不同，常见于类型打印顺序，例如 #373 的联合属性顺序）；
3. 参照多出来的 → **tsrs 漏报**；tsrs 多出来的 → **tsrs 多报**。

与输出顺序无关，所以 tsgo 的并行顺序不会制造噪音。

### 分类

每条差异再打两个标记：

- **tsgo 不稳定**：参照编译器的多次计时运行之间输出不同（README 提到的 parser/resolver 竞态）。一条诊断只在部分运行中出现，就标记它；比较时以第一次运行为准。
- **Go 模式下消失**：用 Go 模式复跑 tsrs 后这条差异不再出现，说明是 checker 顺序或 lazy members 造成的（例如 #649）。上游会把它当 bug 处理，但对迁移的影响较小。
- 两个标记都没有的差异 → **持续差异**，最值得报给上游。

## 6. 输出

- **终端**：先打印编译器与版本，再给一张性能表（墙钟 / CPU / 峰值 RSS，中位数和区间，倍数），然后是诊断汇总（一致 / 漏报 / 多报 / 文本不同，各自带分类），最多列 20 条差异，多出来的提示用 `--md` 看完整列表。
- **JSON**（`--json`）：完整结构，字段见 `src/report.ts` 中的 `Report` 类型，带 `schemaVersion`，方便 CI 和以后的 GitHub Action 使用。
- **Markdown**（`--md`）：可以直接贴进 issue 或 PR，包含版本行、命令行、性能表、全部差异（两边原文并列），格式参照上游 issue 模板。

## 7. VS Code 配置（`tsrs-doctor vscode`）

目标：解决 #661，生成的配置可以提交到仓库，队友 clone 后直接能用；全程可回滚。

写入内容：

1. `.vscode/tsrs-tsdk/tsgo`：可执行的 sh 脚本，按自己的位置找到 `<仓库>/node_modules/.bin/tsrs` 并 `exec`。不写绝对路径，所以换机器、换平台都能用；扩展会找名为 `tsgo` 的文件并用 `--lsp --stdio` 启动它。
2. `.vscode/settings.json` 合并两个键：
   - `"js/ts.tsdk.path": ".vscode/tsrs-tsdk"`（相对路径，由扩展按工作区根解析）；
   - `"js/ts.experimental.useTsgo": true`（让内置 TS 扩展让位）。

   使用 `jsonc-parser` 做定点修改，保留注释、尾逗号和其他键。

安全措施：

- **先备份**：第一次写之前，把原 settings.json 原样存到 `.vscode/tsrs-tsdk/settings.json.bak`；同时在 `.vscode/tsrs-tsdk/backup.json` 记下两个键的原值（或"原来不存在"）以及 settings.json 原来是否存在。备份已存在时不覆盖，保证重复执行也能回到最初状态。两个备份文件是本机状态，同目录的 `.gitignore` 把它们排除，团队只提交 `tsgo` 和 settings。
- **写完自检**：运行 `tsgo --version`，确认输出里有 tsrs，失败就报错（通常是项目没装 tsrs）。
- **回滚**（`--undo`）：只把这两个键恢复成原值（原来没有就删除），不动用户之后改过的其他内容（包括注释）；settings.json 原来不存在、恢复后又只剩 `{}` 时直接删除；最后删除 `.vscode/tsrs-tsdk/`。`settings.json.bak` 只在启用期间留作手工恢复的兜底。
- settings.json 不是合法的 JSONC 对象时拒绝写入，原文件不动。
- 项目里没有 `node_modules/tsrs` 时拒绝写入，提示先 `bun add -d tsrs`；Windows 上直接报不支持。
- 不碰用户级设置。工作区级 tsdk 需要用户在 VS Code 里信任工作区并同意一次，这是扩展的安全设计，工具只在提示里说明。

## 8. 失败处理

| 情况 | 行为 |
|---|---|
| 找不到 tsrs / 参照编译器 | 退出码 2，打印查找过的位置和安装命令 |
| tsconfig 不存在 | 退出码 2 |
| tsconfig 是 solution 风格（只有 `references`，`files: []`） | 照常运行，并警告"没有检查任何文件，请用 -p 指向子项目" |
| 编译器崩溃（被信号杀死、退出码不在 0/1/2，或 stderr 有 panic） | 记为崩溃，写进报告并附 stderr 尾部，退出码 1，提示报上游 |
| 超时 | 杀掉进程，记为超时，退出码 1 |
| 输出里有无法识别的行 | 作为 other 行参与比较，不丢 |
| 平台是 Windows | 退出码 2，引用 #676 |

## 9. 不做的事（MVP）

GitHub Action、`--report-upstream` 自动提 issue、Neovim/Zed 配置、`-b` 构建模式的专门支持（可以透传 `-- -b`，但不保证计时口径）。先发核心能力，看反馈再加。

## 10. 代码结构

```
src/cli.ts        参数解析、子命令分发、退出码
src/resolve.ts    找编译器与版本
src/run.ts        运行子进程、测量
src/diagnostics.ts 解析与归并（纯函数，单测重点）
src/report.ts     Report 类型、终端 / JSON / Markdown 渲染
src/vscode.ts     VS Code 写入与回滚
test/*.test.ts    bun test
```
