# dsh-rolegroup

A **role-based delegation plugin** for the dsh ecosystem: it pins down "which model should do this kind of
work" once, as a **role** (a name + a bound model + a persona), so later you delegate by role name instead of
hand-writing `provider`/`model` every time. Each role mounts one host `dsh-tool-subagent` instance, and
**the role name is the tool name**.

> Version **0.5.0** ｜ verified against dsh **0.2.0-rc.2** ｜ MIT

---

## 1. Why rolegroup

Model selection is a **repeated decision**: which work deserves an expensive model, and where a cheap one is
enough. Scattered across every delegation call, it is easy to get wrong and impossible to accumulate into
knowledge.

| | What you hand it | What it decides for you | Constraint |
|---|---|---|---|
| Bare `subagent` | provider/model, every single time | nothing | you must recall the model each time |
| **Agent Teams** (official) | a task DAG / roster | **coordination**: who, dependencies, rounds | teammates **inherit the root model** — no per-member model binding |
| **dsh-rolegroup** | roles, defined once | **routing**: this kind of work → this model | one-shot specialist delegation; no orchestration |

**The three are complementary**: Agent Teams owns "how the work is split", rolegroup owns "which model this
kind of work should use". The usual pattern is to split expensive from cheap work (`reviewer` on a cheap
model, `coder` on a strong one) while leaving orchestration to Agent Teams.

> `dsh-changeflow`, mentioned throughout the docs, is this plugin's **companion workflow layer and is not
> published** — those references are design provenance and historical record. **They do not affect using this
> plugin on its own**: it depends on no changeflow code.

Two side benefits:

- **The role name is the tool name** — `analyst` / `coder` / `scout` show up directly in the tool list, so
  delegation needs no model recall;
- **It is diagnosable** — `/rolegroup doctor` lists, item by item, which model is actually in effect
  (including availability, see §6).

## 2. Quick start

### Install into dsh

Local `link:` plugins are best mounted on the **home layer** (not overwritten by profile rewrites; it has
survived two dsh upgrades):

```sh
ln -sfn "$PWD" ~/.dsh/profiles/web/node_modules/dsh-rolegroup
cat >> ~/.dsh/cordis.patch.yml <<'YAML'
- insert:
    - id: dsh-rolegroup
      name: 'dsh-rolegroup'
YAML
```

> **You can also use 0.2.0's official plugin manager**: `dsh plugin --profile web add "link:$PWD"` (writes into the
> profile's dependencies; visible and switchable under "Installed" in the Plugins page).
>
> **Pick one; do not use both.** The trade-off:
> - **home layer (the one above, recommended)**: not a profile dependency → **it cannot be wiped by a profile
>   rewrite** (a third-party market rewriting the profile once silently dropped local plugins this way). The cost:
>   **it does not show up under "Installed" in the Plugins page and has no enable/disable toggle** (that group is
>   keyed on "the name is a profile dependency" — see §8). It does **not** show up in the "Official" group either:
>   both sources of that group are unrelated to this plugin (§8), **regardless of how you install it**.
> - **official manager**: the standard path, visible and switchable in the UI; the cost is going back into the
>   container that profile rewrites touch.
> - Using both **will not break** (the loader dedupes by id and mounts once), but you get a mismatch: the UI says
>   "installed" while the home layer actually controls it, so its toggle does nothing.

### Verify

```sh
dsh --profile web --dump-config | grep -A1 dsh-rolegroup   # should show - id: dsh-rolegroup
```

Restart `dsh web` and open a **new session**: the 7 role tools should appear in the tool list, or run
`/rolegroup doctor` in that new session.

After changing code or config you must **restart + open a new session** (config is not hot-applied, see §4).

## 3. Built-in roles

With no configuration at all, the plugin registers these 7 roles (the bound models are **built-in initial
values**, overridable via `rolegroup.jsonc`):

