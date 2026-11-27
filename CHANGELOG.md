# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
版本纪律见 `AGENTS.md`「提交与发布」。

> **历史注记**：`0.7.0` 发布前，npm 上的上一版本是 `0.6.1`；这期间开发中用过 0.6.2 / 0.6.3 / 0.8.0 等
> 内部里程碑号但都没发布，所以 `0.7.0` 是**自 `0.6.1` 以来的累积变更**（按 semver 只升一个 minor，不跳号）。
> 当前 npm 上的 latest 见 registry（2026-11-27 查 `dist-tags.latest` = `0.12.2`）。

---

## [0.13.0] — 2026-11-26

### Changed

- 设置页改为「角色列表 + 单角色编辑区 + 常显保存栏」，切换角色保留整张草稿；配置来源、角色来源和未保存修改分开显示。
- 备用路由按配置顺序只读展示，空链有说明；主路由仍保留目录外的旧值。
- 新增角色后选中并聚焦工具名；逐行标记修改，自定义角色可从列表或编辑器删除，内置角色没有删除入口。
- `analyst` 内置绑定从 `qwen3.8-max` 更新为 `qwen4-max`；在本机 harness 完成事实核验与设计评审对照后换绑，未观察到质量回退。
- README 中英两版改用本地化品牌 banner + 徽章 + 目录 + 功能概览；设置面板截图裁掉左侧导航后放进 §5，`assets/banners` 与 `assets/screenshots` 随 npm 包发布。

### Fixed

- 保存或恢复官方推荐失败时保留草稿并退出保存中状态；显式空 `fallbackModels` 在面板与 section 映射间不再被补成内置链。
- 设置面板 clean 状态的禁用保存/放弃增加高特异度 `not-allowed` 光标（不再被通用 `cursor: default` 覆盖）与悬停说明，提示改为「没有未保存修改；改任意字段后可保存」，避免把禁用误判为按钮失效。
- 新增、删除、重命名、外部快照更新后的选中项始终指向可见角色；补齐字段标签、错误关联、键盘焦点和窄屏布局。
- summary 使用独立阅读高度并保留纵向 resize 与滚动条 gutter；主路由按容器 auto-fit，避免窄右栏固定三列截断完整值。禁用保存按钮不再叠 50% 透明，修改徽标正文与 warn 边框分开使用宿主 token。
- 布局断点改为按**卡片容器宽度**（容器查询）而不是视口宽度。设置弹层正文只有约 600px，而视口约 1400px，原先按视口写的窄屏规则永不触发，编辑器被挤到约 290px。现在窄容器下改为「角色条在上、全宽编辑器在下」，角色标签隐藏冗余的「内置角色」chips、摘要按内容自适应高度（`field-sizing`，不支持时回落 140px）。

### 验证

- `npm test` 200 passed（新增 README 图片引用断言）；`npm run build:client` 在 UI 改动后成功，`git diff --check` 通过。新增 4 组行为回归，并在既有用例中补充 restore guard、嵌套 button 和真实 bundle 视觉结构断言。
- 2026-11-27 analyst 换绑门槛：`qwen3.8-max` / `qwen4-max` 各跑事实核验 1 次、设计评审 1 次；启动报告确认候选实际走 `qwen4-max`、无降级。两版判定与引用均合格，候选额外完成只读运行时复核，并识别零覆盖跟随与 `reasoningEffort` 清理路径。
- 24 个临时副本 mutation 均被对应断言拒绝，无 surviving。archive 旧实现复核在 T1-1 首个失败即终止，只作为 T1-1 证据；T2/T3/T4 的红来自此前分阶段运行。
- 现有 3080 / dsh 0.2.2-rc.5 验证了 8 角色切换、跨角色草稿与放弃、新增/聚焦样式/本地校验/重命名/删除、备用链、模型切回、中英和 light/dark；全程未做有效配置保存。
- 修复后 2891×1450 真机图确认 analyst/vision 摘要不再截成半行，provider 与模型标签完整显示；新增校验和 light/dark 保存栏的按钮、徽标可读性改善。测试后已放弃草稿并恢复 Light + 中文。
- 容器查询落地后，在 3080 真实设置弹层（正文约 600px）复核：8 个角色一行铺开、编辑器全宽，`qwen-token-plan-cn` / `Qwen3.8 Max` 完整可见，analyst 与 vision 摘要均完整无裁切；证据见内部验收档案（不随仓库公开）。
- UNVERIFIED：1280/768/390 视口与 DOM 几何测量、console、对比度数值、真实保存/恢复成功及真实写入失败/冲突；离线用例覆盖这些状态机路径。

