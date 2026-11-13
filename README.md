# dsh-rolegroup

dsh 的角色化委派插件。先定义角色（名字、绑定模型、persona），委派时直接用角色名，不用每次手写
`provider`/`model`。每个角色对应一个宿主 `dsh-tool-subagent` 实例，工具名就是角色名。

角色/类别绑定的思路参考了 [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)（omo），
详见 §10。

> 版本 **0.8.0** ｜ 要求 dsh **≥ 0.2.1-rc.1**（本机实测 0.2.1-rc.3）｜ MIT

---

## 1. 为什么用它

什么活用贵模型、什么活用便宜模型，每次委派都要重新想一遍。写在调用里容易记错，也留不下来。

| | 输入 | 它负责 | 限制 |
|---|---|---|---|
| 裸 `subagent` | 每次手写 provider/model | 无 | 每次都要记模型名 |
| **智能体团队**（Agent Teams，官方） | 任务 DAG / 名单 | 分工、依赖、多轮协作 | teammate 继承 root 模型，不能逐成员绑模型 |
| **dsh-rolegroup** | 一次定义角色 | 这类活交给哪个模型 | 只做单次专家委派，不负责编排 |

三者不冲突。智能体团队负责编排，rolegroup 负责单次委派的模型选择，两者可以在同一部署里同时使用。
常见做法是把贵活和便宜活分开：`reviewer` 用便宜模型，`coder` 用强模型，编排还是交给智能体团队。

另外两点：

- 角色就是工具名。`analyst`、`coder`、`scout` 直接出现在工具列表里，委派时不用想模型。
- 能查。`/rolegroup doctor` 会列出当前每个角色实际用的模型和可用性（见 §6）。

### 边界：我们明确不做什么

在 dsh 这种「一切插件化」的生态里，专注是一种选择，也是一条红线。以下是**刻意不做**的（每条都是
设计决策，不是尚未实现）：

| 不做 | 为什么 |
|---|---|
| **不做编排**（DAG / 多轮协作 / 团队流水线） | 那是官方智能体团队的职责；两套编排会互相踩 |
| **不注册 MCP server** | 几十个工具会把工具列表、权限面、prompt 预算一起撑大 |
| **不写项目级状态目录**（`.rolegroup/`） | 我们做的是「路由」，不是「运行时状态机」；状态属于编排层 |
| **不接管主会话的会话模式（Agent Preset）** | 显式 preset 是**替换**父组合（§4），接管等于替用户做选择 |
| **不为旧 dsh 线保留双形态分支** | v0.6 起只支持 ≥0.2.1；旧线明确报错而不是半残运行 |

需要编排、状态、MCP 工具链时，请组合其它插件——它们与本插件互不替代。

## 2. 快速开始

### 官方插件管理器

```sh
dsh plugin --profile web add dsh-rolegroup
```

也可以在「插件」页 →「添加插件」→「安装第三方插件」，填 `dsh-rolegroup`，点「安装」。装好后重启
`dsh web`。

如果第三方市场重写 profile 把插件清掉，重新 `add` 一次即可。

### 插件市场

打开「插件市场」，搜索 `dsh-rolegroup`，点安装。市场和上面的插件管理器走同一套安装流程。

### 从源码安装

开发或需要改代码时：

```sh
git clone https://github.com/zhouxnsz/dsh-rolegroup.git
cd dsh-rolegroup
npm run link:deps
npm install
dsh plugin --profile web add "link:$PWD"
```

`link:deps` 会把部署树的 schemastery 软链进来；源码安装时设置面板需要它。先跑 `link:deps` 再跑
`npm install`：npm 会把 peer dependency `@deepseek-ai/schemastery` 装成真实副本，顺序反了会挡住软链。

也可以挂到 home 层：

```sh
ln -sfn "$PWD" ~/.dsh/profiles/web/node_modules/dsh-rolegroup
cat >> ~/.dsh/cordis.patch.yml <<'YAML'
- insert:
    - id: dsh-rolegroup
      name: 'dsh-rolegroup'
YAML
```

home 层不会被 profile 重写覆盖，但不会出现在「已安装」组，也没有启停开关。两种源码安装方式选一个，
不要同时用。

### 验证

