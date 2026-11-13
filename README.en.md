# dsh-rolegroup

A role-based delegation plugin for dsh. Define a role once (name, bound model, persona), then delegate by role
name instead of writing `provider`/`model` every time. Each role gets its own host `dsh-tool-subagent`
instance, so the tool name is the role name.

The role/category binding is inspired by
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) ("omo"); see §9.

> Version **0.11.7** ｜ dsh **≥ 0.2.1-rc.1** (verified on 0.2.2-rc.3) ｜ MIT

---

## 1. Why rolegroup

Every delegation asks the same question: is this job worth an expensive model, or is a cheap one enough? If
the answer lives in the call, it is easy to get wrong and hard to reuse.

| | Input | It handles | Limit |
|---|---|---|---|
| Bare `subagent` | provider/model every time | nothing | you have to remember the model |
| **Agent Teams** (official; 智能体团队) | task DAG / roster | who does what, dependencies, multi-round work | teammates inherit the root model; no per-member model binding |
| **dsh-rolegroup** | roles, defined once | which model this kind of work uses | one-off specialist delegation; no orchestration |

They solve different problems. Agent Teams coordinates the work; rolegroup picks the model for a single
delegation. The two can coexist in one deployment. A common pattern is to split expensive and cheap work:
`reviewer` on a cheap model, `coder` on a strong one, with Agent Teams still doing the coordination.

### Scope: what we deliberately do not do

| We do not | Why |
|---|---|
| **Orchestrate** (DAGs, multi-round collaboration, team pipelines) | That is the official Agent Teams' job; two orchestrators fight each other |
| **Register an MCP server** | Dozens of tools inflate the tool list, the permission surface, and the prompt budget |
| **Write a project-level state directory** (`.rolegroup/`) | We route work; we are not a runtime state machine — state belongs to the orchestration layer |
| **Take over the main session's Agent Preset** | An explicit preset **replaces** the parent composition (§4); taking over means choosing for the user |
| **Keep dual-shape branches for old dsh lines** | Since v0.6 we support ≥0.2.1 only; older lines get a clear error instead of half-working |

When you need orchestration, state, or an MCP tool chain, compose other plugins — they do not replace this one.

## 2. Quick start

### Official plugin manager

```sh
dsh plugin --profile web add dsh-rolegroup
```

You can also open the Plugins page, click "Add plugin", choose "Install a third-party plugin", enter
`dsh-rolegroup`, and click "Install". Restart `dsh web` after installing.

If a third-party market rewrite drops the plugin, add it again.

### Plugin market

Open the Plugin Market, search for `dsh-rolegroup`, and install it. The market uses the same plugin manager
underneath.

### From source

For development or local changes:

```sh
git clone https://github.com/zhouxnsz/dsh-rolegroup.git
cd dsh-rolegroup
npm run link:deps
npm install
dsh plugin --profile web add "link:$PWD"
```

`link:deps` symlinks the deployment's schemastery into this repo; the Settings panel needs it for source
installs. Run `link:deps` before `npm install`: npm installs the `@deepseek-ai/schemastery` peer as a real
copy, which blocks the symlink.

You can also mount it on the home layer:

```sh
ln -sfn "$PWD" ~/.dsh/profiles/web/node_modules/dsh-rolegroup
cat >> ~/.dsh/cordis.patch.yml <<'YAML'
- insert:
    - id: dsh-rolegroup
      name: 'dsh-rolegroup'
YAML
```

The home layer survives profile rewrites, but it does not show up under "Installed" and has no toggle. Pick
one; do not use both.

### Verify

```sh
dsh --profile web --dump-config | grep -A1 dsh-rolegroup   # should show - id: dsh-rolegroup
```

Restart `dsh web` and open a new session. The eight role tools should be in the tool list; you can also run
`/rolegroup doctor` from the new session.

After changing code, restart and open a new session. For panel saves, see §5.

## 3. Built-in roles

With no configuration, the plugin registers eight roles. The models below are initial values;
the panel can override them.

The table names models only: one model usually has several routes (subscription plan, pay-as-you-go, gateway),
and the provider is up to your configuration. The built-in default points at the built-in table's providers (the
author's subscriptions) — on your machine run `/rolegroup init` to generate routes that actually work, or edit
them in the panel. Model ids and the effective routes are whatever `/rolegroup doctor` prints.

| Role | Built-in model | Responsibility |
|---|---|---|
| `analyst` | Qwen3.8 Max | Requirement clarification, path classification, plan review (do it / how), architecture decisions |
| `planner` | Kimi K3.1 Pro | Plan design: file layout, task breakdown, interface contracts, writing `plans.md` |
| `coder` | Kimi K3.1 Pro | Implementation: TDD red-green-refactor following `plans.md` steps |
| `reviewer` | Qwen3.8 Flash | Closing review: check acceptance criteria against evidence (was it actually done) |
| `scout` | DeepSeek V4.1 Flash | Exploration and bulk search (returns `file:line` evidence) |
| `scribe` | Qwen3.8 Flash | Documentation backfill, reports, spec maintenance |
| `vision` | Qwen3.8 Flash | Vision: image analysis, UI review, prototype reading, OCR (**the bound model must accept images**) |
| `fallback` | DeepSeek V4.1 Flash | Catch-all for unclassified lightweight tasks |

