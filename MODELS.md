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

这张表就是插件的内置默认值；面板里没有覆盖时，生效的就是它。想回到这张表的值，点面板的「恢复官方推荐」。

同一个模型可能有多条路由（订阅套餐、按量计费、聚合网关），provider 由你的配置决定；`/rolegroup doctor`
显示本机实际用的是哪条。

## 只有 DeepSeek 时

没有 qwen / kimi 订阅时，上面这些模型都用不到，内置角色会沿备用链落到
`deepseek-account/deepseek-flash`（账号登录；没有登录态则用 `deepseek-official`）。`doctor` 会把每一行
标成「已用内置备用档」——不是出错，是降级。

想让 analyst / reviewer 用更强的 `deepseek-v4-pro`，在面板里把这两行的**提供方**改成
`deepseek-account`、**模型**改成 `deepseek-v4-pro`，保存即可。

## 换用自己的 provider

面板的「提供方」下拉只列**本机已注册**的 provider。配好新的 provider（自带 key 或登录）并重启
`dsh web` 后，它会出现在下拉里：选中它、再选模型，保存即对新会话生效。

要加内置表里没有的角色，点「+ 新增角色」，工具名就是角色名。想留档就 `/rolegroup init`
（只打印当前绑定，不写文件）。