| Role | Built-in model | Responsibility |
|---|---|---|
| `analyst` | `qwen-token-plan-cn/qwen3.8-max` | Requirement clarification, path classification, plan review (do it / how), architecture decisions |
| `planner` | `kimi-coding/k3` | Plan design: file layout, task breakdown, interface contracts, writing `plans.md` |
| `coder` | `kimi-coding/k3` | Implementation: TDD red-green-refactor following `plans.md` steps |
| `reviewer` | `qwen-token-plan-cn/qwen3.8-max` | Closing review: check acceptance criteria against evidence (was it actually done) |
| `scout` | `deepseek-official/deepseek-flash` | Exploration and bulk search (returns `file:line` evidence) |
| `scribe` | `qwen-token-plan-cn/qwen3.8-flash` | Documentation backfill, reports, spec maintenance |
| `fallback` | `deepseek-official/deepseek-flash` | Catch-all for unclassified lightweight tasks |

Model pairings are **data-driven** (three evaluation rounds, 58 cells, decided this table), so the table above
holds initial values rather than verdicts — **your effective bindings are whatever `/rolegroup doctor` prints**.

## 4. Configuration

### Lookup order (first hit wins)

1. `<launch cwd>/.dsh/rolegroup.jsonc` (project-level)
2. `$DSH_HOME/rolegroup.jsonc` (user-level; defaults to `~/.dsh`)
3. neither → the built-in table (§3)

### Format

```jsonc
// .dsh/rolegroup.jsonc; list only the roles you want to change
{
  "roles": {
    "analyst": {
      "provider": "qwen-token-plan-cn",          // optional → inherits the built-in table's provider
      "model": "qwen3.8-flash",
      "reasoningEffort": "high",                  // optional; omitted → the model's default effort
      "persona": "file://./personas/analyst.md"   // optional; file:// link (relative to this file) or inline string
    }
  }
}
```

The only role fields are **`toolName` / `provider` / `model` / `reasoningEffort?` / `persona` / `summary`**.

### Precedence with the GUI panel (four layers, **the highest present layer wins outright**)

**this panel (settings layer) > project `rolegroup.jsonc` > user `rolegroup.jsonc` > built-in table**

⚠️ **This is layer *selection*, not per-role stitching**: once a layer is in effect, every layer below it
**yields entirely** — the jsonc chain itself behaves the same way (a project file means the user file is not
read at all). The final table = **the winning layer + the built-in table filling the gaps** (`mergeRoles`
always seeds the built-in table; semantics held since v0.1).

**The consequence that bites**: saving in the panel = taking over the effective table ⇒ **`rolegroup.jsonc`
yields entirely**. A role that only exists in jsonc and was not moved into the panel **falls back to the
built-in table** — it does **not** "keep using jsonc". Therefore:

- **use jsonc or use the panel, not both**;
- if you already have jsonc overrides and want to tweak a few roles in the panel, **add the jsonc rows you
  want to keep to the panel as well before saving**;
- the way out of takeover is the panel's "Reset to file config" (it clears the `enabled` + `roles` fields).

Whether the panel is in effect is controlled by an **explicit boolean** (§5). To see which layer is really
live, read the "config source" line of `/rolegroup doctor`.

### Runtime behaviour

- **Startup route validation**: an unregistered provider → that role is **not registered** + an actionable
  error log; a model missing from the advertised list → a warning, still registered (the delegation-time
  precheck has the final say);
- **`maxDepth: 1`**: the main session may delegate, role subagents may not delegate further (**setting `0`
  would also block top-level delegation**);
- **Config is not hot-applied**: after editing the jsonc, restart / open a new session.

> **ℹ️ The `readonly` field was removed in v0.5**: a legacy `"readonly": true/false` in your config now
> yields a **migration notice** (a warning, not a rejection — the role still registers), but the field has
> **no effect whatsoever**.
> Why: **a tool-surface allow-list cannot express a permission boundary** — offering a field on the config
> surface that is easily mistaken for a security switch is worse than offering none. **The correct way to get
> read-only** is a **session-level permission preset** (`read-only` / `workspace-write` / `danger-full-access`,
> inherited by delegations), with a role's read-only lean expressed through its `persona`.

## 5. GUI panel

Under **Settings → 角色配置 (Role Routing)** you can edit role ↔ model routes visually: add/remove role rows,
change provider/model, edit persona/summary, with 保存 / 放弃 / 重置为文件配置 (Save / Discard / Reset to
file config) at the bottom.