### Recommended bindings (official suggestion)

See **[MODELS.en.md](./MODELS.en.md)** for the recommended model per role. "Recommended" and "built-in default"
can differ — `reviewer` is one.

## 4. Configuration

Two layers: the built-in table (factory defaults) and panel overrides (optional).

### Fallback chains

Built-in roles ship a chain that only targets the two DeepSeek providers dsh bundles: **`deepseek-account`
(account login) first**, since that is what most users have, then `deepseek-official` (API key):

```jsonc
"analyst": {
  "provider": "qwen-token-plan-cn",
  "model": "qwen3.8-max",
  "fallbackModels": ["deepseek-account/deepseek-flash", "deepseek-official/deepseek-flash", "deepseek-official/deepseek-v4-pro"]
}
```

## 5. Settings panel

Edit roles and model bindings (add or remove roles) under Settings → 角色配置; a save applies to new
sessions, and in-flight sessions are unaffected.

## 6. Diagnostics

`/rolegroup doctor` reads the `$DSH_HOME/plugins/dsh-rolegroup/last-startup.json` snapshot and compares it
with the live llm service. It lists each role's name, bound model, provider, and whether the model is
available, with repair hints when something is wrong. When a built-in fallback is in effect it says so
("primary X unavailable, using built-in fallback Y").

- `/rolegroup doctor`: diagnose.
- `/rolegroup init`: export the **current effective bindings** as JSONC text (printed, nothing written). As of
  v0.11 it is a record/comparison tool only — `rolegroup.jsonc` is no longer a configuration source.

> On a fresh machine, run `/rolegroup doctor` first to see which roles' primary routes are unavailable; change
> bindings in the panel.

Note: pasting text starting with `/` into the GUI composer sends it as a normal message, not a command. Type
it by hand or pick it from the completion list.

Example:

> If a role's provider is not registered, an error block is appended below the table and the provider is
> marked ❌. The role is not registered. This matters most for a fallback role: a skipped fallback route does
> not exist. Built-in fallbacks point at dsh's own DeepSeek providers, which ship with every install:

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

Also: a snapshot older than 7 days, or one that looks hand-edited, gets a ⚠️ but the table is still printed;
when the llm service is down the availability column shows ➖.

## 7. Development

```sh
npm run link:deps     # first after cloning: create the schemastery symlink
npm install           # then install the esbuild devDependency
npm test              # offline smoke suite, 158 cases; pretest runs link:deps
npm run build:client  # after editing src/client/** or lib/roles.js
```

Run `link:deps` before `npm install`: npm installs the `@deepseek-ai/schemastery` peer as a real copy, which
blocks the symlink. If you already ran `npm install`, delete `node_modules/@deepseek-ai/schemastery` and rerun
`link:deps`. Without `npm install`, `npm test` fails with `ERR_MODULE_NOT_FOUND: esbuild`. Without
`link:deps`, dsh prints
`无法使用部署树的 @deepseek-ai/schemastery …` at startup and the plugin runs host-only: role tools still
work, but the Settings section is missing.

What `link:deps` does: the plugin is installed as a `link:`, so by Node's realpath rule it cannot import
`@deepseek-ai/*` directly. Settings also requires the entry to export a schemastery `Config` statically,
which cannot be resolved lazily. The script symlinks the deployment's schemastery into this repo; the symlink
is not committed.

Layout:

| Path | Contents |
|---|---|
| `lib/` | Host side: `index.js` (composition/recomposition), `roles.js` (role table and merge), `config.js` (settings `Config`), `settings-table.js` (override table ↔ section), `init.js` (`/rolegroup init` export), `doctor.js`, `command.js` |
| `src/client/` | Client sources (`controller.js` / `card.jsx` / `locales.js` / `meta.js`); `lib/client.js` is the esbuild artifact and must be rebuilt after edits |
| `tests/` | Offline smoke suite (plain Node, no browser) |
| `scripts/` | `build-client.mjs` (esbuild bundle; injects the `package.json` version) and `link-deployment-deps.mjs` (environment symlink) |
| `locale/` | Plugin metadata: `meta.title` and `meta.description` in `en.json` / `zh.json`, shown by the Plugins page and the Plugin Market |

## 8. Credits

The role (category) to model binding, the persona convention, and the rule that role subagents cannot
delegate again are inspired by [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) ("omo"). The
model pairings are not copied from omo; this plugin's bindings are decided by its own configuration and
evaluation.

## 9. License

MIT
