# dsh-rolegroup

dsh 的角色化委派插件。先定义角色（名字、绑定模型、persona），委派时直接用角色名，不用每次手写
`provider`/`model`。每个角色对应一个宿主 `dsh-tool-subagent` 实例，工具名就是角色名。

角色/类别绑定的思路参考了 [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)（omo），
详见 §10。

> 版本 **0.11.2** ｜ 要求 dsh **≥ 0.2.1-rc.1**（本机实测 0.2.1-rc.3）｜ MIT

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

下面这些是决定不做的，不是还没做。插件生态里上游一断档、两个插件抢同一个扩展点，摊子铺大了一次性
全废，所以宁可窄一点。

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

改代码后需要重启并开新会话。面板保存怎么生效，见 §5。

## 3. 内置角色

没有任何覆盖时，插件会注册这 8 个角色。下表是内置初值，可以在面板里覆盖。

表里只写**模型名称**：同一个模型往往有多条路由（订阅套餐、按量计费、聚合网关），具体 provider 由你的配置
决定。内置默认绑定指向内置表里的 provider（作者的订阅），在你的机器上可用 `/rolegroup init` 生成一套本机
可用的路由，或在面板里直接改。模型 ID 与实际生效路由以 `/rolegroup doctor` 为准。

| 角色 | 内置绑定模型 | 职责 |
|---|---|---|
| `analyst` | Qwen3.8 Max | 需求澄清、路径分类、方案评审（做不做/怎么做）、架构决策 |
| `planner` | Kimi K3.1 Pro | 计划设计：文件结构、任务拆分、接口契约、`plans.md` 落笔 |
| `coder` | Kimi K3.1 Pro | 编码执行：按 `plans.md` 步骤 TDD 红-绿-重构 |
| `reviewer` | Qwen3.8 Flash | 收口审查：逐项核对验收标准与证据（做没做到） |
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

### 推荐绑定（官方建议）

各角色的官方推荐模型见 **[MODELS.md](./MODELS.md)**。表里「推荐」与「内置默认」可能不同，比如 `reviewer`。

provider 需要在你机器上已注册；没有对应订阅时，内置角色会沿备用链降级到 `deepseek-official`。换机器先跑
`/rolegroup init`。

## 4. 配置

只有两层：**内置表**（出厂默认）和**面板覆盖**（可选）。没有配置文件层——`rolegroup.jsonc` 自 v0.11
起不再是配置来源，`/rolegroup init` 只把当前绑定导出成文本供留档。

| 状态 | 生效表 |
|---|---|
| 没有任何覆盖 | 内置表（= [MODELS.md](./MODELS.md) 里的推荐） |
| 面板接管，写了 N 行 | 那 N 行覆盖内置表；没写的角色仍用内置表 |

每行可以写：`provider`、`model`、`reasoningEffort`（可选）、`fallbackModels`（可选）、`persona`
（可选）、`summary`（可选）。`reasoningEffort` 必须是模型支持的档位，留空用模型默认。

### 备用模型链

内置角色都带一条链，只指向 dsh 自带的两个 DeepSeek provider：**账号登录的 `deepseek-account` 优先**
（普通用户更可能只有登录态），其次 API Key 的 `deepseek-official`：

```jsonc
"analyst": {
  "provider": "qwen-token-plan-cn",
  "model": "qwen3.8-max",
  "fallbackModels": ["deepseek-account/deepseek-flash", "deepseek-official/deepseek-flash", "deepseek-official/deepseek-v4-pro"]
}
```

启动时按「主路由 → 备用链」挑第一个 provider 已注册、模型在广告列表的路由；用了备用档会在启动日志和
`/rolegroup doctor` 里标出来。链里指向第三方网关是不允许的：那些 provider 在别人机器上不一定注册。

**显式覆盖的角色不自动降级**：你在面板里写了某个角色又没写 `fallbackModels`，插件就严格按你写的路由
执行，不可用时不注册，doctor 给出提示。想让它有备用档，把那几行写进 `fallbackModels`。

### 运行时

