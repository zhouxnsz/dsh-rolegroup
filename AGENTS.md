# AGENTS.md —— dsh-rolegroup 开发说明

> 面向 **在本仓库工作的 agent 与贡献者**。dsh 会自动把本文件载入会话上下文
> （项目根 = 含 `.git` 的目录；候选名 `AGENTS.md` / `CLAUDE.md`）。
> 机器本地、不入库的补充请写 `AGENTS.local.md`（已在 `.gitignore` 内）。

## 这是什么

dsh 的**角色化委派插件**：角色 = 名字 + 绑定模型 + persona；每个角色挂一个宿主
`dsh-tool-subagent` 实例，**角色名即工具名**。定位与用法见 [README](./README.md) §1。

## 架构地图

| 路径 | 职责 |
|---|---|
| `lib/index.js` | 装配：读配置 → 合并 → 注册角色实例；volatile 变更 → 重组装；启动报告 |
| `lib/roles.js` | 内置角色表、配置合并（`mergeRoles`）、实例配置构建（`buildInstanceConfig`）、迁移提示文案 |
| `lib/config.js` | settings 条目 `Config`（schemastery）——命名空间的对外契约 |
| `lib/settings-table.js` | section ↔ 文件配置的双向映射、跨字段校验 |
| `lib/doctor.js` | 纯逻辑：快照读取/归一化、`auditRoles`、`renderDoctorText` |
| `lib/command.js` | `/rolegroup` 命令面 |
| `lib/startup-scheduler.js` | 剪枝防抖 + 最大等待上限 |
| `lib/jsonc.js` | 带注释 JSON 解析 |
| `src/client/` | 浏览器侧：`controller.js`（纯逻辑）、`card.jsx`（渲染）、`locales.js`（词典）、`index.js`（槽位注册） |
| `lib/client.js` | **构建产物**（esbuild 打包 `src/client/`）——**不要手改** |

## 红线（动手前先读）

1. **settings 侧故障必须降级，绝不抛错。** 面板缺席可以接受，插件不可用不可以。
   典型：schemastery 软链缺失 → `Config` 缺席 → 只打一条 `console.warn`，host-only 角色照常工作。
2. **重组装必须串行化。** volatile 变更可能在 `compose()` 进行中到达，必须排队（`pendingTable`），
   否则并发装配会留下重复 fiber。
3. **启动报告字段仅加性。** 既有键不得删除或改语义：
   `time` / `configSource` / `configError` / `configMtimeMs` / `registered` / `invalid` / `failed` / `problems`。
   **唯一例外**：v0.5 从 `registered[]` 移除了 `readonly`（该字段承载的语义已整体废弃，代码内已注明理由）；
   相应地 `doctor` 必须**容忍磁盘上的旧格式快照**——多余键一律忽略、不计异常。

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
- **`mergeRoles` 恒以内置表为底** → "零角色"不可表达；面板里的空覆盖表 = 不做任何覆盖 = 回到内置 7 角色。
- **`maxDepth` 配 `0` 会把顶层委派也挡掉**，不只是禁止套娃。
- **配置不热生效**：快照只在启动剪枝终验时写一次；改配置需重启 + 开新会话。
- **provider 未注册的角色会被剪枝**（不注册、只记进 `invalid[]`）。兜底角色尤其要留意：
  一条被剪枝的兜底路由等于不存在。

## settings 模型（0.1.7+；本插件 v0.4 迁入）

- **命名空间 = loader 条目 id**（`dsh-rolegroup`）；schema = 该条目**静态导出**的 `Config`。
- **只有 `meta.volatile` 字段可描述/可写**；`Config.roles` 是整数组 volatile。
- **生效通知**走 `ctx.on('loader/volatile-update', …)`（旧的 `SettingsScope.watch` 已不存在）。
- **客户端**经 `ctx.configForms.whileServed([ns], …)` 门控，往 `settings.section` 槽注册设置页一节
  （`label` = 导航名、`order` = 位置）；读写走 `ConfigFormController` 的
  `getSnapshot` / `subscribe` / `mutate`。
- **四层优先级**：settings 面板 > 项目 `rolegroup.jsonc` > 用户 `rolegroup.jsonc` > 内置表。

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
