# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
版本纪律见 `AGENTS.md`「提交与发布」。

> **`npm` 上一个已发布版本是 `0.6.1`。** 这期间开发中用过 0.6.2 / 0.6.3 / 0.8.0 等内部里程碑号，
> 但都没有发布；下面 `0.7.0` 是**自 `0.6.1` 以来的累积变更**（按 semver 只升一个 minor，不跳号）。

---

## [0.11.1] — 2026-11-13

用户截图指出：角色一多，顶部那行「当前生效：官方推荐」会被整页滚动带走，看不到。这是我 10-21 做的
反向决策（"滚动交给设置页"），当时角色少，没暴露问题。

### Fixed

- 面板改成官方设置页同款布局：根容器 `display:flex; flex-direction:column; height:100%`，内容区
  `.dsh-rg-scroll{flex:1; min-height:0; overflow-y:auto}` 自己滚，头部与状态行固定，动作区固定在底部。
  不用固定像素高度——换屏幕或调字号都会坏。

### Changed

- `layout/AC-1` 断言反转：从"列表不得设固定高度/不得套滚动"改成"必须有独立滚动容器 + `min-height:0`
  + 动作区在容器外 + 不得用像素 max-height"。证伪：改名去掉容器 → 红；删 `min-height:0` → 红。

---

## [0.11.0] — 2026-11-13

用户说了一句"我们是不是搞复杂了"。复盘之后确认：复杂度来自**两个文件、两套真相**——配置既可以是
`rolegroup.jsonc`，也可以是设置面板写进 profile patch 的那份。这版把文件层整个删掉。

### Breaking

- **`rolegroup.jsonc` 不再是配置来源。** 只保留两层：内置表 + 面板覆盖。存量文件不会报错，但也不会
  被读取；需要的话用 `/rolegroup init` 导出当前绑定留档，再在面板里改。
- **`/rolegroup init` 变成导出器**：只打印当前生效绑定的 JSONC 文本，不写文件。`--write` / `--project` /
  `--diff` / `--force` 一律当作未知子命令报错（不静默忽略）。
- **`/api/dsh-rolegroup/config` 路由已删除**，连同「配置文件」按钮与右侧栏预览。插件现在**不注册任何
  HTTP 路由**，暴露面归零。
- 启动报告的 `configSource` 只剩两态：settings 面板 或 `null`（内置表）；`configError` / `configMtimeMs`
  恒为 `null`（键保留，红线 3「仅加性」）。

### Changed

- 面板状态行两态：**官方推荐（内置表）** / **面板自定义（N 行覆盖）**。未接管时直接用客户端打包的
  `DEFAULT_ROLES` 渲染，不再请求宿主（之前那次"重置后显示旧表"就是因为预填请求被跳过）。
- 动作收敛为三个：保存 / 放弃 / 恢复官方推荐。「回到文件配置」删除——它解决的问题（两个真相）已经不存在。
- **备用链改为账号优先**：`deepseek-account/deepseek-flash` → `deepseek-official/deepseek-flash` →
  `deepseek-official/deepseek-v4-pro`。原来的链只指向 `deepseek-official`（API Key），而多数用户是
  **账号登录**（`dsh-llm-deepseek-account`，dsh-base 自带，目录里还有 v4-pro）。链只允许这两个 provider。
- 「按当前可用模型补齐」在没有缺口时不渲染（以前是灰着，用户会问"为什么点不了"）。

### Added

- 断言：账号 provider 存在时链能降级到它、链上 provider 全不可用仍 fail-loud；未接管时面板不发请求；
  两态投影；`init` 不写文件且旧标志报错。

---

## [0.10.0] — 2026-11-13

设置页的"重置"让人以为回出厂，实际只是退出接管。这版把三个概念在界面上拆开。

### Changed

- 面板顶部状态行改成**三态**，一句话说清现在生效的是谁：`官方推荐（内置表）` / `文件配置` /
  `面板自定义（N 行覆盖）`。原来那句「rolegroup.jsonc / 内置表」斜杠并列，用户分不清命中的是哪层。
- 「重置为文件配置」改名为**「回到文件配置」**，并且只在接管态可用；按钮下方预告落点——有 jsonc 就显示
  路径，没有就写"将回落到内置表"。这个动作的结果本来就取决于用户机器上有没有文件，必须提前说。
- 新增**「恢复官方推荐」**：写 `enabled=true` + `roles=[]`，也就是零覆盖接管。不写任何模型名，
  所以插件以后改内置默认时会自动跟上；比"把 8 行模型名抄进草稿"更不易过期。
- `MODELS.md` / `MODELS.en.md` 重新定位：它们是**内置表（出厂默认）的文档镜像**，不是你当前生效的配置；
  首段明说这一点，并给出"回到这张表"的路径（点「恢复官方推荐」）。面板的层级说明里加了链接。

