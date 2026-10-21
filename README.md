# dsh-rolegroup

dsh 生态的**角色化委派插件**：把「这类活该用哪个模型」固化下来——一次定义**角色**（名字 + 绑定模型 + persona），
之后按角色名委派，不必每次手写 `provider`/`model`。每个角色挂一个宿主 `dsh-tool-subagent` 实例，**角色名即工具名**。

> 版本 **0.6.0** ｜ 实测适配 dsh **0.2.1-rc.2**（v0.6 起仅支持 ≥0.2.1）｜ License MIT

---

## 1. 为什么用它

模型搭配是一种**重复决策**：什么活值得上贵模型、什么活便宜模型就够。散落在每次委派里手写，既容易记错，
也没法把经验沉淀下来。

| | 你给它什么 | 它替你决定什么 | 约束 |
|---|---|---|---|
| 裸 `subagent` | 每次手写 provider/model | 无 | 每次都要记模型名 |
| **Agent Teams**（官方） | 任务 DAG / 名单 | **协调**：谁做、依赖、多轮 | teammate **继承 root 模型**，不能逐成员绑模型 |
| **dsh-rolegroup** | 一次定义角色 | **路由**：这类活 → 这个模型 | 一次性专家委派，不负责编排 |

**三者互补**：Agent Teams 管「怎么分工」，rolegroup 管「这类活该用哪个模型」。典型用法是把贵活/便宜活分流
（`reviewer` 用便宜模型、`coder` 用强模型），编排仍交给 Agent Teams。

> 文中出现的 `dsh-changeflow` 是本插件的**配套工作流层，目前未公开**——那些引用属设计来源与历史记录，
> **不影响本插件单独使用**（它不依赖任何 changeflow 代码）。

附带收益：

- **角色即工具名**——`analyst` / `coder` / `scout` 直接出现在工具列表，委派时不用想模型；
- **可诊断**——`/rolegroup doctor` 逐项列出「当前到底在用哪个模型」（含可用性，见 §6）。

## 2. 快速开始

### 装入 dsh

本地 `link:` 插件推荐挂在 **home 层**（不被 profile 重写覆盖，已扛过两次 dsh 升级）：

```sh
ln -sfn "$PWD" ~/.dsh/profiles/web/node_modules/dsh-rolegroup
cat >> ~/.dsh/cordis.patch.yml <<'YAML'
- insert:
    - id: dsh-rolegroup
      name: 'dsh-rolegroup'
YAML
```

> **也可以改用 0.2.0 的官方插件管理器**：`dsh plugin --profile web add "link:$PWD"`（写进 profile 依赖，
> Plugins 页「已安装」里可见/可启停）。
>
> **两者选一个，别同时用。** 取舍：
> - **home 层（上面那个，推荐）**：不在 profile 依赖里 → **不会被 profile 重写抹掉**（第三方 market 安装时
>   重写 profile，曾把本地插件静默清掉）；代价是**不在 Plugins 页「已安装」组里出现、没有启停开关**
>   （那一组的判据是「名字在 profile 依赖里」，见 §8）。它也**不会**出现在「官方」组——那一组的两个来源
>   都与本插件无关（§8），**与装法无关**。
> - **官方管理器**：标准做法、UI 里可见可启停；代价是回到「会被 profile 重写」的容器里。
> - 同时用**不会崩**（loader 按 id 去重、只挂一次），但会出现「UI 显示已安装、实际由 home 层控制、
>   启停开关不生效」的错位。

### 验证

```sh
dsh --profile web --dump-config | grep -A1 dsh-rolegroup   # 应出现 - id: dsh-rolegroup
```

重启 `dsh web` + 开**新会话**，工具列表里应出现 7 个角色工具；或在新会话里跑 `/rolegroup doctor`。

改代码/改配置后都需**重启 + 开新会话**（配置不热生效，见 §4）。

## 3. 内置角色

未提供任何配置时，插件注册这 7 个角色（绑定模型为**内置初值**，可被 `rolegroup.jsonc` 覆盖）：