```sh
dsh --profile web --dump-config | grep -A1 dsh-rolegroup   # 应出现 - id: dsh-rolegroup
```

重启 `dsh web`，开一个新会话。工具列表里应该出现 8 个角色工具；也可以在新会话里跑
`/rolegroup doctor`。

改代码或 `rolegroup.jsonc` 后需要重启并开新会话。面板保存怎么生效，见 §5。

## 3. 内置角色

没有任何配置时，插件会注册这 8 个角色。下表是内置初值，可以被 `rolegroup.jsonc` 或面板覆盖。

表里只写**模型名称**：同一个模型往往有多条路由（订阅套餐、按量计费、聚合网关），具体 provider 由你的配置
决定。内置默认绑定指向内置表里的 provider（作者的订阅），在你的机器上可用 `/rolegroup init` 生成一套本机
可用的路由，或在面板里直接改。模型 ID 与实际生效路由以 `/rolegroup doctor` 为准。

| 角色 | 内置绑定模型 | 职责 |
|---|---|---|
| `analyst` | Qwen3.8 Max | 需求澄清、路径分类、方案评审（做不做/怎么做）、架构决策 |
| `planner` | Kimi K3 | 计划设计：文件结构、任务拆分、接口契约、`plans.md` 落笔 |
| `coder` | Kimi K3 | 编码执行：按 `plans.md` 步骤 TDD 红-绿-重构 |
| `reviewer` | Qwen3.8 Max | 收口审查：逐项核对验收标准与证据（做没做到） |
| `scout` | DeepSeek V4.1 Flash | 探索定位、批量搜索（返回 `文件:行号` 证据） |
| `scribe` | Qwen3.8 Flash | 文档回填、报告、spec 维护 |
| `vision` | Qwen3.8 Flash | 看图：图片分析、UI 评审、原型识别、OCR（**要求绑定模型支持图片输入**） |
| `fallback` | DeepSeek V4.1 Flash | 未分类的轻量任务兜底 |

> **`vision` 的选型依据**（不是推断）：① 作者在 omo 里长期用 `qwen3.8-flash` 做图片分析/UI 评审；
> ② 本项目委托链路探针（`evals` 的 `scout-02`，子会话跑像素字体 OCR）中 `qwen3.8-flash` 得 10/10，
> 而同批 `MiniMax-M3` 只有 4/10 且**编造**了候选字符串——所以它的备用链只放 `deepseek-flash`（同样 10/10
> 且是唯一保证注册的 provider），`M3` 明确排除、`v4-pro` 因视觉未测也不放。
>
> **怎么用**：委派只能传文字，所以把**图片路径**写进简报，例如
> 「用 vision 分析 `/tmp/ui.png`，检查间距与对比度」。角色会自己调 `read_image`。
> 上游没有「视觉能力位」，插件**无法在启动期校验**模型是否支持图片——换成自己的模型后，
> 先用一张含明确文字的图跑一次，能正确读出文字即视为可用。

每个角色由一个委派工具实例和一个自动生成的 Agent Preset 组成。Preset 复制你默认会话模式的组合，
换掉 persona，再去掉委派组。所以「设置 → Agent 预设」里会看到 8 个「角色：xxx · 模型」。这些 preset 是自动
生成的，不要删除或改名，也不要把主会话选成它们。

## 4. 配置

### 查找顺序

插件按下面的顺序找配置，找到第一个就停：

1. `<启动 cwd>/.dsh/rolegroup.jsonc`（项目级）
2. `$DSH_HOME/rolegroup.jsonc`（用户级，缺省 `~/.dsh`）
3. 都没有，用内置表（§3）

### 格式

```jsonc
// .dsh/rolegroup.jsonc；只写你要改的角色
{
  "roles": {
    "analyst": {
      "provider": "qwen-token-plan-cn",          // 可省略，继承内置表的 provider
      "model": "qwen3.8-flash",
      "reasoningEffort": "medium",                // 可选，留空用模型默认档位
      "fallbackModels": ["deepseek-official/deepseek-flash"], // 可选，主路由不可用时按顺序试
      "persona": "file://./personas/analyst.md",  // 可选，file:// 外链（相对本文件）或内联字符串
      "summary": "需求澄清与方案评审"             // 可选，一句话职责
    }
  }
}
```