> It registers as a settings-page **section** (`settings.section`), a peer of "Models" and "Agent presets" —
> because the role table is **feature-level configuration**, not plugin management. **It also does not appear
> under the Plugins page's "Official" group** (reasons in §8).

<!-- TODO(screenshot): panel screenshot pending — re-shoot, place at assets/rolegroup-panel.png, replace this line -->
> 📷 *Panel screenshot pending* (`assets/rolegroup-panel.png`).

**Two known trade-offs** (both deliberate, neither is a defect):

1. **Takeover is explicit** — a volatile boolean `enabled` in the Config (default `false`) decides whether the
   panel is in effect. "Save" writes `enabled=true` + `roles`; "Reset to file config" clears both and thereby
   **truly exits takeover**. Because the panel's "composition layer" can only come from the entry's `config:`, it
   **cannot prefill the runtime-read jsonc file table** → the **panel starts empty** (meaning "not taken over yet",
   with the effective table still coming from jsonc / the built-in table). *An empty list does not mean there are no
   roles*: add rows only for **the roles you want to change** — but **saving takes over the whole layer** (§4), so
   anything unlisted falls back to the **built-in** table and jsonc yields entirely. See §6 for the full effective table.
2. **"Zero roles" is not expressible** — `mergeRoles` always seeds the built-in table (semantics held since
   v0.1), so an empty override table in the panel means "no overrides" = back to the built-in 7, not "mount
   nothing" (**jsonc does not participate while taken over**). To disable the plugin entirely, remove its insert
   row from the home layer.

Saving takes effect after a **restart + new session**.

## 6. Diagnostics

`/rolegroup doctor` reads the `$DSH_HOME/plugins/dsh-rolegroup/last-startup.json` snapshot and compares it
against the runtime llm service, reporting per role: name / bound model / provider and model availability,
with repair suggestions on anomalies.

- `/rolegroup doctor` — diagnose;
- bare `/rolegroup` or an unknown subcommand — echo usage.

> Note (measured): **pasting** text starting with `/` into the GUI composer sends it as an ordinary message
> and does not trigger command parsing — type slash commands by hand or pick them from the completion list.

Sample output (really rendered from the new built-in table; the tool itself is Chinese-only):

> If a role's **provider is not registered**, an error block is appended below the table and that row's
> provider is marked `❌`; **the role is not registered at all** — worth remembering for a fallback role,
> since **a pruned fallback route does not exist** (which is exactly why the built-in fallback is bound to
> `deepseek-official`, the one provider dsh always registers):

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

Behaviour notes:

- A snapshot older than 7 days is flagged stale, and one edited by hand (mtime later than the recorded time) gets a
  ⚠️ — but **the table is always printed**; it never refuses to work;
