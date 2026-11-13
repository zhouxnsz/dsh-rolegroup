# dsh-rolegroup

dsh 的角色化委派插件。先定义角色（名字、绑定模型、persona），委派时直接用角色名，不用每次手写
`provider`/`model`。每个角色对应一个宿主 `dsh-tool-subagent` 实例，工具名就是角色名。

角色/类别绑定的思路参考了 [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)（omo），
详见 §9。

> 版本 **0.11.5** ｜ 要求 dsh **≥ 0.2.1-rc.1**（本机实测 0.2.2-rc.3）｜ MIT

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

### 边界：我们明确不做什么

| 不做 | 为什么 |
|---|---|
| **不做编排**（DAG / 多轮协作 / 团队流水线） | 那是官方智能体团队的职责；两套编排会互相踩 |
| **不注册 MCP server** | 几十个工具会把工具列表、权限面、prompt 预算一起撑大 |
| **不写项目级状态目录**（`.rolegroup/`） | 我们做的是「路由」，不是「运行时状态机」；状态属于编排层 |
| **不接管主会话的会话模式（Agent Preset）** | 显式 preset 是**替换**父组合（§4），接管等于替用户做选择 |

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

### 推荐绑定（官方建议）

各角色的官方推荐模型见 **[MODELS.md](./MODELS.md)**。表里「推荐」与「内置默认」可能不同，比如 `reviewer`。

## 4. 配置

配置有两层：内置表（出厂默认）和面板覆盖（可选）。

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

## 5. 设置面板

在「设置 → 角色配置」里编辑角色和模型绑定、增删角色；保存后对新会话生效，进行中的会话不受影响。

## 6. 诊断

`/rolegroup doctor` 会读取 `$DSH_HOME/plugins/dsh-rolegroup/last-startup.json` 快照，再和运行时的 llm
服务比对，逐项列出角色名、绑定模型、provider 和模型是否可用；有异常时附上修复建议。内置备用档生效时，
doctor 会写明「主路由 X 不可用，已用内置备用档 Y」。

- `/rolegroup doctor`：诊断。
- `/rolegroup init`：把**当前生效的角色绑定**导出成 JSONC 文本（只打印，不写文件）。v0.11 起它只是
  留档/比对工具——`rolegroup.jsonc` 不再是配置来源。

> 新机器上第一次用，先跑 `/rolegroup doctor` 看哪些角色的主路由在本机不可用；想换绑就在面板里改。

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
planner  kimi-coding/k3.1-pro             ✅       ✅
coder    kimi-coding/k3.1-pro             ✅       ✅
reviewer qwen-token-plan-cn/qwen3.8-flash ✅       ✅
scout    deepseek-official/deepseek-flash ✅       ✅
scribe   qwen-token-plan-cn/qwen3.8-flash ✅       ✅
vision   qwen-token-plan-cn/qwen3.8-flash ✅       ✅
fallback deepseek-official/deepseek-flash ✅       ✅

✅ 无异常
```

另外：快照超过 7 天或看起来被改过会标 ⚠️，表格照常输出；llm 服务不可用时可用性列标 ➖。

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
| `lib/` | 宿主侧：`index.js`（装配/重组装）、`roles.js`（角色表与合并）、`config.js`（settings `Config`）、`settings-table.js`（覆盖表 ↔ section）、`init.js`（`/rolegroup init` 导出）、`doctor.js`、`command.js` |
| `src/client/` | 客户端源码（`controller.js` / `card.jsx` / `locales.js` / `meta.js`）；`lib/client.js` 是 esbuild 产物，改完要重建 |
| `tests/` | 离线 smoke suite（Node 直跑，不需要浏览器） |
| `scripts/` | `build-client.mjs`（esbuild 打包，注入 `package.json` 的版本号）、`link-deployment-deps.mjs`（环境软链） |
| `locale/` | 插件元数据：`en.json` / `zh.json` 里的 `meta.title` 与 `meta.description`，供插件页与插件市场显示本地化名称和说明 |

## 8. 参考与致谢

角色（类别）到模型的绑定方式、JSONC 配置格式，以及角色子代理不能再委派这条约束，参考了
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)（omo）。模型搭配没有照搬 omo 的
结论；本插件的绑定按自己的配置和评测决定。

## 9. License

MIT