### Fixed

- 点重置后面板仍显示旧表：`resetToBase` 用 `isTakeover()` 做刷新 guard，而重置瞬间客户端快照还是
  `enabled=true`，于是跳过了重新拉取。改成无条件刷新（2026-11-13 用户实测踩到）。

### Added

- 四条断言（v0.10/AC-1..4）：`restoreOfficial` 只写两个字段且不抄模型名；`exitToFile` 非接管态拒绝、
  接管态**必定**刷新预填（用"mutate 不更新快照"的竞态模拟，证伪时能红）；`projection.mode` 三态正确；
  两个动作的文案不得互相冒充（`exitToFile` 禁止出现默认/推荐/出厂/恢复字样）。
- 状态点只在「面板自定义」态点亮：跟随状态不该看起来像待处理。

---

## [0.9.0] — 2026-11-13

用户问："官方推荐不该就是内置默认吗？为什么不一样？"问得对。我当初把内置默认当成"作者订阅原样"、推荐
另按评测挑，等于让文档去纠正代码。这版把两者合成一个。

### Changed

- 内置默认与官方推荐统一：
  - `planner` / `coder`：`k3` → `k3.1-pro`
  - `reviewer`：`qwen3.8-max` → `qwen3.8-flash`（与 max 同分，取便宜的）
- `MODELS.md` / `MODELS.en.md` 只剩一列「推荐模型」，不再出现 provider 名（同一个模型有多条路由，
  provider 由各人配置决定；`/rolegroup doctor` 看实际值）。
- README 中英 §3 的内置角色表同步成 Kimi K3.1 Pro / Qwen3.8 Flash。

### Added

- 断言：两份 MODELS 的推荐模型必须**逐字等于** `lib/roles.js` 的内置默认；且表里不得出现 `/`
  （写 provider 就算错）。证伪：写回 `k3` 红，写成 `kimi-coding/k3.1-pro` 也红。

---

## [0.8.5] — 2026-11-13

用户读了 `MODELS.md` 之后的反馈：太长，没人会看。他说得对——一份查表用的文档被我写成了评测报告。

### Changed

- `MODELS.md` 从 159 行砍到 17 行：标题、一句说明、三列表格（角色 / 官方推荐 / 内置默认）、两行
  provider 提示。删掉的是开场故事、一句话依据列、测过谁、怎么测的、分数矩阵、暂不推荐、可信度、
  重测触发、英文摘要——这些留在私有档案里，需要时查得到。
- 英文不再塞在同一份文档末尾，单独建 `MODELS.en.md`；`README.en.md` 指向它。
- README 中英的「推荐绑定」段同步压到两句。

### Fixed

- `STYLE.md` 从仓库移除（内容并入本机 `AGENTS.local.md`，已 gitignore）。它是维护者自己的写作笔记，
  没必要公开。注意：v0.8.3 的历史提交里仍有它，按用户决定不重写历史。

### Added

- 断言：两份 MODELS 的角色集合与「内置默认」列必须逐字等于 `DEFAULT_ROLES`；中英推荐值必须一致；
  **单个文档不得超过 30 行**（防止它再长回去）；README 各链各语言版本；仓库里不得再出现 `STYLE.md`。

---

## [0.8.4] — 2026-11-13

文档巡查。起因是改 `MODELS.md` 时顺手数了一下 README，发现它还在说"内置 7 个角色"——vision 加进来已经
好几版了。

### Fixed

- README 中英：doctor 示例只有 7 行（漏了 vision）、"空覆盖表回到内置 7 个角色"、"Agent 预设里多出 7 个"
  三处旧数字；测试项数还写着 156（实际 158）。
- README 中英：删掉「想加一个看图角色」一节——vision 已经内置，那节的示例反而在教用户加一个重复的角色。
  换成了「看图任务怎么用」：把图片路径写进简报、它自己调 `read_image`、换模型时别用纯文本模型、
  换完拿一张有字的图试一下。

### Changed

- 「边界」一段的引导句改成说人话（原来那句"专注是一种选择，也是一条红线"太像宣言）。
- `CONTRIBUTING.md` 补上 `STYLE.md` 的引用，并去掉几处宣言腔。

### Added

- 断言 `models-doc/AC-6`：README 的 doctor 示例角色数必须等于 `DEFAULT_ROLES` 的键数，
  且不得残留「7 个角色」「156 项」这类旧数字。证伪过——把示例改回 7 个，测试红。

---

## [0.8.3] — 2026-11-13

文档改写。用户读完 `MODELS.md` 的反馈是"塑料味有点重"，指的是那种一眼能看出 AI 写的整齐感。