- **Config-age notice**: an effective config untouched for over 14 days gets a ⚠️ (with day count and last change
  date), prompting a review of "that temporary override I put on top"; it uses the notice channel and is **not
  counted as an anomaly**; ⚠️ this notice **only applies to jsonc-file sources** — the settings layer written by the
  panel carries no timestamp, so while the panel is in takeover no such notice is produced (and the age of a
  yielded jsonc file is never passed off as the panel's);
- When the llm service is unavailable the whole availability column reads `➖` (never a false ✅); the snapshot is
  written once, during startup finalisation, so config changes appear only after a restart / new session.

## 7. Development

```sh
npm install         # ★ required once after cloning: devDependency esbuild (client build)
npm test            # offline smoke suite (89 pure-logic cases, ~0.2s; pretest runs link:deps)
npm run link:deps   # ★ required once after cloning, and after a dsh upgrade / tree move
npm run build:client  # after editing src/client/** or lib/roles.js: rebuild lib/client.js
```

> **The first two are mandatory after cloning**, otherwise you will see:
> ① without `npm install` → `npm test`'s client-build case fails with `ERR_MODULE_NOT_FOUND: esbuild`;
> ② without `link:deps` → dsh prints `[dsh-rolegroup] 无法使用部署树的 @deepseek-ai/schemastery …` at startup and
> the plugin **runs host-only** (role tools still work); only the Settings section is absent.

> **What `link:deps` is for**: this plugin is a `link:` package (its real path is this repo), so by Node's realpath
> rule it **cannot bare-import `@deepseek-ai/*`**; and the settings model requires the entry to **statically export** a
> schemastery `Config`, which cannot be resolved lazily — hence the deployment tree's schemastery is symlinked here.
> Without it the plugin **still loads** (host-only roles work as usual); only the panel is absent, with a
> `console.warn` at startup. The symlink is gitignored and never committed.

Layout:

| Path | Contents |
|---|---|
| `lib/` | Host side: `index.js` (composition/recomposition), `roles.js` (role table and merge), `config.js` (settings `Config`), `doctor.js`, `command.js` |
| `src/client/` | Client sources (`controller.js` / `card.jsx` / `locales.js`); **the artifact `lib/client.js` is generated by esbuild and must be rebuilt after edits** |
| `tests/` | Offline smoke suite (plain Node, no browser dependency) |
| `scripts/` | `build-client.mjs` (esbuild bundle), `link-deployment-deps.mjs` (environment symlink) |
| `assets/` | Image assets used by the READMEs |

## 8. Compatibility

Verified against **dsh 0.2.0-rc.2**; `lib/` depends only on the **Config-schema settings model** introduced in
0.1.7 (entry `Config` + `.volatile()` → namespace; client `configForms` + `settings.section`).

- Usable from **0.1.7-rc.2** onward; before 0.1.7 the `settings.register` / `SettingsScope` /
  `settings.plugin.item` / `settings.yaml` APIs were removed upstream, which invalidated the v0.3 panel and
  was **migrated in v0.4**;
- **0.2.0-rc.2 re-check: runs unchanged** (all contract points alive, key packages byte-identical, real-host
  behaviour unchanged).

> **On the Plugins page**: the config panel lives in **Settings** (§5), so this plugin does **not** appear under
> the Plugins page's "Official" group. Upstream decides with two flags: `installed` = the name is in the profile's
> `dependencies`, and `optional` = the name is in dsh's hard-coded official optional-bundle list
> (`OPTIONAL_BUNDLES`) — **this plugin satisfies neither**. The Plugins page appends **every** `plugins.item`
> card to the "Official" group unconditionally, which is why it used to be shown there; dropping the card removes
> that entirely (independently of the install method).
> To have it appear under "**Installed**" in the Plugins page (with an enable/disable toggle) it must become a
> profile dependency, i.e. be installed with the official plugin manager (see §2).

## 9. FAQ

**Installed, but no role tools appeared?**
① Check that `--dump-config` shows `- id: dsh-rolegroup`; ② **restart `dsh web` and open a new session** (neither
code nor config is hot-applied); ③ run `/rolegroup doctor` to see whether a role was pruned because its provider
is not registered.

**The panel is empty / says "not taken over yet"?**
That is expected, not a fault — the panel edits the **override table**, which is legitimately empty before
takeover; the effective table comes from `rolegroup.jsonc` / the built-in table. Add rows for just **the roles you
want to change** and Save (see §5, trade-off ①).

**I edited `rolegroup.jsonc` and nothing changed?**
First check whether the **panel has taken over** (§4: with `enabled=true` jsonc **yields entirely**, so a reload
changes nothing) — click "Reset to file config" in the panel to exit takeover. Otherwise it is just that config is
not hot-applied: **restart + open a new session**.

**`/rolegroup` does nothing?**
**Pasting** text starting with `/` into the GUI composer sends it as an ordinary message — type it by hand or pick
it from the completion list.

**The panel disappeared but the role tools still work?**
Almost certainly a missing schemastery symlink: the plugin degraded to host-only. Run `npm run link:deps` (see §7).

**How do I disable the plugin entirely?**
Remove its insert row from the home layer `~/.dsh/cordis.patch.yml`.
⚠️ An empty override table in the panel does **not** disable it — `mergeRoles` always seeds the built-in table
(see §5, trade-off ②).

> This English file mirrors `README.md`; where they disagree, the Chinese original is authoritative.

## 10. License

MIT
