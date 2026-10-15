// dsh-rolegroup: 角色表 ↔ settings section 双向映射 + 跨字段校验（纯函数，零 cordis/schemastery 依赖）。
// 契约见 plans/v0.3-gui-panel.md §2.1 / D5：section = { roles: SectionRole[] }（数组——保序渲染、
// 增删行自然、mutate 单路径整写；与官方 SubagentModelSelectionCard 同构）。
// @module dsh-rolegroup/settings-table
import { TOOL_NAME_RE, readonlyDeprecationProblem } from './roles.js'

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 生效角色表（mergeRoles + persona 解析后）→ settings section（测试 fixture 与面板读值）。
 * 约定：persona/summary/reasoningEffort 有值才写（内置角色这三项恒有值，故 7 行都会带）；custom 是派生标记，不入 section。
 * v0.5：`readonly` 已移除（不再收窄工具面；理由见 lib/roles.js 头注）。
 * @param {Array<object>} roles
 * @returns {{ roles: Array<object> }}
 */
export function rolesToSection(roles) {
  const list = Array.isArray(roles) ? roles : []
  return {
    roles: list.filter(isPlainObject).map((role) => ({
      toolName: role.toolName,
      provider: role.provider,
      model: role.model,
      ...(typeof role.reasoningEffort === 'string' ? { reasoningEffort: role.reasoningEffort } : {}),
      ...(typeof role.persona === 'string' ? { persona: role.persona } : {}),
      ...(typeof role.summary === 'string' ? { summary: role.summary } : {}),
    })),
  }
}

/**
 * settings 解析值 → mergeRoles 入参形状（{roles:{name:{...}}}），喂回同一条合并管线（D1：
 * 不另造第二份合并逻辑，persona 缺省回落内置等规则全部由 mergeRoles 复用）。
 * 非法输入返回 {roles:{}}，不抛。
 * @param {unknown} section
 * @returns {{ roles: Record<string, object> }}
 */
export function sectionToFileConfig(section) {
  const roles = {}
  const list = isPlainObject(section) && Array.isArray(section.roles) ? section.roles : []
  for (const item of list) {
    if (!isPlainObject(item) || typeof item.toolName !== 'string') continue
    roles[item.toolName] = {
      ...(typeof item.provider === 'string' ? { provider: item.provider } : {}),
      ...(typeof item.model === 'string' ? { model: item.model } : {}),
      ...(typeof item.reasoningEffort === 'string' ? { reasoningEffort: item.reasoningEffort } : {}),
      ...(typeof item.persona === 'string' ? { persona: item.persona } : {}),
      ...(typeof item.summary === 'string' ? { summary: item.summary } : {}),
    }
  }
  return { roles }
}

/**
 * 收集 section 里的**遗留字段**问题（v0.5：`readonly` 已移除）。
 * 单独导出是因为 **settings 接管路径**会经 `sectionToFileConfig` 的白名单投影，
 * 遗留键在那里会被丢掉，`mergeRoles` 再也看不到 → 收口审查 B-1 的"静默失效"。
 * 故 settings 路径必须**在投影之前**调用本函数拿提示。
 * @param {unknown} section
 * @returns {string[]} 人话问题清单（空 = 无遗留字段）
 */
export function legacyFieldProblems(section) {
  const list = isPlainObject(section) && Array.isArray(section.roles) ? section.roles : []
  const problems = []
  for (const item of list) {
    if (!isPlainObject(item)) continue
    const name = typeof item.toolName === 'string' && item.toolName !== '' ? item.toolName : '(未命名)'
    if (item.readonly !== undefined) {
      problems.push(readonlyDeprecationProblem(name))
    }
  }
  return problems
}

/**
 * 跨字段校验（纯函数；v0.4 起 host 侧已无 validate 钩子，本函数由面板/测试复用）。
 * 返回人话问题清单，空数组 = 合法。
 * @param {unknown} section
 * @returns {string[]}
 */
export function validateSectionProblems(section) {
  if (!isPlainObject(section)) {
    return ['配置段必须是对象（形如 {"roles": [...]}）']
  }
  if (section.roles === undefined || section.roles === null) {
    return [] // 缺省 = 空表（schema 层 z.array(...).default([]) 会补齐）
  }
  if (!Array.isArray(section.roles)) {
    return ['配置字段 "roles" 必须是数组（每行一个角色）']
  }
  const problems = []
  const seen = new Set()
  section.roles.forEach((item, index) => {
    const where = `roles[${index}]`
    if (!isPlainObject(item)) {
      problems.push(`${where} 必须是对象（角色行）`)
      return
    }
    const name = typeof item.toolName === 'string' && item.toolName !== '' ? item.toolName : where
    if (typeof item.toolName !== 'string' || item.toolName.trim() === '') {
      problems.push(`${where} 缺少 toolName（字符串）`)
    } else if (!TOOL_NAME_RE.test(item.toolName)) {
      problems.push(`角色 "${item.toolName}" 的 toolName 非法：须匹配 ${TOOL_NAME_RE}（小写字母开头，小写字母/数字/下划线）`)
    } else if (seen.has(item.toolName)) {
      problems.push(`角色 "${item.toolName}" 的 toolName 重复：每个角色必须唯一`)
    } else {
      seen.add(item.toolName)
    }
    if (typeof item.provider !== 'string' || item.provider.trim() === '') {
      problems.push(`角色 "${name}" 的 provider 缺失或为空白`)
    }
    if (typeof item.model !== 'string' || item.model.trim() === '') {
      problems.push(`角色 "${name}" 的 model 缺失或为空白`)
    }
    if (item.readonly !== undefined) {
      // v0.5：readonly 已移除。文案与 legacyFieldProblems / mergeRoles **同一个函数**产出。
      problems.push(readonlyDeprecationProblem(name))
    }
    if (item.reasoningEffort !== undefined && typeof item.reasoningEffort !== 'string') {
      problems.push(`角色 "${name}" 的 reasoningEffort 必须是字符串`)
    }
  })
  return problems
}

// 规范化比较只认这些字段（与 SectionRole 形状一致）；undefined 归一为 null 防键位漂移。
const SECTION_FIELDS = ['toolName', 'provider', 'model', 'reasoningEffort', 'persona', 'summary']

function canonical(section) {
  const list = isPlainObject(section) && Array.isArray(section.roles) ? section.roles : []
  const items = list.filter(isPlainObject).map((item) => {
    const normalized = {}
    for (const field of SECTION_FIELDS) normalized[field] = item[field] ?? null
    return normalized
  })
  items.sort((x, y) => String(x.toolName).localeCompare(String(y.toolName)))
  return JSON.stringify(items)
}

/**
 * 顺序无关比较两个 section（按 toolName 排序后取规范化字段深比）。watch 防抖短路用。
 * @param {unknown} a @param {unknown} b
 * @returns {boolean}
 */
export function sameSection(a, b) {
  return canonical(a) === canonical(b)
}
