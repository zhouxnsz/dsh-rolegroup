# AGENTS.md —— dsh-rolegroup 开发说明

> 面向 **在本仓库工作的 agent 与贡献者**。dsh 会自动把本文件载入会话上下文
> （项目根 = 含 `.git` 的目录；候选名 `AGENTS.md` / `CLAUDE.md`）。
> 机器本地、不入库的补充请写 `AGENTS.local.md`（已在 `.gitignore` 内）。

## 这是什么

dsh 的**角色化委派插件**：角色 = 名字 + 绑定模型 + persona；每个角色 = 一个宿主
`dsh-tool-subagent` 实例 + 一个**自动生成的 Agent Preset**（persona 住在后者），**角色名即工具名**。
**要求 dsh ≥ 0.2.1-rc.1**（0.2.1 系列起委派工具拒绝内联 persona）。定位与用法见 [README](./README.md) §1。

## 架构地图

| 路径 | 职责 |
|---|---|
| `lib/index.js` | 装配：读配置 → 合并 → 注册角色实例；volatile 变更 → 重组装；启动报告 |
| `lib/roles.js` | 内置角色表、配置合并（`mergeRoles`）、实例配置构建（`buildInstanceConfig`）、迁移提示文案 |
| `lib/presets.js` | 角色 Agent Preset 的纯函数构建：克隆默认 preset rows（JsExpr 按引用）/ 替换 persona / 剔除 delegation |
| `lib/config.js` | settings 条目 `Config`（schemastery）——命名空间的对外契约 |
| `lib/settings-table.js` | section ↔ 文件配置的双向映射、跨字段校验 |
| `lib/doctor.js` | 纯逻辑：快照读取/归一化、`auditRoles`、`renderDoctorText` |
| `lib/config-info.js` | 「配置文件」查看器：当前配置快照纯函数 + 仅本机的只读 web 路由 |
| `lib/command.js` | `/rolegroup` 命令面（doctor / init） |
| `lib/init.js` | `/rolegroup init` 纯逻辑：按可用路由生成起始 jsonc、项目/用户路径、覆盖前备份与 `--diff` 摘要 |
| `lib/startup-scheduler.js` | 剪枝防抖 + 最大等待上限 |
| `lib/jsonc.js` | 带注释 JSON 解析 |
| `src/client/` | 浏览器侧：`controller.js`（纯逻辑）、`card.jsx`（渲染）、`locales.js`（词典）、`meta.js`（版本/仓库元信息，版本由构建注入）、`config-file.js`（配置文件 → 右侧栏 Session 地址）、`settings-nav-icon.js`（设置页导航图标的 scoped CSS 装饰）、`index.js`（槽位注册） |
| `lib/client.js` | **构建产物**（esbuild 打包 `src/client/`）——**不要手改** |
| `locale/` | 插件元数据（`en.json` / `zh.json` 的 `meta.title` + `meta.description`）；`exports` 必须放行 `./locale/*.json`、`files` 必须含 `locale`，否则 dsh 的 `readPluginMeta` 解析不到 |

## 红线（动手前先读）

1. **settings 侧故障必须降级，绝不抛错。** 面板缺席可以接受，插件不可用不可以。
   典型：schemastery 软链缺失 → `Config` 缺席 → 只打一条 `console.warn`，host-only 角色照常工作。
2. **重组装必须串行化。** volatile 变更可能在 `compose()` 进行中到达，必须排队（`pendingTable`），
   否则并发装配会留下重复 fiber。
3. **启动报告字段仅加性。** 既有键不得删除或改语义：
   `time` / `configSource` / `configError` / `configMtimeMs` / `registered` / `invalid` / `failed` / `problems`。
   **唯一例外**：v0.5 从 `registered[]` 移除了 `readonly`（该字段承载的语义已整体废弃，代码内已注明理由）；
   相应地 `doctor` 必须**容忍磁盘上的旧格式快照**——多余键一律忽略、不计异常。
   （`configMtimeMs` 的口径澄清：它一贯的含义是「**生效**配置文件的 mtime」，即**生效来源就是那个
   jsonc 文件**时才透出；面板接管/内置表为 null。写入侧 2026-10-15 起按此把关——原先接管时也照抄
   被让位文件的 mtime，是写入侧缺陷，不是本键改语义。）

## 边界（明确不做，不是待办）

在 dsh 这种「一切插件化」的生态里，**专注 = 更小的爆炸半径**：上游一次断档、两个插件抢同一个
扩展点，大而全的插件会一次性覆盖多个面。以下边界是设计决策，改之前先来讨论：