| 角色 | 内置绑定模型 | 职责 |
|---|---|---|
| `analyst` | `qwen-token-plan-cn/qwen3.8-max` | 需求澄清、路径分类、方案评审（做不做/怎么做）、架构决策 |
| `planner` | `kimi-coding/k3` | 计划设计：文件结构、任务拆分、接口契约、`plans.md` 落笔 |
| `coder` | `kimi-coding/k3` | 编码执行：按 `plans.md` 步骤 TDD 红-绿-重构 |
| `reviewer` | `qwen-token-plan-cn/qwen3.8-max` | 收口审查：逐项核对验收标准与证据（做没做到） |
| `scout` | `deepseek-official/deepseek-flash` | 探索定位、批量搜索（返回 `文件:行号` 证据） |
| `scribe` | `qwen-token-plan-cn/qwen3.8-flash` | 文档回填、报告、spec 维护 |
| `fallback` | `deepseek-official/deepseek-flash` | 未分类的轻量任务兜底 |

模型搭配是**数据驱动**的（本项目用三轮、58 格评测确定），所以上表是初值而非定论——
**你的实际绑定以 `/rolegroup doctor` 为准**。

**角色怎么实现（v0.6）**：每个角色 = 一个委派工具实例 + 一个**自动生成的 Agent Preset**
（克隆你**默认会话模式**的完整组合 → 替换 persona → 剔除委派组）。所以「设置 → Agent 预设」里会看到
7 个「角色：xxx」：它们自动生成，**不要删除/改名，也不要把主会话选成它们**。

## 4. 配置

### 查找顺序（第一个命中即停）

1. `<启动 cwd>/.dsh/rolegroup.jsonc`（项目级）
2. `$DSH_HOME/rolegroup.jsonc`（用户级，缺省 `~/.dsh`）
3. 都没有 → 内置默认表（§3）

### 格式

```jsonc
// .dsh/rolegroup.jsonc；只写你要改的角色，未列出的沿用内置表
{
  "roles": {
    "analyst": {
      "provider": "qwen-token-plan-cn",          // 可省略 → 继承内置表的 provider
      "model": "qwen3.8-flash",
      "reasoningEffort": "high",                  // 可选；省略则用模型默认档位
      "persona": "file://./personas/analyst.md"   // 可选；file:// 外链（相对本文件）或内联字符串
    }
  }
}
```

角色字段只有 **`toolName` / `provider` / `model` / `reasoningEffort?` / `persona` / `summary`**。

### 与 GUI 面板的优先级（四层，**整层择一**）

**本面板（settings 层）> 项目 `rolegroup.jsonc` > 用户 `rolegroup.jsonc` > 内置表**

⚠️ **这是「取最高存在的那一层」，不是逐角色缝合**：任何一层一旦生效，它下面的层**整层让位**——
jsonc 链自身也是这样（项目文件存在时，用户文件完全不被读取）。最终角色表 = **胜出层 + 内置表补底**
（`mergeRoles` 恒以内置表为底，v0.1 起既有语义）。

**最容易踩的后果**：面板「保存」= 接管生效表 ⇒ **`rolegroup.jsonc` 整层让位**。只写在 jsonc 里、
没搬进面板的角色会**回落内置表**，而**不是**"沿用 jsonc"。所以：

- **要么用 jsonc，要么用面板**；
- 若已有 jsonc 覆盖、又想在面板里改几个角色，**请把想保留的那些 jsonc 行一并加进面板再保存**；
- 退出接管的按钮是面板里的「重置为文件配置」（= 清掉 `enabled` + `roles` 两个字段）。

面板是否生效由一个**显式布尔位**控制（§5）。当前到底在用哪一层，用 `/rolegroup doctor` 的
「配置来源」一行确认。

### 运行时行为

- **启动路由校验**：provider 未注册 → 该角色**不注册** + actionable 错误日志；模型不在广告列表 → 警告但注册（委派时预检最终裁决）；
- **`maxDepth: 1`**：主会话可委派，角色子代理不可再委派（**配 `0` 会把顶层委派也挡掉**）；
- **配置不热生效**：改 jsonc 后需重启/开新会话。
- **角色实现（v0.6）**：persona 住在 Agent Preset 的 `@deepseek-ai/dsh-persona` 行里，委派工具用
  `agentPreset` 选中它（`maxDepth: 1`）；
