# 角色与推荐模型

本文档是内置角色表（出厂默认）的文档镜像，列出每个角色出厂的绑定模型。**你当前生效的配置可能不同**——
面板自定义或 `rolegroup.jsonc` 会覆盖它。想回到这张表的值，在面板里点「恢复官方推荐」。

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
