# 角色 ↔ 模型：我们测了什么、推荐什么

这份文档的存在理由很具体。2026-11-09 我们跑了一轮 105 格评测，结论写进内部档案，然后在 README 放了一张
推荐表。几周后回头看，那张表和 `lib/roles.js` 里的默认值已经对不上了——没人故意改错，只是两边都没有人
盯着。所以现在把它单独拎出来，并且用断言钉住：文档里的"内置默认"必须和代码逐字一致。

结论有保质期。下面这版是 2026-11-13 的，模型换版本、套餐调价之后它会过期。

## 推荐

表里两列是分开的：左边是我们建议你用的，右边是插件出厂写死的。它们不一样是有意的——出厂值要照顾
"谁的机器上都能跑"，推荐值可以只按能力挑。

| 角色 | 官方推荐 | 内置默认 | 一句话依据 |
|---|---|---|---|
| `analyst` | `qwen-token-plan-cn/qwen3.8-max` | `qwen-token-plan-cn/qwen3.8-max` | 三个候选并列 9.3；唯一失分点是漏「配置可能含密钥」——更强的备选（v4-pro）暂因性价比不纳入 |
| `planner` | `kimi-coding/k3` | `kimi-coding/k3` | 三份计划四段齐全，与其他候选无区分度 |
| `coder` | `kimi-coding/k3` | `kimi-coding/k3` | 15/15 隐藏测试全过（含原型污染/分页边界/稳定去重），无区分度 |
| `reviewer` | `qwen-token-plan-cn/qwen3.8-flash` | `qwen-token-plan-cn/qwen3.8-max` | 三份补丁缺陷全中；flash 与 max **同分 10/10**，按成本取 flash |
| `scout` | `deepseek-official/deepseek-flash` | `deepseek-official/deepseek-flash` | 三仓库定位全对；唯一保证注册的 provider |
| `scribe` | `qwen-token-plan-cn/qwen3.8-flash` | `qwen-token-plan-cn/qwen3.8-flash` | 三文体全对；`deepseek-flash` 同为满分，可互换 |
| `vision` | `qwen-token-plan-cn/qwen3.8-flash` | `qwen-token-plan-cn/qwen3.8-flash` | 8 格全对（OCR 5/5、UI 6/6）；旗舰无增益 |
| `fallback` | `deepseek-official/deepseek-flash` | `deepseek-official/deepseek-flash` | 知识全对 + 交付合规；**避开 Kimi**（连续两轮不写产物） |

有两件事表格看不出来，得单独讲。

`coder`、`planner`、`scout`、`scribe` 这四个角色，这批任务已经分不出高下了。五个模型全是满分，包括价格
差十倍的档位。给它们上旗舰，买到的是心里安慰。真要区分，得换更难的任务，见文末。

`vision` 是同样的结论，但更意外：kimi-k3 也能看图，而且和 qwen3.8-max 打平。我原以为它会翻车。
所以"要视觉必须上旗舰"这个直觉，至少在干净图上不成立。

## 我们测过谁

| 模型 | provider | 参与轮次 | 备注 |
|---|---|---|---|
| DeepSeek V4.1 Flash | `deepseek-official` | 第四/五轮 | 唯一**保证注册**的 provider（无凭据的空 DSH_HOME 也注册它） |
| DeepSeek V4 Pro | `opencode-go` | 第四/五轮 | 105 格唯一全满分；本版不推荐，原因见「暂不推荐」 |
| Qwen3.8 Flash | `qwen-token-plan-cn` | 第四/五/六轮 | 多模态与文本都满分，便宜 |
| Qwen3.8 Max | `qwen-token-plan-cn` | 第四/五/六轮 | 旗舰；在已有任务上相对 flash 没有增益 |
| Qwen3.7 Plus | `opencode-go` | 第四/五轮 | reviewer 上翻过车，见「暂不推荐」 |
| Kimi K3.1 Pro | `kimi-coding` | 第四/五轮 | coder/planner 稳，fallback 不写产物 |
| Kimi K3 | `kimi-coding` | 第六轮 | 第六轮顺手发现它也能看图 |
| MiniMax-M3 | `minimax-cn` | 首/二轮 | 文本能打，视觉不行 |

没测的也写清楚。`kimi-coding/k3-256k` 一直没跑。`opencode-go/*` 在会话里没法用通用 `subagent` 逐模型
测，子代理白名单拦着——这事后面还会提一次。

## 怎么测的

原则只有一条：能用机器判的，就不靠人眼。

`coder` 用隐藏测试，写完跑 `node --test`，全绿才算过。三个任务分别考深合并（数组替换、`undefined` 忽略、
不改入参、`__proto__` 原型污染）、分页 off-by-one、稳定去重。`scout` 在合成仓库里找符号，答案精确到
`文件:行号`，同名遮蔽和常量映射特意埋了坑。`reviewer` 给三份补丁，里面植入真缺陷：fail-open 认证、路径
穿越、日志泄露正文、分页边界。`fallback` 是事实题，比如 301/308 的缓存语义、`git reset` 三档的区别。
`vision` 走逐字匹配：自写 SVG 转 PNG，OCR 5 项、UI 6 项，源文件不放在被测能读到的目录里。

`analyst`、`planner`、`scribe` 这类没法机判，用固定 rubric（必须命中的要点 + 结构 + 禁止项）按命中率给分。

规模：第五轮 7 角色 × 3 任务 × 5 候选 = 105 格，2026-11-09，单次运行。第六轮 4 模型 × 2 任务 = 8 格，
2026-11-13。每格都省略 `reasoning_effort`，让它用适配器默认档，否则档位会变成第二个变量。

## 分数

第五轮，每角色三任务均值：