| 不做 | 理由 |
|---|---|
| **不做编排**（DAG / 多轮协作 / 团队流水线 / 执行模式） | 官方智能体团队负责编排；两套编排互相踩 |
| **不注册 MCP server、不批量注入工具** | 会把工具列表、权限面、prompt 预算一起撑大；角色工具已 8 个；继续增长时应考虑「单工具 + 角色目录」（backlog） |
| **不写项目级状态目录**（`.rolegroup/` 之类） | 我们是路由层，不是运行时状态机 |
| **不接管主会话的 Agent Preset** | 显式 preset 是**替换**父组合（见坑清单）；接管等于替用户选模式 |
| **不为旧 dsh 线保留双形态分支** | v0.6 起只支持 ≥0.2.1：旧线 fail-loud，而不是半残运行 |
| **不用工具面白名单表达权限边界** | 见「贡献 · 权限相关」：只读用会话级 permission preset |

对照：`oh-my-deepseekharness`（omd）走的是相反的「大而全」路线（33 角色卡 + 58 MCP 工具 + HUD +
graph/team 运行时）。它有值得学的点（**能力矩阵进系统提示**、**暴露面登记**、**engines 覆盖断言**），
这三条已在 v0.7 吸收；其余不跟。

## 容易踩的坑（都真实发生过）

- **`lib/client.js` 是产物**：改 `src/client/**` 或 `lib/roles.js`（其内置表会被打包进客户端）后，
  必须 `npm run build:client`。esbuild **不压缩**，连注释都会进产物——"改了注释忘了重建"会让产物与源码不一致。
- **面板注册在 `settings.section`（设置页的一节），不要改回 `plugins.item`**。2026-10-15 起如此，
  原因：Plugins 页把**所有** `plugins.item` 卡片无条件追加进「官方」组，而本插件不是官方插件
  （上游判据 `installed` = 在 profile `dependencies` 里、`optional` = 在硬编码 `OPTIONAL_BUNDLES` 里，
  两条我们都不满足）→ 会被错误地标成"官方"。`settings.section` 需要 `label`（导航条目名）与 `order`。
  *若将来真要往 `plugins.item` 注册*：那个槽位会对同一张卡片渲染多次（列表行与详情页描述区传
  `view: "summary"`、详情页配置区传 `view: "page"`），组件**必须按 `props.view` 分流**，否则会叠卡片
  —— `card.jsx` 里那一行 guard 就是为此保留的。
- **接管判据必须是显式布尔位**：不能用"`roles` 数组是否为空"判断面板是否接管——schemastery 会把数组
  自动补成 `[]`，"字段缺省"与"显式空数组"在解析值上不可区分。
- **层语义是「整层择一」，不是逐角色缝合**：jsonc 链「第一个命中即停」，面板 `enabled=true` 则**整层接管**——
  `mergeRoles` 恒以内置表为底，所以接管后**只写在 jsonc 里、没搬进面板的角色会回落内置表**（jsonc 整层让位），
  不是"沿用下层"。面板空覆盖表 = 不做任何覆盖 = 回到全部内置角色，故「零角色」不可表达。
  README §4/§5 已按此写死；**别再写成「未列出的照旧沿用下层」**（2026-10-15 实测：这句会让用户以为
  jsonc 覆盖还在生效，而它已被整层让位）。
- **dsh 0.2.1 起 `persona`/`toolFilter`/`backgroundMode` 被 tool-subagent 拒绝**（出现即 throw）；persona
  必须住 **Agent Preset**。而显式 `agentPreset` 是**替换**父组合（不选才 `composeFrom` 继承）——所以角色
  preset 必须**克隆默认 preset 的完整 rows**（`lib/presets.js`）；persona-only preset 会让角色子会话零工具/
  零指令（v0.6 前的一版 spec 因此被对抗性审阅打回）。**`!!js` 表达式（JsExpr 实例）必须按引用保留**，JSON
  深拷会破坏它。
- **角色基底 = `agentPresets.defaultId`**（用户默认模式，本机 `standard`），**不跟随单会话选择的模式**；
  preset rows 从 `ctx.loader.entries()` 取**有效** `config.plugins`（profile patch 覆盖会反映在这里）。
- **preset 生命周期**：apply **开头**注册 early effect，卸载时 await 回收全部 preset+fiber——否则孤儿
  preset 会让重载撞 `Duplicate agent preset` 并使全部角色失败。`register()` **吞掉**激活失败（只写
  `broken`），必须自己审计。
- **preset 健康审计只能在 finalize 做**：在 apply（宿主 row activation）里调 `list()/resolve()` 会触发
  registry `await owner.loader.await()` **自等挂死**；审计异常/超时必须只 warn，且**报告必须写出**。
- **`maxDepth` 配 `0` 会把顶层委派也挡掉**，不只是禁止套娃。
- **`reasoningEffort` 不是自由文本**：必须落在模型目录声明的档位内，否则委派预检失败。客户端面板按目录
  渲染下拉（空 = 模型默认档位），非法值标红并阻止保存，切换模型时清掉新模型不支持的旧值；内置角色
  刻意留空，让各模型使用默认档位。