The settings section now uses a role list, a single-role editor, and an always-visible save bar. Drafts survive
role switches and failed writes; source and modified states are separate. Fallback chains are read-only in
configuration order, explicit empty chains round-trip, and legacy routes remain available. Selection repair,
field accessibility, keyboard focus, and narrow layouts are covered by offline render tests. Summaries have
room to read, route fields wrap by container width, and disabled actions and modified badges stay legible.
The bilingual READMEs now use a localized hero banner, badges, a table of contents, and a cropped settings-panel screenshot in §5. Disabled Save/Discard actions now explain that an edit is required. The analyst built-in binding moves from qwen3.8-max to qwen4-max after a same-role fact and design comparison; the startup report confirms qwen4-max ran without fallback.

---

## [0.12.2] — 2026-11-20

### Fixed

- 角色公告此前写「角色不继承你的上下文」，容易把「不继承父会话对话」误读成「没有 AGENTS.md 和技能目录」。
  现明确：角色不继承父会话的对话历史或已加载的技能正文；项目指令与技能目录由角色 preset 按子会话 cwd
  重新组合，简报仍须自包含。README 中英同步澄清。

### Added

- 新增两条离线回归断言：① 角色 preset 保留 `agent-instructions`、`skill-filesystem` 和 `tool-skill`，只剔除
  delegation 组；② 公告逐字保留上述上下文边界。
- README 中英新增「与规格驱动工作流配合」用法：OpenSpec 的 `status` / `instructions apply` 输入如何交给
  coder、并行 coder 时主会话独占任务状态勾选、`validate` 不能替代 verify 或 specs diff。这里记录的是使用约定，
  不是新增 OpenSpec 集成功能。

### 验证

- `npm test` 160 passed；`npm run build:client` 重建成功；`git diff --check` 通过。
- 证伪：临时过滤 `tool-skill` → preset 断言变红；临时改回公告旧句 → 公告断言变红；恢复后全绿。
- 独立 reviewer 核对无阻塞项；其指出的 `changeRoot`（来自 `status`）与 `contextFiles` / 任务位置（来自
  `instructions apply`）归属问题已修正。

Clarifies that role children do not inherit parent conversation history or loaded skill bodies, while project
instructions and skill catalogs are recomposed from the role preset for the child cwd. Adds regression coverage and
bilingual guidance for specification-driven workflows.

---

## [0.12.1] — 2026-11-19

### Fixed

- **实例配置不再携带已退役键 `modelSelectionSettings`**（dsh 0.2.2-rc.5 核对，2026-11-19）。该键在
  0.2.1-rc.1 起被上游改名为 `modelSelection`（升级指南
  `docs/upgrade-guide/v0.2.1-rc.1/subagent-control-tools/guide.md:12`），
  rc.5 的 schema 对旧键名**不消费也不报错**——传 `true` 也不会开启调用期路由字段。此前它一直躺在
  `buildInstanceConfig` 里，靠 schemastery「未知键原样保留」侥幸无害；现删除，行为不变（缺省即 false）。
- 注释与文档同步：`lib/index.js` / `lib/roles.js` 头注中关于 `install(ctx, undefined)` 站立式组合、
  `assertAllowedModelSelection` 白名单的说法改为按 rc.5 契约措辞（`modelSelection` 缺省 false → 不暴露
  调用期路由字段）。

### Changed

- README 中英「本机实测」版本改为 0.2.2-rc.5（`engines.dsh` 保持 `>=0.2.1-rc.1`）。
- **设置页导航图标改用官方 `settings.section.icon` 槽位注册**（rc.5 新增，contract/slots.d.ts:85），
  替换旧的「data 属性 + scoped CSS mask」装饰 hack；registration id = section id（`rolegroup`）。
  组件是 settings-nav-icon.js 导出的真 React 组件（顶层 `import * as React from 'react'`——client
  环境不存在全局 React 注入点，第一版那么取导致图标渲染为空，2026-11-19 截图实证后修复）；
  `index.js` 经动态 import 取 NavGlyph 并 catch 兜底。**低版本 dsh（< rc.5）上该注册无消费方 =
  静默 no-op**，其余功能不受影响，故 engines.dsh 维持 `>=0.2.1-rc.1`；README 中英头部各加一行说明。
  浏览器验收通过（2026-11-19 用户确认图标出现）。
