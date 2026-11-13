// dsh-rolegroup client 半入口（v0.4 迁移：plans/v0.4-settings-migration.md T5 / D7）。
// 本文件经 scripts/build-client.mjs（esbuild）打成 lib/client.js（§0 wrapper 形状），产物提交入库。
//
// 自 dsh 0.1.7-rc.2 起，client 侧 settings 扩展点改名（旧名全树已不存在）：
//   旧 settings 作用域服务 → **`configForms`**；旧逐插件卡片槽位 → 由 `settings.section` 取代；
//   旧「host 已 serve ∩ card 已注册」隐式分发 → `configForms.whileServed([ns], register)` 显式门控。
// 官方同款样板：$NM/dsh-client-ui-settings-subagent/lib/client.js:803-846（卡片版）、
//              $NM/dsh-client-ui-settings-models/lib/client.js（settings.section 版）。
//
// node 可导入性红线：tests 会 import 本模块并直接调用 apply，而 node 解析不了 JSX——
// 故 card.jsx 只能经**动态 import** 藏在 inject 回调内加载（node 测试不触发该回调）。
//
// 命名空间常量**就地写死**：client 包不得依赖 host 包（官方注释明说），
// 值必须与 host 侧条目 id / 命名空间逐字一致。

import { RolegroupCardController } from './controller.js'
import { installSettingsNavIcon } from './settings-nav-icon.js'
import { zh, en } from './locales.js'

/** settings 命名空间 === host Loader 条目 id（`lib/config.js` 的 ROLEGROUP_ENTRY_ID）。 */
const ROLEGROUP_CLIENT_NS = 'dsh-rolegroup'

// inject 是**服务名**（cordis fiber 级）——包名图边在 package.json 的 `dsh.client.inject` 里，两者语义不同。
// remote.session 供 controller 拉 modelCatalog；configForms 是 0.1.7 的 settings 客户端基线服务。
export const inject = ['slots', 'locale', 'remote', 'remote.session', 'configForms']

/** @param {any} ctx client 侧 cordis ctx */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register('rolegroup', { zh, en }), 'dsh-rolegroup: dictionaries')
  // 导航条目名与节内标题都取自词典（注册项的 `label` 是设置页左侧导航显示的名字）。
  const t = ctx.locale.bind('rolegroup')
  // Settings-shell nav glyph: the slot has no icon option, so this is a scoped
  // CSS decoration that falls back to the shell's gear when unsupported.
  ctx.effect(() => installSettingsNavIcon(() => t('title')), 'dsh-rolegroup: settings nav icon')
  // scope 面与旧 settings 作用域同形（getSnapshot/subscribe/mutate/unset），controller 逻辑零改动。
  const controller = new RolegroupCardController(ctx.configForms.get(ROLEGROUP_CLIENT_NS), ctx)
  // 注册为**设置页的一个 section**（`settings.section`；官方 models / agent-presets、第三方皮肤中心 / PET 同款），
  // 而**不是**插件页的 `plugins.item` 卡片。2026-10-15 用户拍板，理由两条：
  //   ① 角色表是**功能级配置**，放设置页（有自己的导航项）比塞进插件列表更像它该在的地方；
  //   ② Plugins 页会把**所有** `plugins.item` 卡片无条件追加进「官方」组，而本插件**不是**官方插件
  //      （host 侧判据是 `installed = 在 profile dependencies 里`、`optional = 在硬编码的 OPTIONAL_BUNDLES 里`，
  //      两个我们都不满足）—— 撤掉卡片，我们就不再出现在那一组，**与装法无关**。
  // 门控：只有 host 真的 serve 了本命名空间才注册（schemastery 缺席 → Config 为 undefined →
  // 命名空间不被 serve → 本节不留痕迹）。
  ctx.effect(() => ctx.configForms.whileServed([ROLEGROUP_CLIENT_NS], () => ctx.slots.inject('settings.section', async () => {
    // card.jsx 是 JSX：node 无法解析，只能在 shell 里经回调异步加载（见文件头红线注）。
    try {
      const { RolegroupCard } = await import('./card.jsx')
      return ctx.slots.register({
        name: 'settings.section',
        id: 'rolegroup',
        order: 30, // 紧随 agent-presets(20)，排在第三方功能区(110+)之前
        label: () => t('title'), // ← 设置页导航条目名；缺了它这一节没有名字
        locale: 'rolegroup',
        inject: () => controller.inject(),
      }, RolegroupCard)
    } catch (err) {
      // 容错：card 加载失败不得让 shell 崩、不得以 unhandled rejection 静默消失——
      // warn 留痕后返回 undefined，本节缺席但设置页其余部分不受影响。
      console.warn('[dsh-rolegroup] card 加载失败', err)
    }
  })), 'dsh-rolegroup: settings.section')
}
