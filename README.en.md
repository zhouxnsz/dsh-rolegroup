# dsh-rolegroup

A role-based delegation plugin for dsh. Define a role once (name, bound model, persona), then delegate by role
name instead of writing `provider`/`model` every time. Each role gets its own host `dsh-tool-subagent`
instance, so the tool name is the role name.

The role/category binding is inspired by
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) ("omo"); see §10.

> Version **0.8.2** ｜ dsh **≥ 0.2.1-rc.1** (verified on 0.2.1-rc.3) ｜ MIT

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

In an ecosystem where everything is a plugin, staying focused is a choice and a red line. The items below are
**deliberate decisions, not missing features**:

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

After changing code or `rolegroup.jsonc`, restart and open a new session. For panel saves, see §5.

## 3. Built-in roles

With no configuration, the plugin registers eight roles. The models below are initial values;
`rolegroup.jsonc` or the panel can override them.

The table names models only: one model usually has several routes (subscription plan, pay-as-you-go, gateway),
and the provider is up to your configuration. The built-in default points at the built-in table's providers (the
author's subscriptions) — on your machine run `/rolegroup init` to generate routes that actually work, or edit
them in the panel. Model ids and the effective routes are whatever `/rolegroup doctor` prints.

| Role | Built-in model | Responsibility |
|---|---|---|
| `analyst` | Qwen3.8 Max | Requirement clarification, path classification, plan review (do it / how), architecture decisions |
| `planner` | Kimi K3 | Plan design: file layout, task breakdown, interface contracts, writing `plans.md` |
| `coder` | Kimi K3 | Implementation: TDD red-green-refactor following `plans.md` steps |
| `reviewer` | Qwen3.8 Max | Closing review: check acceptance criteria against evidence (was it actually done) |
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
shows seven "角色：xxx · model" entries. They are generated: do not delete or rename them, and do not pick one for a
main session.

### Recommended bindings (official suggestion)

We pick each role's model from **measurements**, and we distinguish "official recommendation" from
"built-in default" — they may differ. The full rationale (which models we tested, the method, the full matrix,
known traps, limitations and re-test triggers) lives in **[MODELS.md](./MODELS.md)**.

Three takeaways that matter more than a table:

- **`coder` / `planner` / `scout` / `scribe` have hit the capability ceiling** with these tasks → pick on cost,
  do not pay for a flagship;
- **`vision` does not need a flagship**: all four candidates (including Kimi K3) scored full marks on clean images;
- **two traps**: `qwen3.7-plus` produced a self-contradictory review verdict; **Kimi** failed twice to write the
  requested artifact in the fallback tasks.

> ⚠️ Provider availability depends on your subscription: the built-in defaults point at the author's own
> subscriptions. On a new machine run `/rolegroup init` to generate a working route table, or compare with
> `/rolegroup doctor` before editing rows.

## 4. Configuration

### Lookup order

The plugin looks for config in this order and stops at the first hit:

1. `<launch cwd>/.dsh/rolegroup.jsonc` (project-level)
2. `$DSH_HOME/rolegroup.jsonc` (user-level; defaults to `~/.dsh`)
3. none → built-in table (§3)

### Format

```jsonc
// .dsh/rolegroup.jsonc; list only the roles you want to change
{
  "roles": {
    "analyst": {
      "provider": "qwen-token-plan-cn",          // optional; inherits the built-in provider
      "model": "qwen3.8-flash",
      "reasoningEffort": "medium",                // optional; omit to use the model default
      "fallbackModels": ["deepseek-official/deepseek-flash"], // optional; tried in order when the primary is unavailable
      "persona": "file://./personas/analyst.md",  // optional; file:// link (relative to this file) or inline
      "summary": "Requirement clarification and plan review" // optional; one line
    }
  }
}
```

The role name is the JSON key. Each role can set `provider`, `model`, `reasoningEffort` (optional),
`fallbackModels` (optional), `persona` (optional), and `summary` (optional). `reasoningEffort` must be a level
the model supports; leave it out to use the model default (see §5).