- **子代理 UI 不显示模型**：`dsh-subagent` 的 descriptor 已有 `agentModel`，但
  `dsh-client-ui-subagent` 没有独立 model chip。插件把模型写进 **Agent Preset 名称**
  （`presetDisplayName` → header 角色标签显示 `角色：scout · deepseek-flash`）和 **subagent label**
  （`roleAnnouncement` 要求父模型把 `provider/model` 写进 `description`）；根治仍需上游 UI 显示 descriptor
  或提供 slot。
- **设置页导航图标没有 slot 入参**：shell 按 section id 硬编码 `navIcon`，未知 id 一律齿轮。客户端用
  `settings-nav-icon.js` 给「角色配置」按钮打 `data-dsh-rg-nav`，再用 scoped CSS mask 换成 rolegroup
  线稿；shell 改结构或浏览器不支持 mask 时自动退回齿轮，不影响设置页。**不要**改成替换 React 子节点。
- **`engines.dsh` 的 semver 坑**：`>=0.2.1` **不包含** `0.2.1-rc.2`（prerelease 被排除）。插件市场/
  插件管理器按 `engines.dsh` 判兼容，写错会让插件卡片直接显示「异常」并跳过 meta（连图标都不读）。
  当前范围是 `>=0.2.1-rc.1`。
- **内置链便宜档优先**：`deepseek-flash` → `deepseek-v4-pro`，v4-pro 只在 flash 不可用时兜底（额度价值判断：
  v4-pro 在 coding 榜排名低于 flash，且无专属订阅，不作为默认第一兜底）。
- **备用链有硬约束：只能指向 `deepseek-official`**（唯一保证注册的 provider，`tests` 里有 `.every(...)` 断言）。
  想加别的 provider 进链会直接红——这是可用性优先的既定取舍，不是笔误。
- **`vision` 角色（0.8.0）的选型与排除**：主路由 `qwen-token-plan-cn/qwen3.8-flash`，依据是两条独立证据
  （作者 omo 长期实践 + `scout-02` 子会话 OCR 10/10）。备用链只放 `deepseek-official/deepseek-flash`；
  **`MiniMax-M3` 必须排除**（同批 4/10 且编造内容）、**`v4-pro` 不放**（视觉未测）。上游没有视觉能力位，
  插件无法在启动期校验，故 persona 写死「看不清就说不清，绝不猜测」，README 给出自测方法。
- **模型链是「启动期解析」不是运行期切换**：`dsh-tool-subagent` 的 `agentOptions` 在注册时固定，所以
  备用档只能靠**重挂 fiber + 重注册 preset** 生效（`finalize` 里做，顺序：注销 fiber → 注销 preset →
  注册 preset → 注册 fiber）。preset 的 name/description 带模型，故降级后必须重建 preset，否则子代理
  header 会继续显示原主路由。
- **显式配置不自动降级**（决策 1）：`mergeRoles` 给每个角色打 `strict`（出现于用户配置即 true）；
  用户的角色若没写 `fallbackModels`，**不继承**内置链。内置链只服务「用户没写这个角色」的情形。
- **面板层不携带模型链**（layer 1）：`rolesToSection` / `sectionToFileConfig` 白名单里没有
  `fallbackModels`，面板保存会丢链；这是刻意的——面板=显式配置，链只在 jsonc 里声明。若将来给面板
  加链编辑，必须同时改这三处映射并补 round-trip 断言。
- **面板的「按可用模型补齐」只改草稿**（`fillUnavailableRoutes`）：缺口判定 = provider 不在
  `modelCatalog.groups`（已注册 provider 清单）里；补齐目标 = `modelCatalog.default`，没有则第一个可用
  provider 的第一个模型；换模型会清掉旧 `reasoningEffort`（新模型未必支持）。写入仍走用户点「保存」，
  不要改成自动保存。
- **`init` 必须先做层检查**（v0.6.3）：`installRolegroupCommands` 的 `describeLayer` 回调给出「现在生效的
  是哪一层」。面板接管 → `--write` 拒绝（jsonc 整层让位）；项目级文件生效 → 用户级写入拒绝，提示改用
  `--project`；`--force` 覆盖前会备份 `<path>.bak-<ts>`。别把这段检查删成"总是写"，否则会产出
  「写成功但不生效」的文件。
- **`init` 只覆盖「主路由不可用」的角色**：生成的 jsonc 是一份**显式**配置（写入的角色变 strict，
  不再自动降级），所以每条都带上剩余备用链；完全没有可用路由的角色不写条目（空 provider 会让
  `mergeRoles` 整条跳过），只留注释。落盘默认 `wx`（拒绝覆盖），`--force` 才 `w`。
