# dsh-rolegroup

A role-based delegation plugin for dsh. Define a role once (name, bound model, persona), then delegate by role
name instead of writing `provider`/`model` every time. Each role gets its own host `dsh-tool-subagent`
instance, so the tool name is the role name.

The role/category binding is inspired by
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) ("omo"); see §10.

> Version **0.11.1** ｜ dsh **≥ 0.2.1-rc.1** (verified on 0.2.1-rc.3) ｜ MIT

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

Two other things:

- The role is the tool. `analyst`, `coder`, and `scout` show up in the tool list, so you do not have to think
  about the model when delegating.
- You can check the result. `/rolegroup doctor` lists the model each role is actually using, and whether it
  is available (see §6).

### Scope: what we deliberately do not do

These are things we decided not to do, not things we have not got to yet. One upstream break, or two plugins
claiming the same extension point, can take out a lot at once — so we keep the surface small:

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

> **Why `vision` is bound to `qwen3.8-flash`** (evidence, not guesswork): ① the author used it for image
> analysis / UI review in omo for a long time; ② this project's delegation-path probe (`scout-02` in `evals`,
> a pixel-font OCR run **inside a child session**) scored it 10/10, while `MiniMax-M3` scored 4/10 and
> **fabricated** candidate strings in the same batch. Its fallback chain therefore only carries
> `deepseek-flash` (also 10/10, and the one provider dsh always registers); `M3` is excluded and `v4-pro` is
> left out because its vision support is untested.
>
> **How to use it**: delegation carries text only, so put the **image path** in the brief, e.g.
> "have vision analyze `/tmp/ui.png` for spacing and contrast". The role calls `read_image` itself.
> Upstream exposes no "vision capability" flag, so the plugin **cannot validate it at startup** — if you bind
> another model, run it once on an image with known text and check that it reads the text correctly.

Each role is a delegation-tool instance plus an auto-generated Agent Preset. The preset copies your default
session mode, replaces the persona, and removes the delegation group. That is why Settings → Agent presets
shows eight "角色：xxx · model" entries. They are generated: do not delete or rename them, and do not pick one for a
main session.

### Recommended bindings (official suggestion)

See **[MODELS.en.md](./MODELS.en.md)** for the recommended model per role. "Recommended" and "built-in default"
can differ — `reviewer` is one.

The provider must be registered on your machine. Without the matching subscription, built-in roles degrade along
their fallback chain to `deepseek-official`; on a new machine run `/rolegroup init` first.

## 4. Configuration

Two layers only: the **built-in table** (factory defaults) and **panel overrides** (optional). There is no config
file layer — as of v0.11 `rolegroup.jsonc` is no longer read at runtime, and `/rolegroup init` only exports the
current bindings as text for your records.

| State | Effective table |
|---|---|
| no overrides at all | the built-in table (= the recommendation in [MODELS.en.md](./MODELS.en.md)) |
| panel takeover with N rows | those N rows override the built-in table; the others still use it |

Each row may set `provider`, `model`, `reasoningEffort` (optional), `fallbackModels` (optional), `persona`
(optional) and `summary` (optional). `reasoningEffort` must be a level the model supports; leaving it empty uses
the model default.

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

At startup the plugin walks "primary route → chain" and picks the first route whose provider is registered and
whose model is advertised; a degraded pick is reported in the startup log and by `/rolegroup doctor`. Chains may
not point at third-party gateways: those providers are not guaranteed to exist on someone else's machine.

**Explicitly configured roles never degrade.** If you override a role and leave out `fallbackModels`, the plugin
follows exactly what you wrote — when it is unavailable the role is not registered and doctor tells you why. Add
the chain yourself if you want resilience.

### Runtime

- `maxDepth` is 1: the main session can delegate, role subagents cannot. Setting it to 0 also blocks top-level
  delegation. The role preset drops the delegation group, so children cannot see `subagent` / `workflow`; the
  eight role tools are registered on the host plane and stay visible in a child's tool list, but calling one is
  rejected by `maxDepth`. Upstream 0.2.1 removed `toolFilter`, so the plugin cannot hide host tools — known noise,
  not an escape.
- A panel save applies to new sessions; in-flight sessions are unaffected.
- Chains are resolved at **startup only**: the role tool binds its model when it is registered, so there is no
  runtime failover on 429. `llm/adapters-updated` makes the plugin recompose and resolve again.
