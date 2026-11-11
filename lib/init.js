// /rolegroup init 的纯逻辑：按「当前机器上真实可用的路由」生成给用户的一份起始 rolegroup.jsonc。
//
// 设计口径（与 README §4 一致）：
//   - 只覆盖**主路由不可用**的角色；其余角色继续走内置表（并列进配置，避免把用户的表锁死）；
//   - 覆盖项写**显式** provider/model（显式配置不自动降级，这是刻意语义），并把内置链的后续档位
//     作为 fallbackModels 一起写入，保留韧性；
//   - 没有任何可用路由的角色不写条目，只留一行注释（写了空 provider 会让 mergeRoles 整条跳过）。
//
// 本模块不碰 cordis / 网络：availability 由调用方（lib/command.js）从 llm 服务取。
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir as osHomedir } from 'node:os'
import { dirname, join } from 'node:path'
import { mergeRoles, parseRouteRef, resolveRoleRoute } from './roles.js'
import { parseJsonc } from './jsonc.js'

function expandTilde(p, home) {
  if (p === '~') return home
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(home, p.slice(2))
  return p
}

/**
 * 用户级配置文件路径（与 lib/index.js 的 dshHome() 同语义，但 env/homedir 可注入以便测试）。
 * @param {object} [env]
 * @param {string} [homedir]
 * @returns {string}
 */
export function rolegroupFilePath(env = process.env, homedir = osHomedir()) {
  const override = env?.DSH_HOME
  const home = override === undefined || override.trim() === ''
    ? join(homedir, '.dsh')
    : expandTilde(override.trim(), homedir)
  return join(home, 'rolegroup.jsonc')
}

/**
 * 项目级配置文件路径（与 lib/index.js 的 loadRoleConfig 首选候选一致）。
 * @param {string} [cwd]
 * @returns {string}
 */
export function projectRolegroupFilePath(cwd = process.cwd()) {
  return join(cwd, '.dsh', 'rolegroup.jsonc')
}

/**
 * 覆盖前备份现有配置：`<path>.bak-<时间戳>`。
 * @param {string} path 目标配置路径
 * @param {string} [timestamp] 可注入的稳定时间戳（测试用）；缺省 ISO 时间去冒号
 * @returns {Promise<string | undefined>} 备份路径；文件不存在或失败返回 undefined
 */
export async function backupExistingConfig(path, timestamp) {
  const stamp = (timestamp ?? new Date().toISOString()).replace(/[:.]/gu, '-')
  const backup = `${path}.bak-${stamp}`
  try {
    await copyFile(path, backup)
    return backup
  } catch {
    return undefined
  }
}

/**
 * 比较「已有配置文件」与「本次将写入的角色集合」，给 `--diff` 用。
 * 生成的文件是整份替换，因此只会丢角色或改角色，不会保留文件里的其它内容。
 * @param {string | undefined} existingText 现有文件原文（不存在传 undefined）
 * @param {Array<{toolName: string}>} entries 本次将写入的角色
 * @returns {{ exists: boolean, replaced: string[], dropped: string[], unparsable?: boolean }}
 */
export function summarizeOverwrite(existingText, entries) {
  if (existingText === undefined || existingText === null) return { exists: false, replaced: [], dropped: [] }
  let roles
  try {
    const parsed = parseJsonc(existingText)
    roles = parsed !== null && typeof parsed === 'object' && parsed.roles !== null && typeof parsed.roles === 'object'
      ? Object.keys(parsed.roles)
      : []
  } catch {
    return { exists: true, replaced: [], dropped: [], unparsable: true }
  }
  const next = new Set((entries ?? []).map((entry) => entry.toolName))
  const replaced = roles.filter((name) => next.has(name))
  const dropped = roles.filter((name) => !next.has(name))
  return { exists: true, replaced, dropped }
}

/** 生成 JSONC 里单个角色块（`{` 与 key 同行，字段缩进 6）。 */
function renderEntry(entry) {
  const lines = ['{']
  lines.push(`      "provider": ${JSON.stringify(entry.provider)},`)
  lines.push(`      "model": ${JSON.stringify(entry.model)}${entry.fallbackModels !== undefined && entry.fallbackModels.length > 0 ? ',' : ''}`)
  if (entry.fallbackModels !== undefined && entry.fallbackModels.length > 0) {
    lines.push(`      "fallbackModels": [${entry.fallbackModels.map((ref) => JSON.stringify(ref)).join(', ')}]`)
  }
  lines.push('    }')
  return lines.join('\n')
}

