// dsh-rolegroup: 角色 Agent Preset 的纯函数构建（plans/v0.6-dsh-0.2.1-migration.md §4.1）。
//
// 背景（为什么是"克隆"）：dsh 0.2.1 起 `@deepseek-ai/dsh-tool-subagent` 拒绝 `persona`/`toolFilter`/
// `backgroundMode`（出现即 throw，见上游 lib/index.js:355），persona 只能由 Agent Preset 承载；
// 而显式 `agentPreset` 是**替换**父会话组合（`dsh-subagent/lib/index.js:373-383`）而非叠加。
// 因此角色 preset = 克隆 deployment 默认 preset 的完整 rows（保住 fs/bash/web/指令等能力），
// 只替换 persona 行、剔除 delegation 组（角色子会话不可再委派）。
//
// 两条不可动摇的实现约束：
//   1. `!!js` 表达式在 loader 里已是 class 实例（JsExpr），**必须按引用保留**——JSON 深拷会破坏它；
//   2. 纯函数：零 cordis / 零 fs 依赖，可离线单测。
//
// @module dsh-rolegroup/presets

/** 自动生成 preset 的 id 前缀（用户可辨识、降低与自建 preset 撞名）。 */
export const PRESET_ID_PREFIX = 'rolegroup-'

/** persona 行的插件名（0.2.1 里 persona 只能是 preset 内的一行）。 */
export const PERSONA_PLUGIN = '@deepseek-ai/dsh-persona'

/** 需要从角色 preset 中剔除的组：角色子会话不可再委派（比 v0.5 更严格，修 own-layer 泄漏）。 */
export const DELEGATION_GROUP_ID = 'delegation'

const isPlainObject = (value) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null // class 实例（JsExpr 等）不算纯对象 → 按引用保留
}

/** 角色 preset 的 id（`rolegroup-<toolName>`）。 */
export const presetIdOf = (toolName) => `${PRESET_ID_PREFIX}${toolName}`

/** 「设置 → Agent 预设」里展示的名字。 */
export const presetDisplayName = (toolName, model) => (model ? `角色：${toolName} · ${model}` : `角色：${toolName}`)

/**
 * 深拷 entry 列表：数组/纯对象递归复制，其它值（**JsExpr 等 class 实例**）保持引用。
 * @param {unknown} value
 * @returns {unknown}
 */
export function cloneEntryList(value) {
  if (Array.isArray(value)) return value.map(cloneEntryList)
  if (isPlainObject(value)) {
    const out = {}
    for (const [key, child] of Object.entries(value)) {
      out[key] = Array.isArray(child) || isPlainObject(child) ? cloneEntryList(child) : child
    }
    return out
  }
  return value
}

const isPersonaRow = (row) => isPlainObject(row) && (row.id === 'persona' || row.name === PERSONA_PLUGIN)

/**
 * 默认 preset rows → 角色 preset rows：替换 persona 前缀、剔除 delegation 组。
 * baseRows 非法/为空时 throw（由调用方转成该角色的 failed[]）。
 * @param {unknown} baseRows deployment 默认 preset 的 plugins
 * @param {{ persona?: string }} role
 * @returns {object[]}
 */
export function buildRolePresetRows(baseRows, role) {
  if (!Array.isArray(baseRows) || baseRows.length === 0) {
    throw new Error('base preset 的 plugins 为空或非法，无法构建角色 preset')
  }
  const rows = cloneEntryList(baseRows).filter((row) => row?.id !== DELEGATION_GROUP_ID)
  const persona = typeof role?.persona === 'string' ? role.persona : ''
  let patched = false
  for (const row of rows) {
    if (!isPersonaRow(row)) continue
    // 保留 base 行其它字段（suffix/complete 等），只换 prefix——与 0.2.0 的子会话 persona 注入同 section
    row.config = { ...(row.config ?? {}), prefix: persona }
    patched = true
  }
  if (!patched) rows.unshift({ id: 'persona', name: PERSONA_PLUGIN, config: { prefix: persona } })
  return rows
}

/**
 * 构建完整 PresetDefinition（喂给 `ctx.agentPresets.register`）。
 * @param {unknown} baseRows deployment 默认 preset 的 plugins
 * @param {{ toolName: string, persona?: string, summary?: string }} role
 * @param {number} index 角色在生效表中的序号（决定 order，稳定排序）
 * @returns {{ id: string, name: string, description: string, order: number, plugins: object[] }}
 */
export function buildPresetDefinition(baseRows, role, index) {
  const route = typeof role.provider === 'string' && typeof role.model === 'string'
    ? `${role.provider}/${role.model}`
    : undefined
  const summary = typeof role.summary === 'string' ? role.summary : undefined
  return {
    id: presetIdOf(role.toolName),
    name: presetDisplayName(role.toolName, role.model),
    description: [summary, route].filter(Boolean).join(' · ') || '自动生成的角色预设',
    order: 200 + index,
    plugins: buildRolePresetRows(baseRows, role),
  }
}
