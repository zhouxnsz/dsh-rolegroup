# Roles and recommended models

This page lists the officially recommended model for each role.

| Role | Recommended model |
|---|---|
| `analyst` | `qwen3.8-max` |
| `planner` | `k3.1-pro` |
| `coder` | `k3.1-pro` |
| `reviewer` | `qwen3.8-flash` |
| `scout` | `deepseek-flash` |
| `scribe` | `qwen3.8-flash` |
| `vision` | `qwen3.8-flash` |
| `fallback` | `deepseek-flash` |

That table is the plugin's built-in default; with no override in the panel, it is what applies. To get back to
these values, click "Restore official defaults" in the panel.

The same model usually has several routes (subscription plan, pay-as-you-go, gateway), so the provider is up to
your configuration — `/rolegroup doctor` shows which route this machine actually uses.

## DeepSeek only

Without a qwen or kimi subscription none of the models above are reachable, and built-in roles fall back along
their chain to `deepseek-account/deepseek-flash` (account login; `deepseek-official` when there is no login).
`doctor` marks each such row as using a built-in fallback — that is a downgrade, not an error.

To put `analyst` / `reviewer` on the stronger `deepseek-v4-pro`, change **provider** to `deepseek-account` and
**model** to `deepseek-v4-pro` for those two rows in the panel, then save.

## Using your own provider

The provider dropdown only lists providers **registered on this machine**. After you configure a new one (own key
or login) and restart `dsh web`, it appears in the dropdown: pick it, pick a model, save — the change applies to
new sessions.

To add a role that the built-in table does not have, click "+ Add role"; the tool name is the role name. For a
record of the current bindings, run `/rolegroup init` (it prints them; it does not write a file).
