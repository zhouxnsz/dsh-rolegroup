# 角色 ↔ 模型：我们测了什么、推荐什么

> 本文是**角色绑定模型的权威说明**。README §3 只放结论摘要，细节都在这里。
> 当前版本 **0.8.2** ｜ 最近一次结论更新 **2026-11-13**。

## 1. 结论先行

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

**两条比表格更有用的判断**：

- **`coder` / `planner` / `scout` / `scribe` 已到能力天花板**（这批任务无区分度）→ 按成本选，不必上旗舰。
- **`vision` 不需要旗舰**：四个候选全部满分，旗舰档相对 flash 没有增益。

## 2. 我们测过哪些模型

| 模型 | provider | 参与轮次 | 备注 |
|---|---|---|---|
| DeepSeek V4.1 Flash | `deepseek-official` | 第四/五轮 | 唯一**保证注册**的 provider（无凭据的空 DSH_HOME 也注册它） |
| DeepSeek V4 Pro | `opencode-go` | 第四/五轮 | 105 格唯一全满分；**本版暂不推荐**（第三方网关、性价比不足），见 §6 |
| Qwen3.8 Flash | `qwen-token-plan-cn` | 第四/五/六轮 | 多模态与文本都满分，成本低 |
| Qwen3.8 Max | `qwen-token-plan-cn` | 第四/五/六轮 | 旗舰；在已有任务上相对 flash 无增益 |
| Qwen3.7 Plus | `opencode-go` | 第四/五轮 | reviewer 出现结论自相矛盾，见 §6 |
| Kimi K3.1 Pro | `kimi-coding` | 第四/五轮 | coder/planner 稳；fallback 交付不合规 |
| Kimi K3 | `kimi-coding` | 第六轮 | 视觉也可用（本轮新增事实） |
| MiniMax-M3 | `minimax-cn` | 首/二轮 | 文本可用、**视觉不达标**（OCR 探针 4/10 且编造内容） |

> 未覆盖 / 不可测：`kimi-coding/k3-256k`（未测）；`opencode-go/*` 无法用于会话内 `subagent`
> 的逐模型评测（受**子代理模型白名单**限制，见 §5），故其结论只能来自角色工具通道与更早的轮次。

## 3. 测试方法（可复核）

- **任务设计原则**：答案不能出现在被测仓库可读范围内；能客观判分就不用主观 rubric。
- **客观判定**：
  - `coder`：隐藏测试（深合并 + 原型污染防护、分页边界、稳定去重），跑 `node --test` 全绿才算过；
  - `scout`：合成仓库里的符号定位，标准答案精确到 `文件:行号`；
  - `reviewer`：植入缺陷清单（fail-open 认证、路径穿越、日志泄露正文、分页 off-by-one）；
  - `fallback`：事实题（Node API 版本、301/308 语义、`git reset` 三档）；
  - `vision`：自写 SVG → PNG 作夹具，OCR 5 项 + UI 6 项**逐字匹配**，源文件不放在被测可读目录。
- **主观角色**（analyst / planner / scribe）：固定 rubric（必须命中的要点 + 结构 + 禁止项）按命中率给分。
- **样本量**：第五轮 7 角色 × 3 任务 × 5 候选 = **105 格**（2026-11-09，单次运行）；
  第六轮 vision 4 模型 × 2 任务 = **8 格**（2026-11-13）。
- **降噪**：同一格固定 `reasoning_effort`（省略，用适配器默认档），避免档位成为混淆变量。

## 4. 全量结果（摘要）

第五轮（每角色 3 任务均值 / 10）：

| 模型 | analyst | planner | coder | reviewer | scout | scribe | fallback |
|---|---|---|---|---|---|---|---|
| DeepSeek V4 Pro | **10** | 10 | 10 | 10 | 10 | 10 | 10 |
| DeepSeek V4.1 Flash | 9.3 | 10 | 10 | 10 | 10 | 10 | 10 |
| Qwen3.8 Flash | 9.3 | 10 | 10 | 10 | 10 | 10 | 10 |
| Qwen3.7 Plus | 9.3 | 10 | 10 | 9.7 | 10 | 9.4 | 10 |
| Kimi K3.1 Pro | 9.3 | 10 | 10 | 10 | 10 | 10 | **6.7** |