- `maxDepth` 是 1：主会话可以委派，角色子代理不能再委派。配成 0 会把顶层委派也挡掉。
  实现上角色 preset 剔除了委派组，所以子会话看不到 `subagent` / `workflow`；但 8 个角色工具注册在
  host 平面，子会话的工具列表里仍能看到它们，调用会被 `maxDepth` 拒绝。上游 0.2.1 移除了 `toolFilter`，
  插件无法把 host 工具从子会话隐藏——已知噪音，不是逃逸。
- 面板保存对新会话生效；正在进行的会话不受影响。
- 备用链只在**启动期**解析：角色工具注册时就固定了模型，所以链是"启动挑一条"，不是运行期按 429 切换。
  `llm/adapters-updated` 会让插件重组装并重新解析。
- 委派会立即返回 subagent id，任务完成后收到通知，不用轮询。

`readonly` 是废弃字段。老配置里如果还写着，会收到迁移提示但不会生效。只读请用会话级 permission
preset（`read-only` / `workspace-write` / `danger-full-access`，委派会继承）；角色本身的只读倾向用
persona 表达。

## 5. 设置面板

在「设置 → 角色配置」里编辑角色和模型绑定：增删角色、改 provider/model、persona/summary、推理档位。

顶部一行状态只说一件事——现在生效的是谁：

| 状态 | 含义 |
|---|---|
| **官方推荐（内置表）** | 没有任何覆盖 |
| **面板自定义（N 行覆盖）** | 面板接管，写了 N 行 |

三个动作：

- **保存**：把草稿写成面板覆盖（`enabled=true` + 整张表）。
- **放弃**：清掉草稿，不改配置。
- **恢复官方推荐**：零覆盖接管，生效表立刻等于内置表。它**不写任何模型名**，所以以后插件升级改了
  内置默认，这里会自动跟上。

面板显示的是**整张生效表**：内置表里有、你的覆盖里没有的角色会自动补成普通行（带内置路由与备用链），
可以像其它行一样编辑。内置角色的行没有删除按钮（删掉只会回落内置），自定义行可以删除。

某个角色的 provider 在本机未注册时，面板顶部会提示「N 个角色的 provider 在本机未注册」，并提供
「按当前可用模型补齐」——把那几行改成部署默认路由（没有默认路由时取第一个可用模型）。没有缺口时这个
按钮不显示。补齐只改草稿，你仍需点「保存」。

保存时每行都会带上 `fallbackModels`（面板不提供编辑入口，但会原样回传）。面板保存 = 显式配置，而显式
配置不继承内置链——不回传就等于把降级能力弄丢。

面板顶部显示插件名和版本号，右上角有 GitHub 链接。推理档位可以留空，留空就用模型默认（比如 Kimi K3
默认 `high`）；下拉里的选项来自模型目录，填了不支持的值会标红并拦住保存。

> **接口暴露面**：v0.11 起插件**不再注册任何 HTTP 路由**。之前那条只读的
> `/api/dsh-rolegroup/config` 随「配置文件」查看器一起删除，暴露面回到零。

不能靠清空面板来停用插件：`mergeRoles` 永远以内置表打底，空覆盖表等于回到内置的 8 个角色。要停用，
请卸载插件，或者摘掉安装项。

## 6. 诊断

`/rolegroup doctor` 会读取 `$DSH_HOME/plugins/dsh-rolegroup/last-startup.json` 快照，再和运行时的 llm
服务比对，逐项列出角色名、绑定模型、provider 和模型是否可用；有异常时附上修复建议。内置备用档生效时，
doctor 会写明「主路由 X 不可用，已用内置备用档 Y」。

- `/rolegroup doctor`：诊断。
- `/rolegroup init`：把**当前生效的角色绑定**导出成 JSONC 文本（只打印，不写文件）。v0.11 起它只是
  留档/比对工具——`rolegroup.jsonc` 不再是配置来源。
- 裸 `/rolegroup` 或未知子命令：显示用法。

> 新机器上第一次用，先跑 `/rolegroup doctor` 看哪些角色的主路由在本机不可用；想换绑就在面板里改。

注意：在 GUI 输入框里粘贴以 `/` 开头的文本，会当成普通消息发出去，不会触发命令。请手动输入，或者从
补全列表里点。

示例：

