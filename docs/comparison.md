# 功能对比（2026-10-22 复查）

复查方式：`gh api search/repositories`，查询词包括 `tsrs created:>2026-10-01`、`tsgo tsrs`、`tsrs benchmark`、`tsrs vscode`、`tsrs compare`、`tsgo compare`、`tsgo benchmark`、`typescript 7 benchmark`；同时看了上游 `oxc-project/tsrs`（1,846★，最新 v0.18.0，#661 仍为 open）。和上次调研相比，没有新出现的用户侧对比工具。

## 对象

**tsrs 配套仓库（全部 7 个与 tsrs 相关、非空的仓库）**

| 仓库 | ★ | 定位 |
|---|---|---|
| maschwenk/tsrslint | 26 | tsgolint 的 tsrs 移植（lint） |
| sxzz/tsrs-playground | 3 | 浏览器 playground（WASM） |
| marcoroth/tsrs-ruby | 2 | Ruby 绑定 |
| nstudio/ns-tsrs | 1 | NativeScript 集成 |
| sdneon/tsrs-transpile | 0 | Node 转译打包 |
| maschwenk/typescript-go-tsrs | 0 | 作者把 tsrs 的优化回移植到 Go 的实验 |
| cmsommer/zed-tsrs | 0 | Zed 编辑器配置 |

**tsgo / TS 7 对比与 benchmark 工具**

| 仓库 | ★ | 定位 |
|---|---|---|
| 上游 `bench/run.py` | — | 上游自己的 benchmark，固定 19 个项目 |
| danfry1/ts-checker-bench | 1 | 5 个 checker × 3 个固定项目，速度、内存、诊断 |
| beerose/tsc-diagnostics-diff-action | 70 | PR 前后 tsc 诊断 diff 的 Action |
| yesimnoh/ts7-benchmark、procodrr/typescript-7.0-benchmarking-setup、LF3551/typescript-7-vs-6-benchmark、Bashamega/tsgo-vs-tsc、greg00ry/tsgo-benchmark-demo、idealjs/ts-go-rust-bench | 0–3 | 一次性 benchmark 仓库，固定项目、不可复用 |

## 逐项对比

✅ 支持 · ⚠️ 部分支持 · ❌ 不支持 · — 不适用

| 能力 | tsrs-doctor | 上游 bench | ts-checker-bench | diff-action | 一次性 benchmark 仓库 | 配套仓库（7 个） |
|---|---|---|---|---|---|---|
| 在**你自己的**仓库上跑 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| 一条命令、无需 clone/编译 tsrs | ✅ `bunx tsrs-doctor` | ❌ 要 cargo build | ⚠️ 要 clone 本仓库 | ✅ | ❌ | — |
| 自带版本匹配的 tsgo + tsrs | ✅ | ✅ | ⚠️ 自行安装 | ❌ | ❌ | — |
| 优先用项目自己的编译器 | ✅ | ❌ | ❌ | ✅ | ❌ | — |
| tsrs 与 tsgo 的 TS 版本不一致时警告 | ✅ | ⚠️ 文档说明 | ⚠️ 脚注 | ❌ | ❌ | — |
| 直接跑原生二进制（不量到 node 启动器） | ✅ | ✅ | ✅ | — | ⚠️ | — |
| 墙钟 / CPU / 峰值 RSS | ✅ 三项 | ✅ 墙钟+RSS | ✅ 三项 | ❌ | ⚠️ 多为墙钟 | — |
| 多次运行、交替执行、取中位数和区间 | ✅ | ✅ | ✅ | — | ⚠️ | — |
| 诊断按文件+行+错误码归并（与顺序无关） | ✅ | ❌ 只比数量 | ⚠️ 归一化后 +n/−m | ⚠️ 文本 diff | ❌ | — |
| 区分漏报 / 多报 / 同位置文本不同 | ✅ | ❌ | ⚠️ 只分 + / − | ⚠️ | ❌ | — |
| 标记 tsgo 自身多次运行不一致 | ✅ | ❌ | ❌ | ❌ | ❌ | — |
| 标记"Go 模式下消失"（checker 顺序、lazy members） | ✅ | ❌ | ❌ | ❌ | ❌ | — |
| 编译器崩溃、超时单独报告 | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | — |
| CI 友好的退出码 | ✅ 0/1/2 | — | — | ✅ | ❌ | — |
| JSON 报告 | ✅ | ✅ | ✅ | ❌ | ❌ | — |
| 可直接贴进 issue 的 Markdown 报告 | ✅ | ⚠️ 汇总表 | ✅ | ✅ PR 评论 | ⚠️ | — |
| 速度徽章 | ✅ | ❌ | ❌ | ❌ | ❌ | — |
| monorepo / solution tsconfig 的明确提示 | ✅ 列出子项目 | — 预设 `-p` | — 预设 | ⚠️ | ❌ | — |
| VS Code 接入 tsrs（#661） | ✅ 可提交、可回滚 | ❌ 文档手工 symlink | ❌ | ❌ | ❌ | ❌ |
| 其他编辑器 | ❌ | ⚠️ 文档里有 Neovim | ❌ | ❌ | ❌ | ⚠️ zed-tsrs 只有 Zed |
| GitHub Action 封装 | ⚠️ README 给出 workflow 示例 | — | ❌ | ✅ | ❌ | — |
| 公开的多项目结果 | ⚠️ 3 个示例 | ✅ 19 个 | ✅ 3 个 | — | ⚠️ | — |
| Windows | ❌ tsrs 本身没有 Windows 二进制 | ❌ | ⚠️ | ✅ | — | — |

## 结论

- 现有工具都在回答"tsrs 总体快多少"，没有一个回答"**我的**仓库能不能换"。诊断的分类（tsgo 自身不稳定、Go 模式下消失）和 #661 的 VS Code 接入，是只有本工具提供的两项。
- 首次使用时会碰到的缺口（本轮已补，见 git log）：
  1. 在 monorepo 根目录直接运行：之前只给警告，并报告"0 vs 0，完全一致"，这个结论有误导性。现在改为报错，并列出可以用 `-p` 检查的子项目。
  2. 用 `npx` 运行但没装 Bun：之前报 `env: bun: No such file`。现在改由 node 启动器给出清楚的提示。
  3. Markdown 报告附带一枚可以放进 README 的速度徽章。
  4. README 给出 GitHub Actions 示例（退出码 + 报告写进 `$GITHUB_STEP_SUMMARY`）。
- 暂不做：其他编辑器、独立的 GitHub Action、Windows 支持。