第六轮（vision，逐字匹配）：

| 模型 | OCR /5 | UI /6 | 合计 /11 |
|---|---|---|---|
| Qwen3.8 Flash | 5 | 6 | **11** |
| DeepSeek V4.1 Flash | 5 | 6 | **11** |
| Qwen3.8 Max | 5 | 6 | **11** |
| Kimi K3 | 5 | 6 | **11** |

## 5. 在你的机器上怎么用

1. **看当前生效绑定**：`/rolegroup doctor`（逐角色列出实际 provider/model 与可用性）。
2. **生成本机可用的路由**：`/rolegroup init`（按本机**实际注册**的 provider 生成起始 `rolegroup.jsonc`；
   内置默认指向作者自己的订阅，换机器时不要照抄）。
3. **没有对应订阅怎么办**：内置角色都带备用链，会先降级到 `deepseek-official`（唯一保证注册），
   只有链也走不通才会被剪枝。**显式配置的角色不会自动降级**——这是刻意的（显式即承诺）。
4. **`opencode-go` 这类第三方网关**：角色工具可以用（宿主平面注册，`modelSelectionSettings:false`），
   但**通用 `subagent` 的逐模型选择受会话白名单限制**——两者不是一回事，别用前者证明后者可用。

## 6. 暂不推荐清单（附原因）

| 模型 | 原因 |
|---|---|
| `opencode-go/deepseek-v4-pro` | 能力确实最强（105 格唯一全满分），但属**第三方网关**且当前**性价比不足** → 本版不纳入推荐；保留在备选观察名单 |
| `opencode-go/qwen3.7-plus` | reviewer 任务里出现过「把 `pageOf` off-by-one 列为阻塞，却给出『有条件通过』」的**结论自相矛盾** |
| Kimi 系用于 `fallback` | 连续两轮**不写指定产物文件**（只回 JSON）→ 需要落盘产物的角色慎用 |
| `minimax-cn/MiniMax-M3` 用于视觉 | OCR 探针 4/10，且**编造**图中不存在的字符串 |

## 7. 局限（请据此判断可信度）

- 第五轮为**单次运行**（每格 1 次），未做重复采样；分差 ≤0.3 不应视为显著。
- 四个"到天花板"的角色，本批任务**没有区分度**——它们的高分只说明"够用"，不说明"谁更强"。
- vision 夹具是**干净大字号图**；低分辨率/旋转/手写/截图噪声未覆盖，因此只能说"这四个都能用"，
  不能说"某个更准"。
- 主观角色（analyst/planner/scribe）的评分由编排会话执行，存在主观性；rubric 已尽量写成可观察断言。

## 8. 什么时候该重测

- 任一在册模型**版本升级**，或 provider 策略/额度方案变化；
- 距上次评测 **> 90 天**；
- 角色职责定义变化（persona / 工具面）；
- **任务腐烂**：任务场景随仓库演化变得"答案就在仓库里"（历史事故：某轮被测者直接读了评测卡）。

---

## English summary

Authoritative role ↔ model guide (version 0.8.2, conclusions updated 2026-11-13). Each role = one
`dsh-tool-subagent` instance bound to a fixed model; the table in §1 lists the official recommendation and the
built-in default separately, because the two may differ. Evidence: 105 cells (7 roles × 3 tasks × 5 candidates,
2026-11-09) plus 8 multimodal cells (4 models × 2 image tasks, 2026-11-13). Objective scoring only (hidden
tests, exact-match OCR/UI fields); subjective roles use a fixed rubric. Key findings: `coder`/`planner`/`scout`/
`scribe` have hit the capability ceiling with these tasks, so pick on cost; `vision` needs no flagship
(all four candidates scored full marks). Not recommended for now: `deepseek-v4-pro` (best score but a
third-party gateway with poor cost-performance at present), `qwen3.7-plus` (self-contradictory reviewer verdict),
Kimi for `fallback` (failed twice to write the requested artifact), and MiniMax-M3 for vision (fabricated text).
Limitations: single-run cells, easy multimodal fixtures, and `opencode-go` models cannot be exercised through the
generic `subagent` tool because of the per-session subagent allowlist.