### Changed

- `MODELS.md` 重写：从具体的事讲起（几周前推荐表和代码对不上），而不是先给结论摘要。加粗减到只留
  判据，删掉"三条比表格更有用"这类模板框架，把"我原以为 kimi 会翻车，结果没有"这种真实判断写进去。
- README 中英「推荐绑定」段落同步改写，长度减半；`AGENTS.md` 的版本纪律从命令式清单改成叙述。
- 新增 `STYLE.md`：写作规则与交稿自检。核心是六条——先具体后结论、禁用套话清单、每段至少一个可核
  事实、允许写不确定、句子长短要乱、别把每段收尾成总结。

### Why

同一批内容，结构越整齐越像模板填充。指标是"读完能不能记住一个具体的东西"，不是"看起来专不专业"。

---

## [0.8.2] — 2026-11-13

新增 **`MODELS.md`**：角色绑定模型的权威说明。

### Added

- `MODELS.md`：结论先行表（**官方推荐** vs **内置默认**两列分开）、测过的模型清单、测试方法与样本量
  （105 格 + 8 格 vision）、全量矩阵、在你的机器上怎么用、**暂不推荐清单**、局限与重测触发、英文摘要。
- 明确把 `opencode-go/deepseek-v4-pro` 列入「暂不推荐」：105 格唯一全满分，但属第三方网关且
  **当前性价比不足**（用户 2026-11-13 决定不纳入推荐）。

### Changed

- README 中英 §3 的长表**移入 `MODELS.md`**，只保留三条结论 + 指针——避免同一张表维护两份。

### Fixed

- 新增 4 条防漂移断言（`models-doc/AC-1..4`）：`MODELS.md` 的角色集合与「内置默认」列必须逐字匹配
  `lib/roles.js`、README 中英必须链接它、文档不得链接私有目录、必须记录 v4-pro 的暂缓决定。
  证伪：改错一个内置默认 → 红；删掉 README 链接 → 红。

---

## [0.8.1] — 2026-11-13

文档版：发布**官方推荐绑定表**，依据两轮实测。

### Added

- README（中英）§3 新增「推荐绑定（官方建议）」：8 个角色 × 两档（能力优先 / 内置默认）+ 逐条依据；
  并给出三条比表格更实用的结论——四个角色已到能力天花板（按成本选）、`vision` 不需要旗舰、
  两个要避开的坑（qwen3.7-plus 的结论自相矛盾、Kimi 不写指定产物）。
- 第六轮评测（vision 专项，4 模型 × 2 图像任务 = 8 格）：四模型全对，旗舰无增益；新增事实
  「Kimi K3 也具备视觉」。方法用自写 SVG → PNG 作夹具、逐字匹配，ground truth 不落被测可读目录。

### Notes

- 评测与结论档案仍只保存在本机私有档案库（`zhouxnsz/dsh-rolegroup-archive`，本日已建立异地备份），
  公开面只给结论与依据摘要，不链接私有目录。
- 内置默认绑定本版**不变**：能力优先档依赖第三方网关 `opencode-go`，不适合作为公共默认。

---

## [0.8.0] — 2026-11-13

面板模型统一：**所有角色都显示成普通行**，并顺带修好一个静默丢降级的缺陷。

### Added

- **接管态面板显示整张生效表**：内置表里有、你的覆盖表里没有的角色（例如后来版本新增的 `vision`）
  会自动补成普通行（带内置路由 + 备用链 + persona/摘要），可像其它行一样编辑。
  内置行没有删除按钮（`mergeRoles` 恒以内置为底，删了只会回落内置）；自定义行可删。

### Fixed

- **面板保存不再丢失 `fallbackModels`**：此前面板层刻意不带链，而"显式配置不继承内置链"，
  于是**面板接管后所有面板内的角色都静默失去了降级能力**（主路由不可用 → 直接剪枝）。
  现在 `rolesToSection` / `sectionToFileConfig` / `SECTION_FIELDS` / 客户端 `normalizeRow` 全程携带，
  并用 `parseRouteRef` 校验格式；**历史遗留的无链旧行会在打开面板时自动补回内置链**（面板从不提供链
  的编辑入口，故"缺失"只可能是历史遗留），保存一次即写回。
- 移除了 0.7.0 引入的「继承自内置」只读清单——用户实测两次找不到，等于没做；改为普通行后不再有特例。

### Changed

- 测试标签 `v0.7/AC-*` 与本版新增的 `v0.8/AC-*` 并存（前者是面板可见性方案的首版，后者是统一后的口径）。

---

## [0.7.0] — 2026-11-13

`0.6.1` 之后的下一版本（含新功能与一处 dsh 兼容性破坏）。要求 **dsh ≥ 0.2.1-rc.1**。

