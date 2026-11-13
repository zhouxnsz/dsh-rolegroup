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

The same model usually has several routes (subscription plan, pay-as-you-go, gateway), so the provider is up to your
configuration. Run `/rolegroup doctor` to see the routes this machine actually uses; on a new machine,
`/rolegroup init` generates a working set.