角色名就是 JSON 的 key。每个角色可以写 `provider`、`model`、`reasoningEffort`（可选）、
`fallbackModels`（可选）、`persona`（可选）、`summary`（可选）。`reasoningEffort` 必须是模型支持的档位；
留空就用模型默认（见 §5）。

### 备用模型链

内置表里，绑定了非 `deepseek-official` 的角色都带一条备用链，所以新机器上没有 qwen / Kimi 订阅时也不会
整片失效：

```jsonc
"analyst": {
  "provider": "qwen-token-plan-cn",
  "model": "qwen3.8-max",
  "fallbackModels": ["deepseek-official/deepseek-flash", "deepseek-official/deepseek-v4-pro"]
}
```

内置链一律**便宜档优先**（`deepseek-flash` → `deepseek-v4-pro`），v4-pro 只作为 flash 也不可用时的最后兜底。
启动时按「主路由 → 备用链」的顺序挑第一个 provider 已注册、模型在广告列表的路由；用了备用档会在启动
日志和 `/rolegroup doctor` 里明确写出来（`⚠️ analyst：主路由 … 不可用，已用内置备用档 …`）。

**显式配置不自动降级**：只要某个角色出现在你的 `rolegroup.jsonc`（或面板保存过），插件就严格按你写的
路由执行，不会偷偷换成备用档——真不可用时该角色不注册，doctor 给出可执行提示。想让它有备用档，就把
`fallbackModels` 一并写进那条角色配置。

目前备用链只从配置文件读；设置面板不编辑它（面板保存还会接管整层，链不会跟着搬过去）。

### 和面板的优先级

**本面板（settings 层）> 项目 `rolegroup.jsonc` > 用户 `rolegroup.jsonc` > 内置表。**

这里只选一层，不按角色逐个合并。某一层存在时，下面几层完全不参与；项目文件存在时，用户文件也不会被
读取。最终表以选中的那层为准，缺的角色由内置表补齐。

要注意的是，在面板里保存会接管整张表，之后 `rolegroup.jsonc` 就完全不参与。只写在 jsonc 里、没有进
面板的角色会回落到内置表，而不是继续用 jsonc。所以：

- 要么用 jsonc，要么用面板。
- 未接管时，面板会预填当前生效表；保存就是整层接管，不需要手动把 jsonc 行搬进面板。
- 想回到 jsonc，点面板里的「重置为文件配置」（会清掉 `enabled` 和 `roles`）。

当前用的是哪一层，可以看 `/rolegroup doctor` 的「配置来源」。

### 运行时

- 启动时检查路由：按「主路由 → 备用链」挑第一个 provider 已注册、模型在广告列表的路由。内置角色都带链，
  所以没有 qwen / Kimi 订阅时也能跑；**显式配置的角色不自动降级**，provider 不在册就不注册，日志和
  doctor 给出修复提示。模型不在可用列表里只警告，委派时再校验。
- `maxDepth` 是 1：主会话可以委派，角色子代理不能再委派。配成 0 会把顶层委派也挡掉。
  实现细节（实测，别误解）：角色 preset 剔除了**委派组**，所以子会话里看不到 `subagent` /
  `subagent_fork` / `workflow`；但 8 个**角色工具是 host 平面**注册的，子会话的工具列表里仍能看到它们，
  调用会在运行期被 `maxDepth` 拒绝。上游 0.2.1 移除了 `toolFilter`，插件无法把 host 工具从子会话隐藏——
  这是已知限制（噪音，不是逃逸）。
- 改 `rolegroup.jsonc` 不会热生效，需要重启并开新会话。面板保存对新会话生效（见 §5）。
- 备用链只在**启动期**解析：dsh 的角色工具在注册时就固定了模型，所以链是「启动挑一条」，不是 omo 那种
  运行时按 429 切换；`llm/adapters-updated` 会让插件重组装并重新解析。
- 委派会立即返回 subagent id，任务完成后收到通知，不用轮询。

`readonly` 是废弃字段。老配置里如果还写着，会收到迁移提示，但不会生效。只读请用会话级 permission
preset（`read-only` / `workspace-write` / `danger-full-access`，委派会继承）；角色本身的只读倾向用
persona 表达。

## 5. 设置面板