### Added

- **角色化委派**：一次定义角色（名字 + 绑定模型 + persona），委派时用角色名，工具名即角色名。
  每个角色 = 一个 `dsh-tool-subagent` 实例 + 一个自动生成的 Agent Preset。
- **内置 8 个角色**：`analyst` / `planner` / `coder` / `reviewer` / `scout` / `scribe` /
  **`vision`（多模态，看图）** / `fallback`。
- **多模态 `vision` 角色**：绑定 `qwen3.8-flash`（依据：作者在 omo 的长期实践 + 项目内 `scout-02`
  子会话 OCR 探针 10/10）。备用链只放 `deepseek-flash`（同样 10/10 且唯一保证注册）；
  明确排除 `MiniMax-M3`（同批 4/10 且编造内容）。persona 内写死「看不清就说看不清，绝不猜测」。
- **模型备用链 `fallbackModels`**：按「主路由 → 备用链」在**启动期**挑第一个可用路由；
  provider 全部不可用时才剪枝。显式配置的角色**不继承**内置链（决策：显式配置不自动降级）。
- **`/rolegroup init`**：按本机**实际可用**路由生成起始 `rolegroup.jsonc`；
  支持 `--write` / `--project` / `--diff` / `--force`（覆盖前备份 `.bak-<时间戳>`），
  写入前做层检查（面板接管 / 项目文件存在时拒绝，避免「写成功但不生效」）。
- **`/rolegroup doctor`**：读启动快照，逐项报告角色绑定与模型可用性，异常给修复建议；
  支持备用档标注、配置年龄提示、模型名近似建议。
- **设置页「角色配置」面板**：可视化增删角色、改 provider/model/persona/摘要/推理档位；
  支持接管/重置、`reasoningEffort` 按模型目录渲染、provider 未注册提示与「按可用模型补齐」、
  **接管态下未覆盖的内置角色以只读清单列出**（不会写进覆盖表，避免丢备用链）。
- **「配置文件」查看器**：loopback 只读路由 `GET|HEAD /api/dsh-rolegroup/config`，
  返回启动时读入的内存快照（不按请求参数读盘）；响应带 `nosniff`。
- **运行时降级可见**：角色被剪枝/注册失败/契约不可用时，系统提示里追加一行「运行时降级」，
  让模型也知道该换角色或告诉用户怎么修（健康时不出现）。
- 中英双语 README/词典；`/rolegroup` 命令帮助。

### Changed

- 配置层语义明确为**整层择一**：settings 面板 > 项目 `rolegroup.jsonc` > 用户 `rolegroup.jsonc` >
  内置表；胜出层 + 内置表补底（「零角色」不可表达）。
- 角色子会话**不可再委派**（`maxDepth: 1`）。实现上剔除的是委派组（`subagent`/`workflow` 等）；
  角色工具因注册在 host 平面仍在子会话工具列表可见，调用会被 `maxDepth` 在运行期拒绝（已知噪音）。
- 面板注册在**设置页一节**（`settings.section`），不再作为插件页卡片——避免被错误归入「官方」组。

### Fixed

- 「配置文件」查看器在面板保存后少报行（快照数据源误用了「客户端原始 section」）。
- doctor 的「配置年龄提示」把已被面板接管的 jsonc 文件年龄算到面板头上。
- dsh 约定缺失时热重组装会清空 `failed[]`，丢失 fail-loud 信号。
- 层语义文档与实现不一致（曾写成「未列出的照旧沿用下层」）。

### Breaking

- **不再支持 dsh < 0.2.1**：0.2.1 起 `dsh-tool-subagent` 拒绝内联 `persona`/`toolFilter`，
  persona 必须由 Agent Preset 承载。旧版本宿主上插件仍加载，但**角色不注册**并打明确警告。
- **`readonly` 字段已移除**（v0.5 起）：工具面白名单表达不了权限边界。
  老配置里残留该字段会得到**迁移提示**；只读请用会话级 permission preset（随委派继承）。

---

## English summary

Next release after the published `0.6.1`, requires dsh ≥ 0.2.1-rc.1. Each role = one delegation-tool instance plus an
auto-generated Agent Preset (persona lives there). Eight built-in roles including a multimodal `vision`
role (qwen3.8-flash; fallback chain limited to deepseek-flash; MiniMax-M3 excluded). Adds startup-time
model fallback chains, `/rolegroup init`, `/rolegroup doctor`, a settings-page panel (with a read-only
"inherited built-in roles" list), a loopback-only config viewer route, and runtime-degradation visibility
in the system prompt. Breaking: dsh < 0.2.1 is no longer supported (upstream rejects inline `persona`),
and the `readonly` field was removed in favour of session-level permission presets.
