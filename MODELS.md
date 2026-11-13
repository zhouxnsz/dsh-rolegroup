# 角色与推荐模型

本文档介绍各角色的官方推荐模型。

| 角色 | 官方推荐 | 内置默认 |
|---|---|---|
| `analyst` | `qwen-token-plan-cn/qwen3.8-max` | `qwen-token-plan-cn/qwen3.8-max` |
| `planner` | `kimi-coding/k3` | `kimi-coding/k3` |
| `coder` | `kimi-coding/k3` | `kimi-coding/k3` |
| `reviewer` | `qwen-token-plan-cn/qwen3.8-flash` | `qwen-token-plan-cn/qwen3.8-max` |
| `scout` | `deepseek-official/deepseek-flash` | `deepseek-official/deepseek-flash` |
| `scribe` | `qwen-token-plan-cn/qwen3.8-flash` | `qwen-token-plan-cn/qwen3.8-flash` |
| `vision` | `qwen-token-plan-cn/qwen3.8-flash` | `qwen-token-plan-cn/qwen3.8-flash` |
| `fallback` | `deepseek-official/deepseek-flash` | `deepseek-official/deepseek-flash` |

provider 需要在你机器上已注册，用 `/rolegroup doctor` 可以查。没有对应订阅时，内置角色会沿备用链降级到
`deepseek-official`；换机器可以跑 `/rolegroup init` 生成一套本机可用的路由。