- **委派语义**：立即返回 subagent id，任务完成时收到完成通知（不要轮询等待）；
- **角色子会话不可再委派**：preset 已剔除 `delegation` 组（比 v0.5 更严格）；
- **基底不跟随会话模式**：角色子会话恒用你的**默认模式**克隆（本机 `standard`）；单会话选 PTC/最小/创造
  等模式不改变角色工具面。权限 preset（read-only 等）仍随委派继承；
- **仅支持 dsh ≥ 0.2.1**：0.2.0 上插件仍加载（面板/doctor 可用），但角色**不注册**并打一条明确警告。

> **ℹ️ `readonly` 字段已于 v0.5 移除**：老配置里若仍写 `"readonly": true/false`，会得到一条**迁移提示**
> （只警告不拒收，角色照常注册），但该字段**不再有任何作用**。
> 原因：**工具面白名单不足以表达权限边界**——在配置面提供一个容易被误读成「安全开关」的字段，
> 比不提供更危险。**只读的正确做法**是用**会话级 permission preset**
> （`read-only` / `workspace-write` / `danger-full-access`，随委派继承），角色的只读倾向用 `persona` 软约束表达。

## 5. GUI 面板

在 **设置 → 角色配置** 里可视化编辑角色 ↔ 模型路由：增删角色行、改 provider/model、
改 persona/summary，底部「保存 / 放弃 / 重置为文件配置」。

> 它注册为设置页的一个 **section**（`settings.section`），与「模型」「Agent 预设」平级——
> 因为角色表是**功能级配置**，不属于插件管理页。相应地，本插件**不再出现在 Plugins 页的「官方」组**
> （那一组的两个来源——"未安装的官方可选包"与"所有 `plugins.item` 卡片"——现在都与我们无关）。

<!-- TODO(screenshot): 面板截图待补 —— 重截后放到 assets/rolegroup-panel.png 并替换本行 -->
> 📷 *面板截图待补*（`assets/rolegroup-panel.png`）。

**两条已知取舍**（都是刻意的，不是缺陷）：

1. **接管是显式的**——Config 里的 volatile 布尔位 `enabled`（缺省 `false`）决定面板是否生效。「保存」写
   `enabled=true` + `roles`；「重置为文件配置」把两者清掉从而**真正退出接管**。由于面板的「组合层」只能来自条目
   `config:`，**无法预填运行时读出的 jsonc 文件表** → **面板初始是空表**（表示「尚未接管」，生效表仍来自 jsonc / 内置表）。
   *空白 ≠ 没有角色*：只为**想改的角色**加行即可；但**保存后是整层接管**（§4）——未列出的角色回落
   **内置表**，jsonc 整层让位。完整生效表看 §6。
2. **「零角色」无法表达**——`mergeRoles` 恒以内置默认表为底（v0.1 起既有语义），所以面板里的空覆盖表
   = 「不做任何覆盖」= 回到内置 7 角色（接管状态下 **jsonc 不参与**）。要停用整个插件请摘掉 home 层的 insert 行。

保存后需**重启 + 开新会话**生效。

## 6. 诊断

`/rolegroup doctor`：读 `$DSH_HOME/plugins/dsh-rolegroup/last-startup.json` 快照 + 与运行时 llm 服务比对，
逐项报告 角色名/绑定模型/provider 与模型可用性，异常附修复建议。

- `/rolegroup doctor` — 诊断；
- 裸 `/rolegroup` 或未知子命令 — 回显用法。

> 注意（实测）：GUI composer 里**粘贴**以 `/` 开头的文本会当普通消息发送，不触发命令解析——请手工输入或从补全列表点选。

输出样例（用新内置表真实渲染的原文）：

> 若某角色 **provider 未注册**，表下会追加一段错误块并把该行 provider 标 `❌`；**该角色不会被注册**——
> **兜底角色尤其要留意这一点——一条被剪枝的兜底路由等于不存在**（这正是把内置 fallback 绑到
> `deepseek-official` 这个「唯一保证注册」的 provider 上的原因）：

