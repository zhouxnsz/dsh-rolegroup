// `/rolegroup init` 的导出器：把**当前生效的绑定**打印成一段 JSONC，供留档 / 放进 dotfiles。
//
// ⚠️ 自 v0.11 起，`rolegroup.jsonc` **不再作为配置来源**（只保留内置表 + 面板两层）。
// 所以这里导出的是一份「快照参考」，不是可回灌的配置——回灌请用面板的「恢复官方推荐」逐行确认。
import { mergeRoles, parseRouteRef, resolveRoleRoute } from './roles.js'

/**
 * 渲染当前生效绑定。
 * @param {object} input
 * @param {Array<object>} [input.roles] 已合并的角色表（缺省 = 内置表）
 * @param {Iterable<string>|Set<string>} [input.providers] 已注册 provider（给了就标注可用性）
 * @param {(provider: string) => string[]|undefined} [input.modelsOf]
 * @param {string} [input.generatedAt]
 * @returns {string}
 */
export function renderBindingsExport({ roles, providers, modelsOf, generatedAt } = {}) {
  const list = Array.isArray(roles) ? roles : mergeRoles(undefined).roles
  const lines = [
    '{',
    '  // 由 `/rolegroup init` 导出：当前生效的角色绑定。',
    '  // 注意：rolegroup.jsonc 自 v0.11 起不再作为配置来源，本文件仅供留档/比对。',
    ...(generatedAt === undefined ? [] : [`  // 生成时间：${generatedAt}`]),
    '  "roles": {',
  ]
  const blocks = []
  for (const role of list) {
    const route = `${role.provider}/${role.model}`
    let note = ''
    if (providers !== undefined) {
      const resolved = resolveRoleRoute(role, { providers, modelsOf })
      if (!resolved.ok) note = '  // 本机不可用'
      else if (resolved.degraded) note = `  // 本机已降级为 ${resolved.role.provider}/${resolved.role.model}`
    }
    const entry = {
      provider: role.provider,
      model: role.model,
      ...(Array.isArray(role.fallbackModels) && role.fallbackModels.length > 0
        ? { fallbackModels: role.fallbackModels.filter((ref) => parseRouteRef(ref) !== undefined) }
        : {}),
    }
    blocks.push(`    ${JSON.stringify(role.toolName)}: ${JSON.stringify(entry)}${note}`)
  }
  lines.push(blocks.join(',\n'))
  lines.push('  }', '}', '')
  return lines.join('\n')
}