> 如果某个角色的 provider 没有注册，表下面会多一段错误，并把这一行的 provider 标成 ❌。这个角色不会被
> 注册。兜底角色尤其要注意：被跳过的兜底路由等于不存在。内置的 `fallback` 绑在 `deepseek-official`
> 上，就是因为这个 provider 一定会注册：

```
❌ fallback：provider "example-provider" 当前未注册（在用：deepseek-official, kimi-coding, qwen-token-plan-cn）
   修复：① 检查该适配器的 key/额度；② 或在面板里把 fallback 改用已注册 provider。
```

```
dsh-rolegroup doctor — 8 个在册角色
快照时间 2026-10-25T12:00:00.000Z（0 天前）｜配置来源 (内置默认表)

角色     绑定模型                         provider 模型
analyst  qwen-token-plan-cn/qwen3.8-max   ✅       ✅
planner  kimi-coding/k3                   ✅       ✅
coder    kimi-coding/k3                   ✅       ✅
reviewer qwen-token-plan-cn/qwen3.8-max   ✅       ✅
scout    deepseek-official/deepseek-flash ✅       ✅
scribe   qwen-token-plan-cn/qwen3.8-flash ✅       ✅
vision   qwen-token-plan-cn/qwen3.8-flash ✅       ✅
fallback deepseek-official/deepseek-flash ✅       ✅

✅ 无异常
```

另外：快照超过 7 天，或者看起来被手动改过，会标 ⚠️，但表格照常输出。
提示复核；面板接管的配置没有时间戳，不会提示。llm 服务不可用时，可用性一列会标 ➖。preset 激活失败
的角色会进 `invalid[]`，也不会注册。

## 7. 开发

```sh
npm run link:deps     # 首次 clone 后先跑：建 schemastery 软链
npm install           # 再装 devDependency esbuild
npm test              # 离线 smoke test，158 项；pretest 会自动跑 link:deps
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

**「设置 → Agent 预设」里为什么多出 8 个「角色：xxx · 模型」？**
它们是本插件自动生成的（每个角色一个：复制默认模式的组合、替换 persona、去掉委派组）。不要删除或改名，
也不要把主会话选成它们。删了对应角色会在下次启动或热更新时被审计为不可用；主会话选成角色 preset，会
得到一个没有标准工具的会话。改角色配置请用面板。

**子任务/子会话页面为什么看不到模型？**
DSH 的子代理页没有独立的模型 chip。本插件把模型写进两个现有字段：Agent Preset 名称（header 的角色标签
会显示 `角色：scout · deepseek-flash`）和委派 `description`（任务标题，如 `登录校验实现 · kimi-coding/k3`）。
要像 Agent Teams 那样单独显示模型 chip，需要上游子代理 UI 支持。

**看图任务怎么用？`vision` 够吗？**
内置的 `vision` 就是干这个的，不用自己加角色。委派时把**图片路径**写进简报，例如
「用 vision 看一下 `/tmp/ui.png`，检查间距和对比度」，它会自己调 `read_image`。

图片必须是磁盘上的文件，委派本身只能传文字。它默认绑 `qwen3.8-flash`，2026-11-13 那轮评测里
OCR 5/5、UI 字段 6/6，同批 `deepseek-flash`、`qwen3.8-max`、`kimi-k3` 也都是满分——所以换模型不会更准，
按成本和可用性选就行。细节见 [MODELS.md](./MODELS.md)。

要换的话，注意两点：别换成纯文本模型；备用链里也别放纯文本模型（例如 `v4-pro`），否则降级之后看不了图。
上游没有「视觉能力位」，插件没法在启动期校验，换完先拿一张含明确文字的图试一下，能读出来就算可用。

**我换了会话模式（PTC / 最小 / 创造），角色工具面为什么不变？**
角色子会话的基底是你的默认模式，不跟随单会话选择的模式。只用标准模式时没有区别。

**装完角色工具没出现？**
① 确认 `--dump-config` 里有 `- id: dsh-rolegroup`；② 重启 `dsh web` 并开新会话（配置和代码都不热
生效）；③ 跑 `/rolegroup doctor`，看是不是某个 provider 没注册导致角色被跳过。

**面板显示「尚未接管」或读取失败？**
未接管时，面板会预填当前生效表；只有读取接口失败时才会变成空表，页内会有错误提示和重试。保存只在
改过之后可用。

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