| 模型 | analyst | planner | coder | reviewer | scout | scribe | fallback |
|---|---|---|---|---|---|---|---|
| DeepSeek V4 Pro | **10** | 10 | 10 | 10 | 10 | 10 | 10 |
| DeepSeek V4.1 Flash | 9.3 | 10 | 10 | 10 | 10 | 10 | 10 |
| Qwen3.8 Flash | 9.3 | 10 | 10 | 10 | 10 | 10 | 10 |
| Qwen3.7 Plus | 9.3 | 10 | 10 | 9.7 | 10 | 9.4 | 10 |
| Kimi K3.1 Pro | 9.3 | 10 | 10 | 10 | 10 | 10 | **6.7** |

第六轮，逐字匹配：

| 模型 | OCR /5 | UI /6 | 合计 /11 |
|---|---|---|---|
| Qwen3.8 Flash | 5 | 6 | **11** |
| DeepSeek V4.1 Flash | 5 | 6 | **11** |
| Qwen3.8 Max | 5 | 6 | **11** |
| Kimi K3 | 5 | 6 | **11** |

两张表放一起看，有个尴尬的事实：除了 v4-pro 在 analyst 上多拿的 0.7 分、以及 Kimi 在 fallback 上丢的
3.3 分，其余全是并列。天花板就在 10 分，早就摸到了。

## 在你的机器上

先跑 `/rolegroup doctor`，它会告诉你每个角色实际绑的是哪个模型、那个 provider 在不在。内置默认指向的是
作者自己的订阅，你大概率没有，别照抄。跑 `/rolegroup init`，它会按你机器上真的注册了的 provider 生成一份
起始配置。

没有 qwen/kimi 订阅也不至于崩。内置角色都带备用链，链的最后一站固定是 `deepseek-official`，而它是 dsh
唯一保证注册的 provider。链也走不通，角色才会被剪枝。注意显式配置的角色不走降级，这是有意的：写了就是
承诺。

关于 `opencode-go` 这类第三方网关，有个容易混的点：角色工具能用（注册在宿主平面，
`modelSelectionSettings: false`，不查白名单），但通用 `subagent` 的逐模型选择会被会话白名单拦住。两件事
不是一回事。我们评测用的是 `subagent`，所以 v4-pro 的结论没法在角色通道之外复现。

## 暂不推荐

| 模型 | 原因 |
|---|---|
| `opencode-go/deepseek-v4-pro` | 能力确实最强（105 格唯一全满分），但属第三方网关，当前性价比不划算。先放观察名单，不删——它的分数是真的 |
| `opencode-go/qwen3.7-plus` | reviewer 任务里把 `pageOf` off-by-one 列为「阻塞」，结论却写「有条件通过」。自己跟自己打架 |
| Kimi 系用于 `fallback` | 连续两轮没写指定产物文件，只回了 JSON |
| `minimax-cn/MiniMax-M3` 用于视觉 | OCR 探针 4/10，而且**编造**了图中不存在的字符串 |

## 这份结论有多可信

第五轮每格只跑一次。分差 0.3 以内的，别当回事。

四个"到天花板"的角色，高分只说明"够用"，不说明谁更强。这不是谦虚，是任务设计的问题：五个模型都满分，
说明任务太浅。

vision 那批图是干净的大字号，没有低分辨率、旋转、手写、截图噪声。所以结论只能是"这四个都能用"，不能
推"某个更准"。我原本预期 kimi 会翻车，结果没有，这本身就是任务太简单的证据。

主观角色（analyst/planner/scribe）的分是编排会话打的，带主观性。rubric 尽量写成了可观察断言，但不能假装
它不是人打的分。

## 什么时候该重测

模型换版本、provider 换策略或调价、距上次超过 90 天、角色职责改了，都该重跑。

还有一种更隐蔽的：任务腐烂。历史上出过两次。一次是 analyst 的题，答案已经被写进交接文档，被测者复述一句
就得分；另一次更糟，planner 格的被测者直接读到了评测卡，还附了一份"Rubric 自评"。设计任务时先问自己：
答案是不是就在仓库里躺着。

---

## English summary

This file records what we measured and what we recommend, as of 2026-11-13. Each role is one
`dsh-tool-subagent` instance bound to a fixed model; the table in §1 keeps the official recommendation and the
built-in default as separate columns because they differ on purpose — the built-in value has to work on a machine
that has none of the author's subscriptions.

Evidence: 105 cells (7 roles × 3 tasks × 5 candidates, 2026-11-09, single run) plus 8 multimodal cells
(4 models × 2 image tasks, 2026-11-13). Scoring is mechanical wherever possible — hidden tests for `coder`,
`file:line` answers for `scout`, planted defects for `reviewer`, exact-match transcription for `vision`;
`analyst`/`planner`/`scribe` use a fixed rubric scored by the orchestrating session.

What came out of it: `coder`, `planner`, `scout` and `scribe` all hit the ceiling of these tasks — five models
scored full marks including the cheap tiers, so the honest advice is to pick on cost. `vision` behaves the same
way; even kimi-k3 read both images correctly, which is why the flagship has nothing to offer there.

Not recommended for now: `deepseek-v4-pro` (best raw score, but a third-party gateway and poor value at the
moment — kept on the watch list rather than deleted), `qwen3.7-plus` (self-contradictory review verdict), Kimi for
`fallback` (twice failed to write the requested artifact), MiniMax-M3 for vision (fabricated text).

Caveats: one run per cell, so 0.3-point gaps are noise; the four "ceiling" roles were measured with tasks that no
longer discriminate; the vision fixtures are clean large-text images, so the result supports "all four work", not
"one is more accurate"; and `opencode-go` models cannot be exercised through the generic `subagent` tool because
of the per-session allowlist, so those conclusions rest on older rounds and on role-tool runs.

_Current version: 0.8.3._
