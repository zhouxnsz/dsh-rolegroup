// dsh-rolegroup: 部署树模块解析链（由 lib/index.js 的 resolveToolSubagent 泛化而来，解析顺序逐字不变）。
//
// v0.4 变更（plans/v0.4-settings-migration.md T3）：本文件原先还承载 settings 命名空间注册
// （旧的「插件自报命名空间 + schema + base/validate + watch」通道）。dsh `0.1.7-rc.2` 把该通道
// 整体换成了「Loader 条目自带 Config」范式，那部分**整体退役**：
// settings 层改由 `lib/config.js` 的条目 `Config`（schemastery）+ `loader/volatile-update` 承担。
// 本文件只剩下面这条解析链——它仍被 `@deepseek-ai/dsh-tool-subagent` 的按需解析使用（lib/index.js）。
//
// @module dsh-rolegroup/settings

/**
 * 部署树模块解析链：
 *   1. 常规裸导入（插件被 npm 安装到含依赖的 store 时可用）
 *   2. `ctx.loader.import`（根 loader，baseUrl 取决于部署）
 *   3. 借用任一 `@deepseek-ai/*` 条目所属条目树的 baseUrl 导入（dsh-base patch 树的
 *      baseUrl 在部署 node_modules 内，必定能解析兄弟包）
 *
 * link: 开发形态下裸导入 `@deepseek-ai/*` 必失败（§0 S10/U2），必须走 2/3。
 * 注：**不需要**静态导入的包（如 v0.4 的 schemastery）不走这条链，而走
 * `scripts/link-deployment-deps.mjs` 建的仓库内软链——见 docs/dsh-0.1.7-upgrade-impact.md §5。
 *
 * @param {object} ctx 宿主 ctx
 * @param {string} specifier 目标包名
 * @returns {Promise<any | undefined>} 全部失败返回 undefined，不抛。
 */
export async function resolveDeploymentModule(ctx, specifier) {
  try {
    return await import(specifier)
  } catch { /* 继续走 loader 链 */ }
  const loader = ctx.get?.('loader')
  if (loader === undefined) return undefined
  try {
    const mod = await loader.import?.(specifier)
    if (mod !== undefined) return mod
  } catch { /* 继续 */ }
  try {
    for (const entry of loader.entries?.() ?? []) {
      if (typeof entry.options?.name === 'string' && entry.options.name.startsWith('@deepseek-ai/')) {
        return await entry.parent.tree.import(specifier, entry.getOuterStack)
      }
    }
  } catch { /* 全部失败 */ }
  return undefined
}