```
❌ fallback：provider "example-provider" 当前未注册（在用：deepseek-official, kimi-coding, qwen-token-plan-cn）
   修复：① 检查该适配器的 key/额度；② 或在 rolegroup.jsonc 把 fallback 改用已注册 provider。
```

```
dsh-rolegroup doctor — 7 个在册角色
快照时间 2026-09-22T12:09:27.382Z（0 天前）｜配置来源 (内置默认表)

角色     绑定模型                         provider 模型
analyst  qwen-token-plan-cn/qwen3.8-max   ✅       ✅
planner  kimi-coding/k3                   ✅       ✅
coder    kimi-coding/k3                   ✅       ✅
reviewer qwen-token-plan-cn/qwen3.8-max   ✅       ✅
scout    deepseek-official/deepseek-flash ✅       ✅
scribe   qwen-token-plan-cn/qwen3.8-flash ✅       ✅
fallback deepseek-official/deepseek-flash ✅       ✅

✅ 无异常
```

行为要点：

- 快照超 7 天提示过期、被手工改写（mtime 晚于内容时间）出 ⚠️ —— 但**表格照出，不罢工**；
- **配置年龄提示**：生效配置超 14 天未改动出 ⚠️（含天数与上次改动日期），提醒复核「当初顶上的临时覆盖」是否该回切；
  走提示通道，**不计入异常数**；⚠️ 该提示**只适用于 jsonc 文件来源**——面板接管的 settings 层没有时间戳，
  故接管状态下不产生此提示（也不会拿被让位的 jsonc 文件的年龄冒充）；
- llm 服务不可用时可用性整列标 `➖`（不假报 ✅）；快照只在启动终验时写一次，故配置改动需重启/新会话后才更新；
- **preset 问题也会体现在报告里**：角色对应的 Agent Preset 激活失败或失踪时，该角色进 `invalid[]`（附原因）
  且**不注册**——委派会表现为「工具不存在」。

## 7. 开发

```sh
npm install         # ★ 首次 clone 后必跑：devDependency esbuild（客户端构建需要）
npm test            # 离线 smoke test（108 项纯逻辑，约 0.3s；pretest 会自动跑 link:deps）
npm run link:deps   # ★ 首次 clone 后、以及 dsh 升级/换部署树后必跑：把部署树的 schemastery 软链进本仓库
npm run build:client  # 改了 src/client/** 或 lib/roles.js 后：重建产物 lib/client.js
```

> **首次 clone 的两步是必须的**，否则会分别看到：
> ① 缺 `npm install` → `npm test` 的客户端构建用例报 `ERR_MODULE_NOT_FOUND: esbuild`；
> ② 缺 `link:deps` → dsh 启动时打一条 `[dsh-rolegroup] 无法使用部署树的 @deepseek-ai/schemastery …`，
> **插件仍按 host-only 运行**（角色工具照常可用），只是设置页那一节缺席。

> **`link:deps` 是干什么的**：本插件是 `link:` 形态（真实路径 = 本仓库），按 realpath 规则**无法裸导入 `@deepseek-ai/*`**；
> 而 settings 范式要求条目**静态导出** schemastery `Config`，不能延迟解析——故把部署树的 schemastery 软链进本仓库。
> 软链缺失时插件**仍能加载**（host-only 照常工作），只是面板缺席 + 启动 `console.warn`；软链不入库（`.gitignore`）。

目录：

| 路径 | 内容 |
|---|---|
| `lib/` | 宿主侧：`index.js`（装配/重组装）、`roles.js`（角色表与合并）、`config.js`（settings `Config`）、`doctor.js`、`command.js` |
| `src/client/` | 客户端源码（`controller.js` / `card.jsx` / `locales.js`）；**产物 `lib/client.js` 由 esbuild 生成，改完须重建** |
| `tests/` | 离线 smoke suite（Node 直跑，无浏览器依赖） |
| `scripts/` | `build-client.mjs`（esbuild 打包）、`link-deployment-deps.mjs`（环境软链） |
| `assets/` | README 用的图片资源 |

