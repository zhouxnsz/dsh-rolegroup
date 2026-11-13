# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
版本纪律见 `AGENTS.md`「提交与发布」。

> **`npm` 上一个已发布版本是 `0.6.1`。** 这期间开发中用过 0.6.2 / 0.6.3 / 0.8.0 等内部里程碑号，
> 但都没有发布；下面 `0.7.0` 是**自 `0.6.1` 以来的累积变更**（按 semver 只升一个 minor，不跳号）。

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
