# Roles and recommended models

This page mirrors the built-in role table — the model each role ships with. **What is active on your machine may
differ**: panel overrides or a `rolegroup.jsonc` take precedence. To get back to these values, click "Restore
official defaults" in the panel.

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

The same model usually has several routes (subscription plan, pay-as-you-go, gateway), so the provider is up to your
configuration. Run `/rolegroup doctor` to see the routes this machine actually uses; on a new machine,
`/rolegroup init` generates a working set.