/**
 * 计算 init 计划：哪些角色需要显式覆盖、覆盖成什么、以及可直接落盘的 JSONC 文本。
 *
 * @param {object} input
 * @param {Array<object>} input.roles 合并后的角色表（通常来自 mergeRoles(undefined)）
 * @param {Iterable<string>|Set<string>} input.providers 已注册 provider id
 * @param {(provider: string) => string[]|undefined} input.modelsOf 广告模型列表（未知返回 undefined）
 * @param {string} [input.generatedAt] 注释里的日期（缺省不写日期，便于测试稳定）
 * @returns {{
 *   needsFile: boolean,
 *   entries: Array<{toolName: string, provider: string, model: string, fallbackModels?: string[], primary: string, degraded: boolean}>,
 *   unresolved: Array<{toolName: string, primary: string, tried: string[]}>,
 *   text: string,
 * }}
 */
export function buildInitPlan({ roles, providers, modelsOf, generatedAt }) {
  const entries = []
  const unresolved = []
  for (const role of roles ?? []) {
    const resolved = resolveRoleRoute(role, { providers, modelsOf })
    if (!resolved.ok) {
      unresolved.push({
        toolName: role.toolName,
        primary: `${role.provider}/${role.model}`,
        tried: resolved.tried.map((t) => (t.reason === 'provider' ? `${t.route}（provider 未注册）` : `${t.route}（模型不在广告列表）`)),
      })
      continue
    }
    if (!resolved.degraded) continue // 主路由可用 → 无需写进配置
    // 已选中的档位之后的剩余链，作为新主路由的备用档
    const chain = role.fallbackModels ?? []
    const rest = chain.slice(resolved.index)
    const fallbackModels = rest
      .map((ref) => parseRouteRef(ref))
      .filter((parsed) => parsed !== undefined)
      .map((parsed) => `${parsed.provider}/${parsed.model}`)
    entries.push({
      toolName: role.toolName,
      provider: resolved.role.provider,
      model: resolved.role.model,
      ...(fallbackModels.length > 0 ? { fallbackModels } : {}),
      primary: resolved.primary,
      degraded: true,
    })
  }

  const needsFile = entries.length > 0
  const header = [
    '{',
    '  // 由 `/rolegroup init` 生成：只覆盖在**本机**主路由不可用的角色，其余角色继续走内置表。',
    '  // 显式配置不会自动降级；需要韧性时保留各角色的 fallbackModels。',
    ...(generatedAt === undefined ? [] : [`  // 生成时间：${generatedAt}`]),
    '  "roles": {',
  ]
  const blocks = []
  for (const entry of entries) {
    const comment = entry.degraded
      ? `    // 主路由 ${entry.primary} 在本机不可用，改用 ${entry.provider}/${entry.model}`
      : `    // 主路由 ${entry.primary}`
    blocks.push(`${comment}\n    ${JSON.stringify(entry.toolName)}: ${renderEntry(entry)}`)
  }
  const unresolvedLines = unresolved.map((item) => `    // ⚠️ ${item.toolName}：没有可用路由（尝试过 ${item.tried.join(' → ') || '(无)'}），请手动填写 provider/model`)
  const body = [...blocks, ...unresolvedLines]
  const text = [...header, ...(body.length > 0 ? [body.join(',\n')] : []), '  }', '}', ''].join('\n')

  return { needsFile, entries, unresolved, text }
}

/**
 * 落盘起始配置。默认**不覆盖**已存在的文件（用户已有配置时不该被悄悄改写）。
 * @param {string} path
 * @param {string} text
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<{ written: boolean, reason?: 'exists' | 'error', error?: Error }>}
 */
export async function writeInitConfig(path, text, options = {}) {
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text, { encoding: 'utf8', flag: options.force === true ? 'w' : 'wx' })
    return { written: true }
  } catch (error) {
    if (error?.code === 'EEXIST') return { written: false, reason: 'exists' }
    return { written: false, reason: 'error', error }
  }
}

/**
 * 便捷入口：从内置表 + 可用性直接算计划（command 层用；测试也能直接调）。
 * @param {{ providers: Iterable<string>|Set<string>, modelsOf: (p: string) => string[]|undefined, generatedAt?: string }} availability
 */
export function buildInitPlanFromBuiltins(availability) {
  const { roles } = mergeRoles(undefined)
  return buildInitPlan({ roles, ...availability })
}
