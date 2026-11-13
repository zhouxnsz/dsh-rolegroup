# Roles and recommended models

This page lists the officially recommended model for each role.

| Role | Recommended | Built-in default |
|---|---|---|
| `analyst` | `qwen-token-plan-cn/qwen3.8-max` | `qwen-token-plan-cn/qwen3.8-max` |
| `planner` | `kimi-coding/k3` | `kimi-coding/k3` |
| `coder` | `kimi-coding/k3` | `kimi-coding/k3` |
| `reviewer` | `qwen-token-plan-cn/qwen3.8-flash` | `qwen-token-plan-cn/qwen3.8-max` |
| `scout` | `deepseek-official/deepseek-flash` | `deepseek-official/deepseek-flash` |
| `scribe` | `qwen-token-plan-cn/qwen3.8-flash` | `qwen-token-plan-cn/qwen3.8-flash` |
| `vision` | `qwen-token-plan-cn/qwen3.8-flash` | `qwen-token-plan-cn/qwen3.8-flash` |
| `fallback` | `deepseek-official/deepseek-flash` | `deepseek-official/deepseek-flash` |

The provider must be registered on your machine — `/rolegroup doctor` shows that. Without the matching
subscription, built-in roles degrade along their fallback chain to `deepseek-official`. On a new machine,
`/rolegroup init` generates a route table that works locally.