## 8. 兼容性

实测适配 **dsh 0.2.1-rc.2**；`lib/` 依赖 0.1.7 起的 **Config-schema settings 范式**（条目 `Config` + `.volatile()`
→ 命名空间；客户端 `configForms` + `settings.section`）。

- **v0.6 起仅支持 dsh ≥ 0.2.1**：0.2.1 移除了委派工具的 `persona` 字段，persona 必须由 Agent Preset
  承载（见 §4）。在 0.2.0 及更早版本上，本插件仍能加载、面板/doctor 可用，但**角色不会注册**，启动日志
  会明确要求升级；
- 从 **0.1.7-rc.2 起可用**；0.1.7 之前的 `settings.register` / `SettingsScope` / `settings.plugin.item` / `settings.yaml`
  已被上游移除，v0.3 的旧面板随之作废并由 **v0.4 完成迁移**；
- **0.2.1-rc.2：v0.6 完成角色机制迁移**（角色 = 克隆默认 preset + persona，替代已移除的内联 persona）。

> **关于 Plugins 页**：配置面板在**设置页**（§5），所以本插件**不会**出现在 Plugins 页的「官方」组。
> 那是上游的两条判据决定的：`installed` = 名字在 profile 的 `dependencies` 里、`optional` = 名字在
> dsh 硬编码的官方可选包清单（`OPTIONAL_BUNDLES`）里——**本插件两条都不满足**。
> 而 Plugins 页会把「所有 `plugins.item` 卡片」无条件追加进「官方」组，所以我们曾经被错误地显示在
> 那一组；撤掉卡片即彻底消除（与装法无关）。
> 若希望它在 Plugins 页的「**已安装**」里出现（带启用/停用开关），需要让它成为 profile 依赖，
> 即用官方插件管理器安装（见 §2）。

## 9. 常见问题

**「设置 → Agent 预设」里为什么多出 7 个「角色：xxx」？**
它们是本插件自动生成的（每个角色一个：克隆你的默认模式组合 + 替换 persona + 剔除委派组）。
**不要删除/改名，也不要把主会话选成它们**——删了对应角色会在下次启动/热更新时被审计为不可用；主会话选成
角色 preset 会得到一个「没有标准工具」的会话。改角色配置请用本插件的面板或 `rolegroup.jsonc`。

**我换了会话模式（PTC / 最小 / 创造），角色工具面为什么不变？**
角色子会话的基底是**你的默认模式**（本机 `standard`），不跟随单会话选择的模式；只用标准模式时无差异。

**装完角色工具没出现？**
① 确认 `--dump-config` 里有 `- id: dsh-rolegroup`；② **重启 `dsh web` + 开新会话**（配置与代码都不热生效）；
③ 跑 `/rolegroup doctor` 看是不是某个 provider 未注册导致角色被剪枝。

**面板是空的 / 显示「尚未接管」？**
正常，不是故障——面板编辑的是**覆盖表**，未接管时它本来就是空的，生效表来自 `rolegroup.jsonc` / 内置表。
只为**想改的角色**加行再「保存」即可（见 §5 取舍 ①）。

**改了 `rolegroup.jsonc` 没生效？**
先看是不是**面板已接管**（§4：`enabled=true` 时 jsonc **整层让位**，重载也不会生效）——在面板里点
「重置为文件配置」即可退出接管；否则是配置不热生效，需**重启 + 开新会话**。

**`/rolegroup` 命令没反应？**
GUI 里**粘贴**以 `/` 开头的文本会被当普通消息发送——请手工输入，或从补全列表点选。

**前端面板不见了，但角色工具还在？**
多半是 schemastery 软链缺失，插件按 host-only 降级运行了。跑 `npm run link:deps` 修复（见 §7）。

**怎么彻底停用这个插件？**
摘掉 home 层 `~/.dsh/cordis.patch.yml` 里的 insert 行。
⚠️ 面板里的空覆盖表**不等于**停用——`mergeRoles` 恒以内置表为底（见 §5 取舍 ②）。

## 10. License

MIT