- Delegation returns a subagent id immediately; you get a notification when the task finishes.

`readonly` is a retired field. If an old config still carries it you get a migration hint and it has no effect.
Use session-level permission presets (`read-only` / `workspace-write` / `danger-full-access`, inherited by
delegation) for read-only work; express a role's read-only tendency in its persona.

## 5. Settings panel

Settings → 角色配置 edits roles and model bindings: add or remove roles, change provider/model, persona/summary
and reasoning effort.

One status line says which table is active — only two states:

| State | Meaning |
|---|---|
| **Official defaults (built-in table)** | no overrides at all |
| **Panel overrides (N rows)** | the panel took over and wrote N rows |

Three actions:

- **Save** — write the draft as panel overrides (`enabled=true` + the whole table).
- **Discard** — drop the draft, change nothing.
- **Restore official defaults** — zero-override takeover, so the effective table equals the built-in one. It
  writes **no model names**, so future changes to the shipped defaults are followed automatically.

The panel shows the **whole effective table**: built-in roles missing from your overrides are filled in as normal
rows carrying the built-in route and chain, and can be edited like any other row. Built-in rows have no remove
button (removing one only reverts it to the built-in value); custom rows can be removed.

When a role's provider is not registered on this machine, the panel shows "N roles use a provider that is not
registered" with a **Fill with available models** button that points those rows at the deployment default route
(or the first available model when there is no default). The button is hidden when there is nothing to fill. It
only edits the draft — you still click Save.

Every row is saved with its `fallbackModels` (the panel offers no editor for it, but passes it through). A panel
save is an explicit configuration, and explicit configurations do not inherit the built-in chain — dropping it
would silently disable degradation.

The header shows the plugin name, version and a GitHub link. Reasoning effort may be left empty to use the model
default (Kimi K3 defaults to `high`); the dropdown comes from the model catalog, and unsupported values are
flagged and block the save.

> **Exposed surface**: as of v0.11 the plugin registers **no HTTP routes at all**. The old read-only
> `/api/dsh-rolegroup/config` endpoint was removed together with the config-file viewer, so the surface is zero.

Clearing the panel does not disable the plugin: `mergeRoles` always seeds the built-in table, so an empty override
table means "back to the eight built-in roles". To disable it, uninstall the plugin or remove its install entry.

## 6. Diagnostics

`/rolegroup doctor` reads the `$DSH_HOME/plugins/dsh-rolegroup/last-startup.json` snapshot and compares it
with the live llm service. It lists each role's name, bound model, provider, and whether the model is
available, with repair hints when something is wrong. When a built-in fallback is in effect it says so
("primary X unavailable, using built-in fallback Y").

- `/rolegroup doctor`: diagnose.
- `/rolegroup init`: export the **current effective bindings** as JSONC text (printed, nothing written). As of
  v0.11 it is a record/comparison tool only — `rolegroup.jsonc` is no longer a configuration source.
- Bare `/rolegroup` or an unknown subcommand: print usage.

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
planner  kimi-coding/k3                   ✅       ✅
coder    kimi-coding/k3                   ✅       ✅
reviewer qwen-token-plan-cn/qwen3.8-max   ✅       ✅
scout    deepseek-official/deepseek-flash ✅       ✅
scribe   qwen-token-plan-cn/qwen3.8-flash ✅       ✅
vision   qwen-token-plan-cn/qwen3.8-flash ✅       ✅
fallback deepseek-official/deepseek-flash ✅       ✅