在「设置 → 角色配置」里编辑角色和模型绑定：增删角色、改 provider/model、persona/summary、推理档位，
底部有保存、放弃、重置为文件配置。

如果某些角色的 provider 在本机未注册，面板顶部会提示「N 个角色的 provider 在本机未注册」，并提供
「按当前可用模型补齐」：把这几行改成部署默认路由（没有默认路由时取第一个可用模型），只改草稿，
你仍需点「保存」才生效。

面板不会自动接管。未接管时，它先读取当前生效表（jsonc 或内置表）并预填；你改过之后保存按钮才可用。
保存会写入 `enabled=true` 和整张表，从此由面板接管。读取失败时，面板降级为空表，可以手动新增，页内
会给出错误和重试。想退出接管，点「重置为文件配置」，它会清掉这两个字段。

**接管后，面板显示的是整张生效表**：内置表里有、但你的覆盖表里没有的角色（例如后来版本新增的内置
角色），会自动补成普通行（带内置路由与备用链），可以像其它行一样编辑。内置角色的行**没有删除按钮**
（因为 `mergeRoles` 恒以内置表为底，删掉只会回落内置），自定义行可以删除。

保存时**每行都会带上 `fallbackModels`**（面板不提供编辑入口，但会原样回传）。这一点很关键：面板保存 =
显式配置，而显式配置**不继承**内置链——不回传就等于把降级能力弄丢（主路由不可用时会被直接剪枝）。

面板顶部显示插件名和版本号，右上角有 GitHub 链接。「配置文件」按钮会在右侧栏的文档预览里打开当前
生效的 `rolegroup.jsonc`，打开前会先关掉设置面板，好让右侧栏露出来。没有配置文件时，页内给一行提示，
不弹窗。改了 host 侧代码，要重启 `dsh web` 才会生效。

> **接口暴露面（明示）**：`GET|HEAD /api/dsh-rolegroup/config`——**仅回环可访问、无认证、只读**，
> 返回的是启动时读入的**内存快照**（项目/用户 `rolegroup.jsonc` 二者之一），**不按请求参数读盘**，
> 因此没有任意文件读取/路径穿越面。能连到本机回环的进程本来就能读 `~/.dsh`，此接口不额外扩大信任面；
> 多用户或不可信本机环境请确保 dsh web 只监听回环（默认如此）。响应带 `nosniff`，不可被 `<script>` 引用执行。

推理档位可以留空，留空就用模型默认档位（比如 Kimi K3 默认 `high`）。档位越高，通常越慢、越贵，但推理
更充分。下拉里的选项来自模型目录，只列这个模型支持的档位。填了不支持的值会标红，保存也会被拦住；
切换模型时，新模型不支持的旧档位会自动清掉。

面板保存后，新会话会用到新配置，正在进行的会话不受影响。改 `rolegroup.jsonc` 仍然需要重启并开新会话。

不能靠清空面板来停用插件。`mergeRoles` 永远以内置表打底，空覆盖表等于回到内置的 7 个角色。要停用，
请卸载插件，或者摘掉安装项。

## 6. 诊断

`/rolegroup doctor` 会读取 `$DSH_HOME/plugins/dsh-rolegroup/last-startup.json` 快照，再和运行时的 llm
服务比对，逐项列出角色名、绑定模型、provider 和模型是否可用；有异常时附上修复建议。内置备用档生效时，
doctor 会写明「主路由 X 不可用，已用内置备用档 Y」。

- `/rolegroup doctor`：诊断。
- `/rolegroup init`：按本机**实际可用**的路由，打印一份只覆盖「主路由不可用」角色的起始配置（不落盘），
  并显示当前生效层（面板 / 项目 jsonc / 用户 jsonc / 内置表）。
- `/rolegroup init --write`：写入用户级 `$DSH_HOME/rolegroup.jsonc`；已存在则拒绝。
  **面板已接管或项目级配置存在时会拒绝**——这两种情况下写文件不会生效。
- `/rolegroup init --write --project`：写入项目级 `<cwd>/.dsh/rolegroup.jsonc`；若当前生效的是用户级配置，
  会提示新文件将遮蔽它。