- 新增两条部署树断言（`tests/smoke.mjs`）：① `buildInstanceConfig` 的输出经 rc.5 真实 Config schema
  逐字段解析通过且不含退役键；② 旧键名即使传 `true` 也不改变 `modelSelection` 缺省语义（no-op 锁定）。
  证伪：把 `modelSelectionSettings: false` 塞回实现 → 第 ① 条红。
- 图标迁移的断言：svg 描述 + size 回落、createElement 展开计数、退役字符串卫生检查、
  gating 用例改按槽位名分流 + __dshRgStubImport 桩通道（node 不加载 react 依赖模块）。AGENTS.md 坑清单同步改写。

### 验证（0.2.2-rc.5 真机）

- 启动报告 8/8 注册，`failed` / `invalid` / `problems` 全空（`~/.dsh/plugins/dsh-rolegroup/last-startup.json`，2026-11-19T02:37:33Z）；
- schemastery 软链指向部署树 3.19.0，`npm run link:deps` 输出「无需改动」；
- `npm test` 158 passed；`npm run build:client` 重建产物含 `require("react")` 与 icon 槽位注册；
  浏览器实测图标出现（2026-11-19）。

### 核对过的升级项（均不适用）

`v0.2.2-rc.4/web-search-deepseek-model-default`（只改 web 搜索默认提供方）、
`v0.2.2-rc.3/deepseek-refusal-code`（错误码改名，插件不消费）。委派、Agent Preset、settings、
manifest、schemastery 五个依赖面逐项对照 rc.5 安装版源码核验，契约全部存活。