✅ 无异常
```

Also: a snapshot older than seven days, or one that looks hand-edited, gets a ⚠️, but the table is still
printed. A jsonc config untouched for 14 days gets a review notice; panel-written settings have no timestamp,
so no notice there. If the llm service is unavailable, the availability column reads ➖. A role whose preset
fails to activate goes into `invalid[]` and is not registered.

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
| `lib/` | Host side: `index.js` (composition/recomposition), `roles.js` (role table and merge), `config.js` (settings `Config`), `config-info.js` (config snapshot + read-only route), `doctor.js`, `command.js` |
| `src/client/` | Client sources (`controller.js` / `card.jsx` / `locales.js` / `meta.js` / `config-file.js`); `lib/client.js` is the esbuild artifact and must be rebuilt after edits |
| `tests/` | Offline smoke suite (plain Node, no browser) |
| `scripts/` | `build-client.mjs` (esbuild bundle; injects the `package.json` version) and `link-deployment-deps.mjs` (environment symlink) |
| `locale/` | Plugin metadata: `meta.title` and `meta.description` in `en.json` / `zh.json`, shown by the Plugins page and the Plugin Market |

## 8. Compatibility

Verified on dsh 0.2.1-rc.3; dsh ≥ 0.2.1-rc.1 is required. On 0.2.0 the plugin still loads, and the panel and
doctor work, but roles are not registered and the startup log asks for an upgrade. The panel uses the
Config-schema settings interface from dsh 0.1.7: an entry with a static `Config` and `.volatile()`, plus
`configForms` and `settings.section` on the client.

The panel lives in Settings, so the plugin does not show up under the Plugins page's "Official" group. With
the official plugin manager or the Plugin Market it appears under "Installed", with an enable/disable toggle.

## 9. FAQ

**Why do eight "角色：xxx · model" entries appear under Settings → Agent presets?**
They are generated by this plugin (one per role: copy of the default mode composition, persona replaced,
delegation group removed). Do not delete or rename them, and do not pick one for a main session. A deleted
preset makes the role fail the health audit on the next start or reload; selecting a role preset for a main
session gives you a session without the standard tools. Edit role config through the panel.

**Why doesn't a subagent/sub-session show its model?**
The subagent UI has no dedicated model chip. Rolegroup puts the model into two existing fields: the Agent
Preset name (the header role label reads e.g. `角色：scout · deepseek-flash`) and the delegation `description`
(the task title, e.g. `Login validation · kimi-coding/k3`). A dedicated model chip requires upstream subagent UI
support.

**How do I do image work — is `vision` enough?**
Yes; `vision` is built in, so you do not need a custom role. Put the **image path** in the brief, e.g. "have
vision look at `/tmp/ui.png` and check spacing and contrast", and it calls `read_image` itself.

The image has to be a file on disk, because delegation carries text only. It ships bound to `qwen3.8-flash`,
which scored 5/5 on OCR and 6/6 on UI fields in the 2026-11-13 round; `deepseek-flash`, `qwen3.8-max` and
`kimi-k3` also scored full marks, so switching models buys accuracy you cannot measure. Pick on cost and
availability — see [MODELS.en.md](./MODELS.en.md).

If you do switch: avoid text-only models, and keep them out of the fallback chain (`v4-pro`, for example), or the
degraded route cannot read the image at all. There is no "vision capability" flag upstream, so the plugin cannot
check this at startup. Try one image with known text after switching; if it reads the text, it works.

**I switched the session mode (PTC / minimal / creative). Why does the role tool surface stay the same?**
Role sub-sessions are based on your default mode, not on the per-session mode. If you only use the standard
mode, there is no difference.

**Installed, but no role tools appeared?**
① Check that `--dump-config` shows `- id: dsh-rolegroup`; ② restart `dsh web` and open a new session
(neither code nor config is hot-applied); ③ run `/rolegroup doctor` to see whether a role was skipped because
its provider is not registered.

**`/rolegroup` does nothing?**
Pasting text starting with `/` into the GUI composer sends it as an ordinary message. Type it by hand or pick
it from the completion list.

**The panel disappeared but the role tools still work?**
For a source install, it is usually the missing schemastery symlink; run `npm run link:deps` (see §7). For a
package or market install, the `@deepseek-ai/schemastery` peer dependency probably did not install; reinstall
the plugin or check the profile dependencies.

**How do I disable the plugin entirely?**
Disable or uninstall it in the Plugins page or Plugin Market, or remove it from the profile dependencies.
Mounted on the home layer from source: remove its insert row from `~/.dsh/cordis.patch.yml`.
⚠️ An empty override table in the panel does not disable it; `mergeRoles` always seeds the built-in table.

## 10. Credits

The role (category) to model binding, the JSONC config format, and the rule that role subagents cannot
delegate again are inspired by [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) ("omo"). The
model pairings are not copied from omo; this plugin's bindings are decided by its own configuration and
evaluation.

## 11. License

MIT