- `/rolegroup init --diff`：显示已有文件里哪些角色会被覆盖、哪些会被丢弃（生成的是整份文件）。
- `/rolegroup init --write --force`：确认覆盖；覆盖前自动备份为 `<路径>.bak-<时间戳>`。
- 裸 `/rolegroup` 或未知子命令：显示用法。

> 新机器上第一次用，建议先跑 `/rolegroup init` 看看本机能跑哪些模型组合，再决定是否 `--write`。
> 生成的配置只覆盖不可用的角色，其余继续走内置表；每条都保留了备用链。

注意：在 GUI 输入框里粘贴以 `/` 开头的文本，会当成普通消息发出去，不会触发命令。请手动输入，或者从
补全列表里点。

示例：

> 如果某个角色的 provider 没有注册，表下面会多一段错误，并把这一行的 provider 标成 ❌。这个角色不会被
> 注册。兜底角色尤其要注意：被跳过的兜底路由等于不存在。内置的 `fallback` 绑在 `deepseek-official`
> 上，就是因为这个 provider 一定会注册：

```
❌ fallback：provider "example-provider" 当前未注册（在用：deepseek-official, kimi-coding, qwen-token-plan-cn）
   修复：① 检查该适配器的 key/额度；② 或在 rolegroup.jsonc 把 fallback 改用已注册 provider。
```