### Fallback chains

Every built-in role bound to a provider other than `deepseek-official` carries a fallback chain, so a machine
without a qwen or Kimi subscription still gets a working table:

```jsonc
"analyst": {
  "provider": "qwen-token-plan-cn",
  "model": "qwen3.8-max",
  "fallbackModels": ["deepseek-official/deepseek-flash", "deepseek-official/deepseek-v4-pro"]
}
```

Built-in chains are **cheap-first** (`deepseek-flash` → `deepseek-v4-pro`); v4-pro is only the last resort when
flash itself is unavailable. At startup the plugin takes the first route whose provider is registered and whose model is advertised
(primary first, then the chain). A degraded role is called out in the startup log and by
`/rolegroup doctor` (`⚠️ analyst: primary … unavailable, using built-in fallback …`).

**Explicit configuration never degrades on its own**: once a role appears in your `rolegroup.jsonc` (or was
saved from the panel), that route is executed as written. If it is unavailable the role is not registered and
doctor prints an actionable hint. Add `fallbackModels` to that role yourself if you want a chain.

For now chains are read from the config file only; the Settings panel does not edit them (and a panel save
takes over the whole layer, so file chains do not carry over).

### Precedence

**Panel (settings layer) > project `rolegroup.jsonc` > user `rolegroup.jsonc` > built-in table.**

One layer is chosen as a whole; layers are not merged role by role. If a layer exists, the layers below it are
not read at all. The final table comes from the chosen layer, with the built-in table filling in missing
roles.

What this means in practice: saving in the panel takes over the whole table, and `rolegroup.jsonc` stops
participating. A role that exists only in jsonc, and was not moved into the panel, falls back to the built-in
table; it does not keep using jsonc. So:

- Use jsonc or the panel, not both.
- Before takeover, the panel pre-fills the active table. Saving takes over the whole layer; you do not need to
  copy jsonc rows into the panel by hand.
- To go back to jsonc, click "Reset to file config" in the panel (it clears `enabled` and `roles`).

To see which layer is active, read the "config source" line from `/rolegroup doctor`.

### Runtime

- At startup, routes are checked: the first route whose provider is registered and whose model is advertised
  wins (primary, then the fallback chain). Built-in roles carry chains, so a machine without qwen / Kimi
  subscriptions still runs; an **explicitly configured role never degrades** — an unregistered provider means
  it is not registered, with a repair hint in the log and doctor. A model missing from the advertised list
  only produces a warning; the role is still registered and delegation checks it again.
- `maxDepth` is 1: the main session can delegate, role subagents cannot. Setting it to 0 also blocks
  top-level delegation.
  Implementation detail (measured, easy to misread): the role preset drops the **delegation group**, so
  `subagent` / `subagent_fork` / `workflow` do not appear in child sessions. The eight **role tools** are
  registered on the host plane, though, so they still show up in a child's tool list; calling one is
  rejected at runtime by `maxDepth`. Upstream 0.2.1 removed `toolFilter`, so the plugin cannot hide host
  tools from children — a known limitation (noise, not an escape).
- Changes to `rolegroup.jsonc` are not hot-applied; restart and open a new session. Panel saves apply to new
  sessions (see §5).
- Chains resolve at **startup only**: a dsh role tool fixes its model when it is registered, so a chain picks
  one route per start rather than switching at runtime like omo's 429 fallback; `llm/adapters-updated` makes
  the plugin recompose and resolve again.
- Delegation returns a subagent id immediately. You get a completion notice when the task finishes; no
  polling.

`readonly` is deprecated. If an old config still has it, you get a migration notice, but it does nothing. For
read-only, use a session-level permission preset (`read-only` / `workspace-write` / `danger-full-access`,
inherited by delegations); express a role's read-only lean in its persona.

## 5. Settings panel

Settings → 角色配置 edits roles and model bindings: add or remove roles, change provider/model,
persona/summary, and reasoning effort. Save, Discard, and Reset to file config are at the bottom.