Removes the retired `modelSelectionSettings` key from instance configs (renamed to `modelSelection`
upstream since 0.2.1-rc.1; rc.5's schema ignores it silently). Behavior unchanged — the default is
already false. Adds two deployment-tree assertions that parse our instance config through the real
rc.5 Config schema and pin the retired key as a no-op. Updates the verified-on version in both READMEs
to 0.2.2-rc.5.

---

## [0.12.0] — 2026-11-16

### Added

- 新增 `/rg <任务>` 命令（`/rolegroup work <任务>` 长别名）：向主会话注入一条
  `source.kind='rolegroup'` 的委派指令；只主会话可用，子会话拒绝；不点名具体角色，按在册公告选择。

### Changed

- 角色委派方法论：`analyst` / `reviewer` / `scout` 的 persona 增加核验纪律（逐字引用、`UNVERIFIED`、
  `PARTIAL` 与 `FALSE` 的区分）；`roleAnnouncement` 增加简报模板、父 agent 规范（子任务结论是输入不是裁决）
  和角色分流（代码定位/事实取证 → scout，带验收标准的收口核对 → reviewer，设计判断 → analyst；
  实现任务已有结构化计划或规格才派 coder，未形成计划的可先派 planner）。
- 依据：2026-11-16 的四臂对照。同一 `analyst` 下，中性简报逐字准确；加了“如果全真就说 5/5 TRUE”的简报
  把 5 条部分成立的命题全判 `TRUE` 并编造引用。完整记录在内部评测档案，不随仓库公开。
- 角色公告明确备用链只在配置提供 `fallbackModels` 时生效，示例路由改为 `kimi-coding/k3.1-pro`，并明确角色工具仅主会话可用。
- coder/planner 去方法论化：内置 persona 不再写死 TDD 与 plans.md；计划/规格路径由调用方简报给出（兼容 openspec
  的 tasks.md、superpowers 的 docs/plans/*.md、changeflow 的 plans/<change>.md），验证节奏以计划描述为准。
  注意传播断点：已在面板保存过角色的用户，其内联 persona 不受内置表变更影响，需「恢复官方推荐」或手动编辑才能切换到新默认。

### Fixed

- 启动期改用备用档后，末次角色公告会按实际路由重发，并列出「已改用备用档」的角色；重挂失败或被 preset
  健康审计剔除的角色不会再同时出现在这条备用档提示里。
- 零在册角色且有降级时，公告只说明当前无角色、列出降级并给出 `/rolegroup doctor`，不再输出空角色列表、
  `fallback` 分流或简报模板；降级段也删去了并不总成立的「其余角色不受影响」。零角色且无降级时公告返回空串。
- provider 已注册但模型未在广告列表的角色，除了启动日志，现在也会在公告中列出「模型未在广告列表」及
  「委派预检可能失败」；降级与该预警可并存，风险条目使用 resolved 实际备用路由，不再错写主路由。
- 修复路由解析返回角色副本后按对象 key 回收导致的 fiber/preset 残留；重挂失败立即按 toolName 从有效角色
  剔除并回收资源，后续审计 reject/timeout 不再把它留在 registered，也不影响其他健康角色。
- 修正公告的备用链与证据要求：不再声称所有角色都有备用链；代码、运行、图片与外部事实分别要求文件:行号、
  命令与输出、区域/坐标和原始来源，无法复现的按 UNVERIFIED 处理。
- 文档修正与精简：源码首装改为 `npm install --omit=peer` → `link:deps`，analyst 示例回到
  `qwen3.8-max`，vision 备用链说明补齐账号档；删除过期的测试数量，合并重复安装说明并压缩 doctor 正常示例。

### 验证

- `npm test` 154 passed；
- `npm run build:client` 连跑两次，产物 hash 一致（构建确定性）；
- 真实 DSH 中 `/rolegroup doctor`：重载前后均 8 个角色在册，`failed` / `invalid` / `problems` 为空；
- 一次 `/rg` 实际委派：命中 `fallback`，返回了包名与版本；
- 插件停用再启用后，启动报告的时间字段有更新。

截至定版时尚未执行 `npm publish`。

### English summary

Adds `/rg` for role-based delegation from the main session. Changes delegation verification discipline
(verbatim citations, evidence requirements per fact type) and makes coder/planner methodology-neutral so
callers pass their own plan or spec paths. Fixes lifecycle cleanup (no leftover fiber/preset when
re-registration fails), warnings that now report the actual fallback route, and role announcement text that
no longer overclaims fallback chains or hides degradation states. Also corrects and trims the bilingual
installation, model, and diagnostics documentation.

---

## [0.11.7] — 2026-11-13

发布前把文档过了一遍，清掉最后几处"旧世界"残留（都不影响行为）。

### Changed

- README 中英的致谢段不再提"JSONC 配置格式"（配置文件层已删）；
- AGENTS 架构地图把 `settings-table.js` 的职责从"section ↔ 文件配置"改为"section ↔ 面板覆盖表"；
- AGENTS 的剪枝说明改为"沿链降级到 `deepseek-account` / `deepseek-official`"（链首已是账号）；
- 删掉测试文件里一段描述已删除测试的孤儿注释（还在讲"整层择一"）。

---

## [0.11.6] — 2026-11-13

第一次用 `dsh-browser-playwright-codex` 在真浏览器里点了一遍设置页（隔离 profile，不动用户配置）。

### Fixed

- **「推理档位」把"模型不可用"说成"该模型不支持"**：目录里没有该模型（凭据缺失 / provider 未注册）时
  `modelInfo` 存在但 `available === false`，代码却断言它不支持推理档位。现在分两种：`available === false`
  显示「模型不可用」，只有目录明确声明无档位时才说「该模型不支持推理档位」。

### 验证（浏览器实测，dsh 0.2.2-rc.3 + dsh-browser-playwright-codex 0.8.3）

- 官方推荐态：状态行「当前生效：官方推荐（内置表）」、8 行、`保存`/`放弃` 禁用、`恢复官方推荐` 不渲染；
- 新增角色 → 「未保存」+ 两个按钮可用；带空 provider 保存 → 页内「保存失败：请检查标红字段后重试」，
  **未发起写入**；删除该行 → 标记消失；
- 改一行后保存 → 状态变「面板自定义（8 行覆盖）」，`恢复官方推荐` 出现；
- 点「恢复官方推荐」→ 回到官方推荐态，行内容回到出厂值，按钮消失；profile patch 落盘为
  `enabled: true` + `roles: []`；
- 改一行后点「放弃」→ 值回到生效值，「未保存」消失；
- 内层滚动生效：头部与状态行固定、列表独立滚动、动作区固定在底部。

---

## [0.11.5] — 2026-11-13

dsh 升到 **0.2.2-rc.3**（跨了 `0.2.1-rc.3` → `0.2.2-rc.1` 四个升级目录）。按升级文档逐条核对，只命中
两个 subagent 相关变更，都不影响本插件；真机实测也通过。

### Changed

- README 中英的"本机实测"版本改为 0.2.2-rc.3（`engines.dsh` 保持 `>=0.2.1-rc.1`）。
- AGENTS 补充一条坑：dsh 升级后 `link:deps` 若报「已存在且不是软链」，说明本地留着一份旧版 schemastery
  真实副本（这次是 3.18.5 vs 部署树 3.19.0），两边不一致会让 settings 表单行为异常。删掉重跑即可。

### 验证（0.2.2-rc.3 真机）

- 启动报告 8/8 注册，`failed` / `invalid` / `problems` 全空；
- 委派链路实测：`scout` 子会话 header `agentPreset=rolegroup-scout`、depth 1，正常调用 `glob` + `read`
  并返回正确结果，`turn/end: completed`；
- `npm test` 138 passed（含 engines 覆盖断言）。

### 核对过的升级项（均不适用）

`subagent-names`（改的是调用参数与 `list_agents` 行格式，我们不消费）、`subagent-explicit-reasoning`
（要求调用时 provider/model 同时给出；我们把两者写在实例 Config 里，且 `modelSelectionSettings: false`）、
`model-listing-refresh`（我们没有自建列表缓存）、`context-menu` / `css-anchored-menus`（不使用菜单）。

---

## [0.11.4] — 2026-11-13

发布前的干净环境实测：在隔离 DSH_HOME、没有任何 qwen/kimi 凭据的机器上装 0.11.3，**8 个角色只注册了
2 个**，6 个被剪枝。市场审核装的大概率就是这种环境。

### Fixed

- **备用链比主路由严格**：主路由「provider 在册、模型不在广告列表」是宽容的（照用 + 警告），但链上的
  候选会被直接跳过。凭据缺失时模型列表为空，于是整条链不可用 → 角色被剪枝。现在链与主路由同口径：
  记下第一个"provider 在册、模型未广告"的候选并降级过去（带 `warning: 'model-unadvertised'`）。
  同一环境修复后 **8/8 注册、6 个标降级到 `deepseek-account/deepseek-flash`**。
- 剪枝原因、doctor 的修复建议、面板层级说明仍在让用户去改 `rolegroup.jsonc`（v0.11 起已不生效），
  并复述旧的三层优先级。统统改为指向「设置 → 角色配置」/ 两层模型。
- README 的目录表还列着已删除的 `config-info.js`、`config-file.js`。

### Changed

- 官方推荐态下不再渲染灰着的「恢复官方推荐」——与「补齐」按钮同一条规则：没活干就不显示。

### Added

- compose 级断言：干净环境（仅两个 DeepSeek provider、`listModels` 恒空）必须 8/8 在册、`invalid` 为空、
  恰 6 条带 `primary` 的降级记录。证伪：去掉链宽容 → 「2 !== 8」红。
- 断言：剪枝原因不得出现 `rolegroup.jsonc` 且必须指向设置面板；自定义态才渲染「恢复官方推荐」。

---

## [0.11.3] — 2026-11-13

README 大扫除。用户逐条指出哪几段该删：中文从 422 行降到 205 行，英文同比。

### Changed

- 删掉：角色/doctor 那两条卖点、边界段的引导句、"不为旧 dsh 线保留分支"一行、vision 选型依据整块、
  Agent Preset 那段解释、推荐绑定末尾的 provider 提示、§4 的状态表与字段清单、链后的两段说明、
  整个「运行时」块、§5 的全部正文（只留一句指路）、"裸 /rolegroup"与 GUI 粘贴提示、§8 兼容性、§9 常见问题。
- 章节重编号为 1–9（中英同步）。
- 顺手把 doctor 示例里的旧绑定（`k3` / `qwen3.8-max`）改成当前的 `k3.1-pro` / `qwen3.8-flash`。

### Fixed

- `package.json` 的 `files` 原先没有 `MODELS.md`：README 链着它，但 npm 包里没有这个文件。已补
  `MODELS.md` / `MODELS.en.md` / `CHANGELOG.md`。

---

## [0.11.2] — 2026-11-13

`MODELS.md` 收尾。两处因为 v0.11 变成假话的地方（"`rolegroup.jsonc` 会覆盖它"、"`init` 生成配置"），
外加用户要求补的两个场景。

### Changed

- `MODELS.md` / `MODELS.en.md` 重写为：一句说明 + 推荐表 + 两段场景说明——**只有 DeepSeek 时**会降级到
  哪（`deepseek-account/deepseek-flash`，以及怎么把 analyst/reviewer 改到 v4-pro）、**换用自己的
  provider** 时下拉为何只列已注册的（要重启）、以及怎么新增角色、怎么导出留档。
- 删掉"文档镜像"的说法：它现在就是内置默认值的说明，和代码里的表逐字一致。

### Removed

- 行数断言（原来锁 30 行）。用户说得对：行数不是问题，废话才是。改为锁「不得出现内部实现细节」
  （`lib/`、`src/client/`、`mergeRoles`、`fillBuiltinRows` 等）——文档是给用户看的，写源码路径说明
  写错了对象。证伪：往文档里塞一句 `lib/roles.js` → 红。

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