```
dsh-rolegroup doctor — 7 个在册角色
快照时间 2026-10-25T12:00:00.000Z（0 天前）｜配置来源 (内置默认表)

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

另外：快照超过 7 天，或者看起来被手动改过，会标 ⚠️，但表格照常输出。jsonc 配置超过 14 天没改，会
提示复核；面板接管的配置没有时间戳，不会提示。llm 服务不可用时，可用性一列会标 ➖。preset 激活失败
的角色会进 `invalid[]`，也不会注册。

## 7. 开发

```sh
npm run link:deps     # 首次 clone 后先跑：建 schemastery 软链
npm install           # 再装 devDependency esbuild
npm test              # 离线 smoke test，156 项；pretest 会自动跑 link:deps
npm run build:client  # 改了 src/client/** 或 lib/roles.js 后重建 lib/client.js
```

先跑 `link:deps` 再跑 `npm install`：npm 会把 `@deepseek-ai/schemastery` 这个 peer 装成真实副本，
顺序反了会挡住软链。如果已经装过，删掉 `node_modules/@deepseek-ai/schemastery` 再跑一次 `link:deps`。
不跑 `npm install`，`npm test` 会报 `ERR_MODULE_NOT_FOUND: esbuild`。不跑 `link:deps`，dsh 启动时会
打印 `无法使用部署树的 @deepseek-ai/schemastery …`，插件降级成 host-only：角色工具还能用，设置页
那一节会缺席。

`link:deps` 是做什么的：插件以 `link:` 形式安装，按 Node 的 realpath 规则，没法直接 import
`@deepseek-ai/*`；而 settings 要求条目静态导出 schemastery 的 `Config`，不能延迟解析。所以脚本把部署
树里的 schemastery 软链到本仓库，软链不会提交。

目录：

| 路径 | 内容 |
|---|---|
| `lib/` | 宿主侧：`index.js`（装配/重组装）、`roles.js`（角色表与合并）、`config.js`（settings `Config`）、`config-info.js`（「配置文件」快照 + 只读路由）、`doctor.js`、`command.js` |
| `src/client/` | 客户端源码（`controller.js` / `card.jsx` / `locales.js` / `meta.js` / `config-file.js`）；`lib/client.js` 是 esbuild 产物，改完要重建 |
| `tests/` | 离线 smoke suite（Node 直跑，不需要浏览器） |
| `scripts/` | `build-client.mjs`（esbuild 打包，注入 `package.json` 的版本号）、`link-deployment-deps.mjs`（环境软链） |
| `locale/` | 插件元数据：`en.json` / `zh.json` 里的 `meta.title` 与 `meta.description`，供插件页与插件市场显示本地化名称和说明 |

## 8. 兼容性

在 dsh 0.2.1-rc.3 上验证过，要求 dsh ≥ 0.2.1-rc.1。0.2.0 上插件还能加载，面板和 doctor 也能用，但角色不会
注册，启动日志会要求升级。面板依赖 dsh 0.1.7 起的 Config-schema settings 接口：条目静态导出 `Config`
和 `.volatile()`，客户端用 `configForms` 和 `settings.section`。

面板在设置页，所以本插件不会出现在 Plugins 页的「官方」组。用官方插件管理器或插件市场安装时，它会
在「已安装」组里，带启用/停用开关。

## 9. 常见问题

**「设置 → Agent 预设」里为什么多出 7 个「角色：xxx · 模型」？**
它们是本插件自动生成的（每个角色一个：复制默认模式的组合、替换 persona、去掉委派组）。不要删除或改名，
也不要把主会话选成它们。删了对应角色会在下次启动或热更新时被审计为不可用；主会话选成角色 preset，会
得到一个没有标准工具的会话。改角色配置请用面板或 `rolegroup.jsonc`。

**子任务/子会话页面为什么看不到模型？**
DSH 的子代理页没有独立的模型 chip。本插件把模型写进两个现有字段：Agent Preset 名称（header 的角色标签
会显示 `角色：scout · deepseek-flash`）和委派 `description`（任务标题，如 `登录校验实现 · kimi-coding/k3`）。
要像 Agent Teams 那样单独显示模型 chip，需要上游子代理 UI 支持。

**想加一个「看图」角色？**
插件支持自定义角色，加到 `rolegroup.jsonc`（或面板）即可：

```jsonc
{
  "roles": {
    "looker": {
      "provider": "opencode-go",
      "model": "qwen3.7-plus",
      "summary": "看图：截图、UI、图表、报错画面",
      "persona": "你是 looker——视觉理解角色。用 read_image 打开给定路径的图片，返回结构化描述（布局、文字、颜色、异常）。只读；看不清就说看不清，不猜。",
      "fallbackModels": ["deepseek-official/deepseek-flash"]
    }
  }
}
```

注意三点：图片必须是**磁盘上的文件**（父模型把路径写进任务简报，子会话用 `read_image` 打开）；
备用链里不要放纯文本模型（例如 `deepseek-v4-pro`），否则降级后看不了图；模型本身要支持图片输入
（Qwen3.7 Plus / Qwen3.8 Flash / Kimi K3.1 Pro / DeepSeek V4.1 Flash 都可以）。

**我换了会话模式（PTC / 最小 / 创造），角色工具面为什么不变？**
角色子会话的基底是你的默认模式，不跟随单会话选择的模式。只用标准模式时没有区别。

**装完角色工具没出现？**
① 确认 `--dump-config` 里有 `- id: dsh-rolegroup`；② 重启 `dsh web` 并开新会话（配置和代码都不热
生效）；③ 跑 `/rolegroup doctor`，看是不是某个 provider 没注册导致角色被跳过。

**面板显示「尚未接管」或读取失败？**
未接管时，面板会预填当前生效表；只有读取接口失败时才会变成空表，页内会有错误提示和重试。保存只在
改过之后可用。

**改了 `rolegroup.jsonc` 没生效？**
先看是不是面板已经接管（§4：`enabled=true` 时 jsonc 整层让位，重载也不会生效）。如果是，在面板里点
「重置为文件配置」。如果不是，就是配置不热生效，需要重启并开新会话。

**`/rolegroup` 命令没反应？**
在 GUI 里粘贴以 `/` 开头的文本，会当成普通消息发出去。请手动输入，或者从补全列表里点。

**前端面板不见了，但角色工具还在？**
从源码安装的，多半是 schemastery 软链缺失，跑 `npm run link:deps`（见 §7）。从插件管理器或市场安装的，
多半是 `@deepseek-ai/schemastery` 这个 peer 依赖没装上；重装插件，或检查 profile 的依赖。

**怎么彻底停用这个插件？**
在 Plugins 页或插件市场里停用/卸载，或者从 profile 依赖里移除。源码挂 home 层的，删掉
`~/.dsh/cordis.patch.yml` 里的 insert 行。⚠️ 清空面板里的覆盖表不等于停用，`mergeRoles` 永远以内置表
打底。

## 10. 参考与致谢

角色（类别）到模型的绑定方式、JSONC 配置格式，以及角色子代理不能再委派这条约束，参考了
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)（omo）。模型搭配没有照搬 omo 的
结论；本插件的绑定按自己的配置和评测决定。

## 11. License

MIT