When some roles name a provider that is not registered on this machine, the panel shows
"N roles use a provider that is not registered" with a **Fill with available models** button: those rows are
pointed at the deployment default route (or the first available model when there is no default). Only the draft
changes — you still click Save.

The panel does not take over by itself. Before takeover it reads the active table (jsonc or built-in) and
pre-fills the editor. Save becomes available after you change something; saving writes `enabled=true` and the
whole table, and the panel takes over. If the read fails, the panel falls back to an empty table with manual
add, an inline error, and a retry. Reset to file config clears both fields and exits takeover.

**After takeover the panel shows the whole effective table**: built-in roles that are missing from your
override table (for example, a role added by a later plugin version) are filled in as normal rows carrying the
built-in route and fallback chain, and can be edited like any other row. Built-in rows have **no remove
button** (because `mergeRoles` always seeds the built-in table, removing one only reverts it to the built-in
default); custom rows can be removed.

Every row is saved **with its `fallbackModels`** (the panel does not offer an editor for it, but passes it
through unchanged). That matters: a panel save is an explicit configuration, and explicit configurations do
**not** inherit the built-in chain — dropping it would silently disable degradation (the role would be pruned
when its primary route is unavailable).

The header shows the plugin name and version, plus a GitHub link. The Config file button opens the active
`rolegroup.jsonc` in the right sidebar's document preview. It closes Settings first so the sidebar is visible.
If there is no config file, it shows a one-line notice in the page instead of a popup. Host-side code changes
need a `dsh web` restart.

> **Endpoint exposure (explicit)**: `GET|HEAD /api/dsh-rolegroup/config` — **loopback only, no authentication,
> read-only**. It returns the **in-memory snapshot** read at startup (one of the project/user `rolegroup.jsonc`)
> and **never reads files based on request parameters**, so there is no arbitrary-file-read or path-traversal
> surface. Any process that can reach the local loopback can already read `~/.dsh`, so this endpoint widens no
> trust boundary; in multi-user or untrusted-host setups, keep `dsh web` bound to loopback (the default).
> Responses carry `nosniff`, so they cannot be executed via `<script>`.

Reasoning effort can be left empty, which means the model's default (Kimi K3, for example, defaults to
`high`). A higher level is usually slower and more expensive, but it reasons more thoroughly. The dropdown options come from
the model catalog and only include levels the model supports. An unsupported value is marked red and blocks
saving; switching models clears an old level the new model does not support.

Panel saves apply to new sessions; in-flight sessions are not affected. `rolegroup.jsonc` still needs a
restart and a new session.

You cannot disable the plugin by emptying the panel. `mergeRoles` always seeds the built-in table, so an empty
override table means "back to the seven built-in roles." To disable it, uninstall the plugin or remove its
install entry.

## 6. Diagnostics

`/rolegroup doctor` reads the `$DSH_HOME/plugins/dsh-rolegroup/last-startup.json` snapshot and compares it
with the live llm service. It lists each role's name, bound model, provider, and whether the model is
available, with repair hints when something is wrong. When a built-in fallback is in effect it says so
("primary X unavailable, using built-in fallback Y").

- `/rolegroup doctor`: diagnose.
- `/rolegroup init`: print a starter config that overrides only the roles whose primary route is unavailable
  on this machine (nothing is written) and show the active layer (panel / project jsonc / user jsonc / built-in).
- `/rolegroup init --write`: write the user-level `$DSH_HOME/rolegroup.jsonc`; refuses to overwrite, and
  **refuses while the panel has taken over or a project-level config exists** — a file written then would not
  be read.
- `/rolegroup init --write --project`: write the project-level `<cwd>/.dsh/rolegroup.jsonc`; warns when the
  user-level file is the active layer and would be shadowed.
- `/rolegroup init --diff`: list which roles in the existing file would be replaced or dropped (the generated
  file replaces the whole file).
