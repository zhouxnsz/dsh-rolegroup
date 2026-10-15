// dsh-rolegroup client 半入口（v0.4 迁移：plans/v0.4-settings-migration.md T5 / D7）。
// 本文件经 scripts/build-client.mjs（esbuild）打成 lib/client.js（§0 wrapper 形状），产物提交入库。
//
// 自 dsh 0.1.7-rc.2 起，client 侧 settings 扩展点改名（旧名全树已不存在）：
//   旧 settings 作用域服务 → **`configForms`**；旧逐插件卡片槽位 → **`plugins.item`**；
//   旧「host 已 serve ∩ card 已注册」隐式分发 → `configForms.whileServed([ns], register)` 显式门控。
// 官方同款样板：$NM/dsh-client-ui-settings-subagent/lib/client.js:803-846。
//
// node 可导入性红线：tests 会 import 本模块并直接调用 apply，而 node 解析不了 JSX——
// 故 card.jsx 只能经**动态 import** 藏在 inject 回调内加载（node 测试不触发该回调）。
//
// 命名空间常量**就地写死**：client 包不得依赖 host 包（官方注释明说），
// 值必须与 host 侧条目 id / 命名空间逐字一致。

import { RolegroupCardController } from './controller.js'
import { zh, en } from './locales.js'

/** settings 命名空间 === host Loader 条目 id（`lib/config.js` 的 ROLEGROUP_ENTRY_ID）。 */
const ROLEGROUP_CLIENT_NS = 'dsh-rolegroup'

// inject 是**服务名**（cordis fiber 级）——包名图边在 package.json 的 `dsh.client.inject` 里，两者语义不同。
// remote.session 供 controller 拉 modelCatalog；configForms 是 0.1.7 的 settings 客户端基线服务。
export const inject = ['slots', 'locale', 'remote', 'remote.session', 'configForms']

/** @param {any} ctx client 侧 cordis ctx */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register('rolegroup', { zh, en }), 'dsh-rolegroup: dictionaries')
  // 列表行的标题取自注册项的 `label`（Plugins 页的 ItemCard 渲染 CardHead({ title: item.label })）。
  // **必须给 label**，否则那一行只有图标与描述、没有标题。官方同款写法：
  //   const t = ctx.locale.bind(NS);  label: () => t("subagentTitle")
  const t = ctx.locale.bind('rolegroup')
  // scope 面与旧 settings 作用域同形（getSnapshot/subscribe/mutate/unset），controller 逻辑零改动。
  const controller = new RolegroupCardController(ctx.configForms.get(ROLEGROUP_CLIENT_NS), ctx)
  // 门控：只有 host 真的 serve 了本命名空间才注册卡片（官方四个卡片包同款）。
  // 好处：schemastery 缺席 → host Config 为 undefined → 命名空间不被 serve → 卡片不留痕迹。
  ctx.effect(() => ctx.configForms.whileServed([ROLEGROUP_CLIENT_NS], () => ctx.slots.inject('plugins.item', async () => {
    // card.jsx 是 JSX：node 无法解析，只能在 shell 里经回调异步加载（见文件头红线注）。
    try {
      const { RolegroupCard } = await import('./card.jsx')
      return ctx.slots.register({
        name: 'plugins.item', // 0.1.7 的 Plugins 页卡片槽位（list 类，用 id 不是 key）
        id: ROLEGROUP_CLIENT_NS, // === 命名空间 ⇒ Plugins 页会顺带把 form 作为 prop 传入
        label: () => t('title'), // ← 列表行的标题；缺了它 Plugins 页那一行没有标题
        locale: 'rolegroup',
        inject: () => controller.inject(),
      }, RolegroupCard)
    } catch (err) {
      // 容错：card 加载失败不得让 shell 崩、不得以 unhandled rejection 静默消失——
      // warn 留痕后返回 undefined，本卡片缺席但 Plugins 页其余卡片不受影响。
      console.warn('[dsh-rolegroup] card 加载失败', err)
    }
  })), 'dsh-rolegroup: plugins.item card')
}
