# 贡献指南

这份文件讲流程。技术约束和架构地图在 [`AGENTS.md`](./AGENTS.md) 里——它是给 agent 看的，但也确实是
这个仓库最有价值的一份背景。写文档之前先读 [`STYLE.md`](./STYLE.md)，那份规则是从"读起来像 AI 生成"
倒推出来的。

## 提 PR 之前

1. **先开 issue**（或直接在 PR 描述里）说清：**问题 → 改法 → 验证方式**。
   如果一个 PR 说不清"怎么证明它是对的"，它大概还没准备好。
2. 读 [`AGENTS.md`](./AGENTS.md) 的 **红线** 与 **容易踩的坑** 两节——那里记录的是真实踩过的坑。

## 本地开发

```sh
npm test              # 离线 smoke suite（纯逻辑，Node 直跑，无浏览器依赖）
npm run link:deps     # dsh 升级/换部署树后必须重跑
npm run build:client  # 重建 lib/client.js（改了 src/client/** 或 lib/roles.js 后）
```

> `link:deps` 是必需的：本仓库是 `link:` 形态，按 Node 的 realpath 规则无法裸导入 `@deepseek-ai/*`，
> 故需把 dsh 部署树里的 schemastery 软链进本仓库 `node_modules`。`npm test` 的 `pretest` 会自动跑它。

## PR 要求

- `npm test` **全绿**；
- 改了 `src/client/**` 或 `lib/roles.js` → **产物 `lib/client.js` 已重建**（否则源码与产物不一致）；
- **新增行为要有断言**，且该断言在**旧实现上会红**（我们要求断言有证伪力，不接受恒真的测试）；
- 面向用户的变更同步更新 `README.md` 与 `README.en.md`（两版章节编号必须一致）；
- 新增/改动文档按 `STYLE.md` 写（先具体后结论、每段有可核事实、别用套话清单）；
- 不带入与主题无关的重构或格式化——把噪音留在别的 PR 里。

## 不接受的写法

- **用工具面白名单表达权限边界**。它表达不了（只能收窄工具面），在配置面提供它反而容易被误读成
  "安全开关"。只读请用**会话级 permission preset**（`read-only` / `workspace-write` / `danger-full-access`），
  角色的只读倾向用 `persona` 软约束表达。
- **手改 `lib/client.js`**：它是 esbuild 产物，下次构建即被覆盖。

## License

贡献即表示同意以 [MIT](./LICENSE) 授权。