- `/rolegroup init --write --force`: overwrite, after backing the existing file up to `<path>.bak-<timestamp>`.
- Bare `/rolegroup` or an unknown subcommand: print usage.

> On a fresh machine, run `/rolegroup init` first to see which routes actually work, then decide whether to
> `--write`. The generated file overrides only the unavailable roles and keeps each fallback chain.

Note: pasting text starting with `/` into the GUI composer sends it as a normal message, not a command. Type
it by hand or pick it from the completion list.

Example:

> If a role's provider is not registered, an error block is appended below the table and the provider is
> marked ❌. The role is not registered. This matters most for a fallback role: a skipped fallback route does
> not exist. The built-in fallback is bound to `deepseek-official` because that provider is always
> registered:

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

Also: a snapshot older than seven days, or one that looks hand-edited, gets a ⚠️, but the table is still
printed. A jsonc config untouched for 14 days gets a review notice; panel-written settings have no timestamp,
so no notice there. If the llm service is unavailable, the availability column reads ➖. A role whose preset
fails to activate goes into `invalid[]` and is not registered.

## 7. Development

```sh
npm run link:deps     # first after cloning: create the schemastery symlink
npm install           # then install the esbuild devDependency
npm test              # offline smoke suite, 156 cases; pretest runs link:deps
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

**Why do seven "角色：xxx · model" entries appear under Settings → Agent presets?**
They are generated by this plugin (one per role: copy of the default mode composition, persona replaced,
delegation group removed). Do not delete or rename them, and do not pick one for a main session. A deleted
preset makes the role fail the health audit on the next start or reload; selecting a role preset for a main
session gives you a session without the standard tools. Edit role config through the panel or
`rolegroup.jsonc`.

**Why doesn't a subagent/sub-session show its model?**
The subagent UI has no dedicated model chip. Rolegroup puts the model into two existing fields: the Agent
Preset name (the header role label reads e.g. `角色：scout · deepseek-flash`) and the delegation `description`
(the task title, e.g. `Login validation · kimi-coding/k3`). A dedicated model chip requires upstream subagent UI
support.

**Want an image-understanding role?**
Custom roles are supported — add one to `rolegroup.jsonc` (or the panel):

```jsonc
{
  "roles": {
    "looker": {
      "provider": "opencode-go",
      "model": "qwen3.7-plus",
      "summary": "Images: screenshots, UI, charts, error shots",
      "persona": "You are looker, a vision role. Open the given image path with read_image and return a structured description (layout, text, colors, anomalies). Read-only; say when you cannot see clearly instead of guessing.",
      "fallbackModels": ["deepseek-official/deepseek-flash"]
    }
  }
}
```

Three catches: the image must be a **file on disk** (the parent puts the path in the brief; the child opens it
with `read_image`); keep text-only models (e.g. `deepseek-v4-pro`) out of the fallback chain or the degraded
route cannot see images; the model itself must accept image input (Qwen3.7 Plus / Qwen3.8 Flash / Kimi K3.1 Pro /
DeepSeek V4.1 Flash all do).

**I switched the session mode (PTC / minimal / creative). Why does the role tool surface stay the same?**
Role sub-sessions are based on your default mode, not on the per-session mode. If you only use the standard
mode, there is no difference.

**Installed, but no role tools appeared?**
① Check that `--dump-config` shows `- id: dsh-rolegroup`; ② restart `dsh web` and open a new session
(neither code nor config is hot-applied); ③ run `/rolegroup doctor` to see whether a role was skipped because
its provider is not registered.

**The panel says "not taken over yet" or the read failed?**
While not taken over, the panel pre-fills the effective table; it degrades to an empty table only when the
read fails, with an inline error and a retry button. Save is only available after an edit.

**I edited `rolegroup.jsonc` and nothing changed?**
First check whether the panel has taken over (§4: with `enabled=true`, jsonc yields entirely, so a reload
changes nothing). If it has, click "Reset to file config" in the panel. If it has not, config is simply not
hot-applied: restart and open a new session.

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