- **配置查看路由有暴露面，必须登记**（v0.7）：`GET|HEAD /api/dsh-rolegroup/config` 是**绕过 `/api`
  认证层**的 loopback 只读路由（无认证）。安全性质靠三条：① handler 只返回**内存快照**、从不按
  request URL/查询串读盘（无任意文件读/路径穿越，`tests/smoke.mjs` 的 v0.7/AC-10 用恶意查询串锁死）；
  ② `isLoopbackAddress` 只放行 `127.0.0.0/8`、`::1`、`::ffff:127.0.0.1`；③ 非 GET/HEAD 一律 405。
  **改动这条路由时**：不要引入任何「按参数读文件」的分支，不要放宽 loopback 判定，并保持
  `x-content-type-options: nosniff`（防 JSON 被 `<script>` 引用执行）。新增任何本机路由都要在
  README 的暴露面段落登记。
- **配置不热生效**：快照只在启动剪枝终验时写一次；改配置需重启 + 开新会话。
- **provider 未注册的角色会被剪枝**（不注册、只记进 `invalid[]`）——但这条只对**显式配置**的角色成立：
  内置角色带备用链，会先降级到 `deepseek-official` 再谈剪枝（见上两条）。兜底角色尤其要留意：
  一条被剪枝的兜底路由等于不存在。

## settings 模型（0.1.7+；本插件 v0.4 迁入）

- **命名空间 = loader 条目 id**（`dsh-rolegroup`）；schema = 该条目**静态导出**的 `Config`。
- **只有 `meta.volatile` 字段可描述/可写**；`Config.roles` 是整数组 volatile。
- **生效通知**走 `ctx.on('loader/volatile-update', …)`（旧的 `SettingsScope.watch` 已不存在）。
- **客户端**经 `ctx.configForms.whileServed([ns], …)` 门控，往 `settings.section` 槽注册设置页一节
  （`label` = 导航名、`order` = 位置）；读写走 `ConfigFormController` 的
  `getSnapshot` / `subscribe` / `mutate`。
- **四层优先级**（**整层择一**，见「容易踩的坑」）：settings 面板 > 项目 `rolegroup.jsonc` >
  用户 `rolegroup.jsonc` > 内置表。
- **未接管时编辑表由 host 只读快照预填**（`lib/config-info.js` 的 `effective.roles`，含 persona/summary/
  reasoningEffort）；只有改动后保存才写 `enabled=true` + `roles`（显式接管）。接口不可用时降级为空覆盖表 +
  手动新增（页内提示，不崩）。

## 开发流程

```sh
npm install           # ★ 首次 clone 后必跑（devDependency esbuild）
npm test              # 离线 smoke suite（纯逻辑，Node 直跑，无浏览器依赖）
npm run link:deps     # ★ 首次 clone 后、以及 dsh 升级/换部署树后必跑（见下）
npm run build:client  # 重建 lib/client.js
```

**为什么需要 `link:deps`**：本仓库是 `link:` 形态（真实路径 = 本仓库），按 Node 的 realpath 规则
**无法裸导入 `@deepseek-ai/*`**；而 settings 范式要求条目**静态导出** schemastery `Config`，不能延迟解析。
故把部署树的 schemastery 软链进本仓库 `node_modules`（软链**不入库**，`pretest` 会自动重建）。

### 测试纪律

- **每条新断言都要有证伪力**：写完先"临时破坏实现"确认它变红，再恢复。恒真的断言不算测试。
- 用**精确判据**（具体值 / 集合 / 渲染文本），不用"不抛异常"这类弱判据。
- 已有断言原则上不改；确需改时在提交信息里说明原因。
- README 中英两版**章节编号必须一致**，且**不得链接未随仓库公开的目录**（有断言锁着）。

### 提交与发布

- 提交信息写清 **背景 / 改法 / BREAKING / 验证**；行为破坏性变更加 `!` 与 `BREAKING CHANGE:`。
- 面向用户的行为变更要有 README 对应段落（中英同步）。

## 贡献（PR）

- 先开 issue 说清要解决的问题，或在 PR 描述里写清 **问题 → 改法 → 验证方式**。
- PR 要求：
  - `npm test` 全绿；
  - 改了 `src/client/**` 或 `lib/roles.js` 则**产物已重建**；
  - 不带入与主题无关的重构或格式化；
  - 新增行为有对应断言，且该断言**在旧实现上会红**。
- **权限相关**：不要用工具面白名单表达权限边界（它表达不了）。只读请用**会话级 permission preset**
  （`read-only` / `workspace-write` / `danger-full-access`），角色的只读倾向用 `persona` 软约束。

## License

MIT
