# 角色与推荐模型

本文档介绍各角色的官方推荐模型。

| 角色 | 推荐模型 |
|---|---|
| `analyst` | `qwen3.8-max` |
| `planner` | `k3.1-pro` |
| `coder` | `k3.1-pro` |
| `reviewer` | `qwen3.8-flash` |
| `scout` | `deepseek-flash` |
| `scribe` | `qwen3.8-flash` |
| `vision` | `qwen3.8-flash` |
| `fallback` | `deepseek-flash` |

同一个模型往往有多条路由（订阅套餐、按量计费、聚合网关），provider 由你的配置决定。用
`/rolegroup doctor` 查看本机实际路由；换机器可以跑 `/rolegroup init` 生成一套可用的。
