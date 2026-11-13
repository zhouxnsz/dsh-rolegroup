// dsh-rolegroup doctor：纯逻辑模块（plans/rolegroup-doctor.md §2/§3）。
// 禁止 import cordis、禁止发网络请求；唯一 IO 是读本地快照文件（fs/env/homedir）。
// 路径解析必须与 lib/index.js 的 dshHome()/writeReport 同语义（H15），
// 区别仅在于 env/homedir 可注入，便于测试隔离。
import { readFile, stat } from 'node:fs/promises'
import { homedir as osHomedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_ROLES } from './roles.js'

function expandTilde(p, home) {
  if (p === '~') return home
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(home, p.slice(2))
  return p
}

/**
 * 与 lib/index.js writeReport 完全一致的落盘路径解析：
 * $DSH_HOME（空白串视为未设置，~ 展开）→ <home>/plugins/dsh-rolegroup/last-startup.json；
 * 缺省 <homedir>/.dsh/...。
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [homedir]
 * @returns {string}
 */
export function startupReportPath(env = process.env, homedir = osHomedir()) {
  const override = env?.DSH_HOME
  const home = override === undefined || override.trim() === ''
    ? join(homedir, '.dsh')
    : expandTilde(override.trim(), homedir)
  return join(home, 'plugins', 'dsh-rolegroup', 'last-startup.json')
}

/**
 * @typedef {object} NormalizedEntry
 * @property {string} toolName
 * @property {string} provider
 * @property {string} model
 *   （v0.5：`readonly` 已从快照移除；**旧快照多余的键一律忽略、不计 anomaly**——这是本次的向后兼容契约）
 *
 * @typedef {object} NormalizedReport
 * @property {string | null} time
 * @property {string | null} configSource
 * @property {string | null} configError
 * @property {number | null} configMtimeMs 恒为 null（v0.11 起没有配置文件层；字段保留以维持报告仅加性）。
 *   仅当生效来源**就是那个文件**时非 null；settings 面板接管 / 内置默认表时恒 null
 *   （写入侧 lib/index.js writeReport 已按来源把关——否则会把被整层让位的文件年龄算到面板头上）。
 * @property {NormalizedEntry[]} registered
 * @property {string[]} failed
 * @property {Array<{toolName?: string, reason?: string}>} invalid
 * @property {string[]} problems
 * @property {string[]} anomalies 归一化过程中发现的缺字段/类型问题（人话）
 */

/**
 * 归一化启动快照：容忍缺字段，绝不抛。
 * - registered 非数组 → []
 * - 条目缺 provider/model → '' 兜底，均记入 anomalies。
 *   v0.5：`readonly` 已从快照移除（红线 3 的显式例外，见 lib/index.js writeReport），
 *   故**不再**把它计入 missing 断言——否则历史快照与新版快照会被误报为异常。
 * @param {unknown} raw
 * @returns {NormalizedReport}
 */
export function normalizeReport(raw) {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const anomalies = []

  let registeredRaw = []
  if (source.registered === undefined || source.registered === null) {
    // 缺字段静默兜底为空表（空表本身是 doctor 的合法诊断对象）
  } else if (Array.isArray(source.registered)) {
    registeredRaw = source.registered
  } else {
    anomalies.push('registered 字段不是数组，已按空表处理')
  }

  const registered = registeredRaw.map((entry, index) => {
    const e = entry !== null && typeof entry === 'object' ? entry : {}
    if (entry === null || typeof entry !== 'object') {
      anomalies.push(`registered[${index}] 不是对象，已按空条目兜底`)
    }
    const missing = ['provider', 'model'].filter((k) => e[k] === undefined)
    if (missing.length > 0) {
      anomalies.push(`registered[${index}]（${typeof e.toolName === 'string' ? e.toolName : '未命名'}）缺字段：${missing.join(', ')}，已按兜底值处理`)
    }
    return {
      toolName: typeof e.toolName === 'string' ? e.toolName : '',
      provider: typeof e.provider === 'string' ? e.provider : '',
      model: typeof e.model === 'string' ? e.model : '',
      // 加性字段：内置备用档生效时记录主路由（旧快照没有这两键 → 正常）。
      ...(typeof e.primary === 'string' && e.primary !== '' ? { primary: e.primary } : {}),
      ...(e.degraded === true ? { degraded: true } : {}),
    }
  })

  return {
    // time 只保留可解析的时间串；非法 ISO 归一为 null（AC-21：不判 stale、渲染「快照时间未知」）
    time: typeof source.time === 'string' && Number.isFinite(Date.parse(source.time)) ? source.time : null,
    configSource: typeof source.configSource === 'string' ? source.configSource : null,
    configError: typeof source.configError === 'string' ? source.configError : null,
    // 加性透出（plans/startup-hardening.md §2.2）：有限 number 原样保留，缺失/null/非有限数/
    // 非 number 归一为 null；不记 anomaly——旧快照天然缺此字段，缺 ≠ 异常（RK7）
    configMtimeMs: typeof source.configMtimeMs === 'number' && Number.isFinite(source.configMtimeMs) ? source.configMtimeMs : null,
    registered,
    failed: Array.isArray(source.failed) ? source.failed.filter((f) => typeof f === 'string') : [],
    invalid: Array.isArray(source.invalid) ? source.invalid.filter((i) => i !== null && typeof i === 'object') : [],
    problems: Array.isArray(source.problems) ? source.problems.filter((p) => typeof p === 'string') : [],
    anomalies,
  }
}

/**
 * @typedef {object} ReportState
 * @property {'missing' | 'unparsable' | 'stale' | 'ok'} kind
 * 判别联合见 plans/rolegroup-doctor.md §2：
 *   { kind:'missing'; path }
 *   { kind:'unparsable'; path; reason }
 *   { kind:'stale'; path; report; ageDays }
 *   { kind:'ok'; path; report }
 * 加性扩展（不改签名、不破坏 T1–T3 既有断言）：
 *   ok/stale 另带 ageDays:number|null（time 非法/缺失 → null，AC-21）
 *   与 anomalies:string[]（快照文件级异常，目前仅 AC-22 的 mtime 改写检测）。
 */

/** stale 阈值缺省 7 天（plans/rolegroup-doctor.md §3 T4；常量化以便调方复用同一口径）。 */
export const STALE_AFTER_DAYS = 7
/** 配置年龄提示阈值：2× STALE_AFTER_DAYS（plans/startup-hardening.md §1.2 B1）。 */
export const CONFIG_AGE_HINT_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
// AC-22 容忍窗口：writeReport 先取 time 再落盘（lib/index.js:214-215），合法快照的
// mtime 必然比内容 time 晚几毫秒~几秒；无窗口则每个真实快照都误报「被改写过」。
const MTIME_GRACE_MS = 60 * 1000

/**
 * 读快照。永不抛：一律归一化为 ReportState 判别联合。
 * 语义（plans/rolegroup-doctor.md §2/§3 T4）：
 * - missing/unparsable 优先于 stale；
 * - time 比 now（可注入，缺省真实当前时间）早 > staleAfterDays（缺省 7）→ stale，带 ageDays；
 * - time 缺失/非法 ISO → 不判 stale，ok 且 ageDays:null（AC-21）；
 * - mtime(文件) 晚于 time(内容) 超过容忍窗口 → 追加 anomalies（AC-22，stat 失败静默降级）；
 * - configMtimeMs 年龄 > CONFIG_AGE_HINT_DAYS → 追加 anomalies 单行 ⚠️ 提示（与 time 的
 *   stale 判定相互独立：time 非法/缺失时照常评估；绝不进 reportIssues，不污染 unhealthy）。
 *   ⚠️ 该提示**只适用于 jsonc 文件来源**：configMtimeMs 非 null ⇔ 生效来源就是该文件，
 *   故文案里的 `${configSource}` 与日期必然同源。面板接管的 settings 层没有时间戳可用，
 *   本提示对它不生效（已知限制，不是缺陷）——不要在渲染层"补猜"。
 * @param {{ env?: NodeJS.ProcessEnv, homedir?: string, now?: Date, staleAfterDays?: number }} [opts]
 * @returns {Promise<ReportState>}
 */
export async function readStartupReport(opts = {}) {
  const path = startupReportPath(opts.env, opts.homedir)
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return { kind: 'missing', path }
  }
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { kind: 'unparsable', path, reason: `JSON 解析失败：${error?.message ?? error}` }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { kind: 'unparsable', path, reason: '快照根节点不是对象' }
  }
  const report = normalizeReport(raw)

  const parsedTime = report.time === null ? NaN : Date.parse(report.time)
  const now = opts.now ?? new Date()
  const anomalies = []
  if (Number.isFinite(parsedTime)) {
    try {
      const { mtimeMs } = await stat(path)
      if (mtimeMs > parsedTime + MTIME_GRACE_MS) {
        anomalies.push('快照文件在记录时间之后被改写过，内容与文件名不一致？')
      }
    } catch { /* stat 失败不影响主判定 */ }
  }

  // 配置年龄提示（plans/startup-hardening.md T4）：提示级 ⚠️，走 anomalies 通道，
  // 绝不进 reportIssues（RK5，不污染 unhealthy 计数）。与 time 的 stale 判定相互独立——
  // time 非法/缺失（AC-21 分支）时本提示照常评估（不依赖 time 字段）。
  if (report.configMtimeMs !== null) {
    const configAgeMs = now.getTime() - report.configMtimeMs
    if (configAgeMs > CONFIG_AGE_HINT_DAYS * DAY_MS) {
      const configAgeDays = Math.floor(configAgeMs / DAY_MS)
      const lastChanged = new Date(report.configMtimeMs).toISOString().slice(0, 10) // UTC 日历日
      anomalies.push(`当前生效配置 ${report.configSource ?? '内置默认表'} 已 ${configAgeDays} 天未修改（上次改动 ${lastChanged}）。提示：若这是对限额期的临时覆盖，别忘了回切内置默认。`)
    }
  }

  if (!Number.isFinite(parsedTime)) {
    // time 缺失/非法 ISO → 不判 stale（AC-21）
    return { kind: 'ok', path, report, ageDays: null, anomalies }
  }
  const staleAfterDays = opts.staleAfterDays ?? STALE_AFTER_DAYS
  const ageMs = now.getTime() - parsedTime
  const ageDays = Math.floor(ageMs / DAY_MS)
  if (ageMs > staleAfterDays * DAY_MS) {
    return { kind: 'stale', path, report, ageDays, anomalies }
  }
  return { kind: 'ok', path, report, ageDays, anomalies }
}

/**
 * @typedef {object} RoleVerdict 单个在册角色的确定性判定（plans/rolegroup-doctor.md §2）
 * @property {string} toolName
 * @property {string} model
 * @property {true | false | 'unknown'} providerOk
 * @property {true | false | 'unknown'} modelOk
 * @property {string[]} issues 人话诊断，空 = 健康
 * @property {string[]} hints 修复建议（≥1 条当且仅当 issues 非空）
 *
 * @typedef {object} ReportIssue 快照级异常（registered 之外：failed/invalid/problems/空表）。
 * 计划 §2 返回类型只列 { verdicts, healthy, unhealthy }，但 AC-10/AC-11 要求的
 * 「快照级独立异常」无处安放（AC-11 明确 verdicts 为 []），故作加性扩展：
 * 签名与 RoleVerdict 形状不变，返回值多出本字段，供 T3 渲染消费。
 * @property {'empty' | 'failed' | 'invalid' | 'problems'} category
 * @property {string} issue
 * @property {string} hint
 *
 * @typedef {object} MissingDefault 内置角色缺席快照的提示（T5/AC-24，加性扩展字段
 * missingDefaults）。提示级 ⚠️：缺席角色不在 registered 里无法判定健康度，且可能是
 * 有意删配置（预期）也可能被剪枝（症状）——故与 T4 anomalies 同口径，不计入 healthy/unhealthy。
 * @property {string} toolName
 * @property {string} issue
 * @property {string} hint
 *
 * @typedef {string | { error?: string, settingsNs?: string, displayName?: string }} ConfigurableInfo
 * 计划 §2 预留 configurableErrors?: ReadonlyMap<string, string>（H10 增值判据），但 AC-23 的
 * hint 需要 settingsNs 指路 GUI 设置页，纯 string 承载不了 → 值类型加性扩展为上述联合；
 * string 值保持原语义（仅 error 文本）。Map 形状与参数名不变。
 */

/**
 * Levenshtein 编辑距离（T5/AC-25 的近似模型名匹配用；纯函数，零依赖，全 DP）。
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function editDistance(a, b) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1, // 删除
        curr[j - 1] + 1, // 插入
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // 替换/匹配
      )
    }
    prev = curr
  }
  return prev[n]
}

/** 归一化 ConfigurableInfo：undefined → null；string → { error }；对象 → 摘三个字段。 */
function normalizeConfigurableInfo(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return { error: value, settingsNs: undefined, displayName: undefined }
  if (typeof value === 'object') {
    return {
      error: typeof value.error === 'string' ? value.error : undefined,
      settingsNs: typeof value.settingsNs === 'string' ? value.settingsNs : undefined,
      displayName: typeof value.displayName === 'string' ? value.displayName : undefined,
    }
  }
  return null
}

/**
 * 在广告列表里找近似模型名（AC-25）：edit-distance ≤2 或互为前缀。
 * 返回按距离升序的前 ≤2 个候选；无近似 → []。
 */
function similarModels(model, advertised) {
  if (typeof model !== 'string' || model === '') return []
  const candidates = []
  for (const m of advertised) {
    if (typeof m !== 'string' || m === '' || m === model) continue
    const d = editDistance(model, m)
    if (d <= 2 || m.startsWith(model) || model.startsWith(m)) candidates.push({ m, d })
  }
  candidates.sort((x, y) => x.d - y.d)
  return candidates.slice(0, 2).map((c) => c.m)
}

/**
 * 核心判定：对每个在册角色产出确定性 verdict（纯函数——不调 Date.now、不读 env、
 * 不发请求、无 await；所有运行时数据由调用方注入，见 plans/rolegroup-doctor.md D2/D3）。
 *
 * 计数口径：
 * - healthy   = providerOk===true && modelOk===true && issues 为空 的角色数
 *               （unknown 绝不允许计入 healthy，AC-8）
 * - unhealthy = 硬失败（providerOk/modelOk 为 false）角色数 + reportIssues 条数
 *               （unknown 只是「未校验」，不算异常，AC-8/AC-9）
 * @param {NormalizedReport} report
 * @param {{
 *   providers: readonly string[] | null,
 *   modelsOf?: (provider: string) => readonly string[] | null,
 *   configurableErrors?: ReadonlyMap<string, ConfigurableInfo>,
 * }} opts providers=null 表示 llm 服务不可用 → 全 unknown
 * @returns {{ verdicts: RoleVerdict[], reportIssues: ReportIssue[], missingDefaults: MissingDefault[], healthy: number, unhealthy: number }}
 */
export function auditRoles(report, opts) {
  const providers = opts?.providers ?? null
  const modelsOf = opts?.modelsOf
  const configurableErrors = opts?.configurableErrors
  const registered = Array.isArray(report?.registered) ? report.registered : []
  const verdicts = []
  const reportIssues = []

  for (const role of registered) {
    const issues = []
    const hints = []
    let providerOk
    let modelOk
    if (providers === null) {
      // llm 服务不可用：不允许静默显示健康（D2）
      providerOk = 'unknown'
      modelOk = 'unknown'
      issues.push('llm 服务不可用，未做运行时校验')
      hints.push('等 llm 服务可用后重跑 doctor；若主机过老不提供 llm 服务，请升级 dsh')
    } else if (providers.includes(role.provider)) {
      providerOk = true
      const models = modelsOf === undefined ? null : modelsOf(role.provider)
      if (models === null || models === undefined) {
        // 拉取失败/未取到 → 软校验降级为 unknown，绝不当成失败（与 validateRoutes 同口径）
        modelOk = 'unknown'
      } else if (models.includes(role.model)) {
        modelOk = true
      } else {
        modelOk = false
        issues.push(`模型 "${role.model}" 不在 ${role.provider} 的广告列表（候选：${models.slice(0, 5).join(', ') || '(空)'}）`)
        hints.push(`检查「设置 → 角色配置」里 ${role.toolName} 的 model 是否拼写错误，或改用上述候选模型之一`)
        // AC-25 近似模型名建议（提示级）：edit-distance ≤2 或互为前缀 → 追加「是否想用」，
        // 追加到已有 hint 上，不改变 healthy/unhealthy 计数
        const similar = similarModels(role.model, models)
        if (similar.length > 0) {
          hints.push(`是否想用 ${similar.map((m) => `"${m}"`).join(' 或 ')}？（广告列表里名字相近）`)
        }
      }
    } else {
      providerOk = false
      modelOk = 'unknown' // provider 都没了就不必查模型
      const inUse = providers.join(', ') || '(无)'
      // AC-23：不在 listProviders() 但在 listConfigurableProviders() 里 → 「路由已声明但未激活」，
      // 这是「当前未注册」的更精确版本（H10），providerOk 仍 false、角色仍计入 unhealthy。
      const configurable = normalizeConfigurableInfo(
        typeof configurableErrors?.get === 'function' ? configurableErrors.get(role.provider) : undefined,
      )
      if (configurable !== null) {
        const name = configurable.displayName ? `${configurable.displayName}（${role.provider}）` : `"${role.provider}"`
        const errorSuffix = configurable.error ? `：${configurable.error}` : '' // error 原样带上
        issues.push(`provider ${name} 路由已声明但未激活${errorSuffix}（在用：${inUse}）`)
        hints.push(configurable.settingsNs
          ? `① 到 GUI 设置页「${configurable.settingsNs}」一节补全/启用该 provider（多半是 key 缺失或额度问题），随后重载插件；② 或在「设置 → 角色配置」把 ${role.toolName} 改用已激活 provider（在用：${inUse}）`
          : `① 补全/启用 ${role.provider} 的配置（多半是 key 缺失或额度问题），随后重载插件；② 或在「设置 → 角色配置」把 ${role.toolName} 改用已激活 provider（在用：${inUse}）`)
      } else {
        issues.push(`provider "${role.provider}" 当前未注册（在用：${inUse}）`)
        // actionable 风格对齐 lib/index.js validateRoutes：带上实际在用的 provider 列表
        hints.push(`① 检查 ${role.provider} 适配器的 key/额度；② 或在「设置 → 角色配置」把 ${role.toolName} 改用已注册 provider（在用：${inUse}）`)
      }
    }
    verdicts.push({
      toolName: role.toolName,
      model: role.model,
      providerOk,
      modelOk,
      issues,
      hints,
    })
  }

  // 快照级异常：与角色 verdict 无关，各自独立一条（AC-10/AC-11）
  if (registered.length === 0) {
    reportIssues.push({
      category: 'empty',
      issue: '快照中无任何在册角色——插件可能根本没起来（未加载或注册全灭）',
      hint: '检查 dsh 启动日志确认 dsh-rolegroup 已加载；重载插件/重启 dsh web 后再跑 doctor',
    })
  }
  if (Array.isArray(report?.failed) && report.failed.length > 0) {
    reportIssues.push({
      category: 'failed',
      issue: `${report.failed.length} 个角色注册失败：${report.failed.join(', ')}`,
      hint: '翻启动日志看对应角色的注册报错（多为子代理工具不可解析），修复后重载插件',
    })
  }
  if (Array.isArray(report?.invalid) && report.invalid.length > 0) {
    const names = report.invalid.map((i) => (typeof i?.toolName === 'string' ? i.toolName : '(未命名)')).join(', ')
    reportIssues.push({
      category: 'invalid',
      issue: `${report.invalid.length} 个角色在上次启动剪枝时被移除：${names}`,
      hint: '这些角色的 provider 上次启动时未注册；检查对应 provider 配置（key/额度），或在「设置 → 角色配置」改用可用 provider',
    })
  }
  if (Array.isArray(report?.problems) && report.problems.length > 0) {
    const source = typeof report.configSource === 'string' ? report.configSource : '内置表'
    reportIssues.push({
      category: 'problems',
      issue: `配置有 ${report.problems.length} 处问题：${report.problems.join('；')}`,
      hint: `修正 ${source} 的 JSONC 语法/字段后重载插件（配置来源：${source}）`,
    })
  }

  // AC-24：内置角色缺席快照 → 提示级 missingDefaults（「静默消失」变「显式缺席」）。
  // 与 T4 anomalies 同口径：不计入 healthy/unhealthy——缺席角色不在 registered 里无法判定健康度，
  // 且可能是有意删配置（预期）也可能被剪枝（症状）。
  const inSnapshot = new Set(registered.map((r) => r.toolName))
  const missingDefaults = Object.keys(DEFAULT_ROLES)
    .filter((toolName) => !inSnapshot.has(toolName))
    .map((toolName) => ({
      toolName,
      issue: `角色 ${toolName} 未在册（可能被剪枝或配置删除）`,
      // 措辞避开「修复」二字：提示级 ⚠️ 不该触发既有 AC-15「全绿产物不含 修复」的断言口径
      hint: `若是有意移除可忽略；否则检查 ${toolName} 的 provider 是否可用（被剪枝）或配置被误删，随后重载插件/重启 dsh web`,
    }))

  const healthy = verdicts.filter((v) => v.providerOk === true && v.modelOk === true && v.issues.length === 0).length
  const unhealthy = verdicts.filter((v) => v.providerOk === false || v.modelOk === false).length + reportIssues.length
  return { verdicts, reportIssues, missingDefaults, healthy, unhealthy }
}

// ---- 渲染（plans/rolegroup-doctor.md §1 输出格式定稿）----

/** 三态符号：✅ 可用 / ❌ 不可用 / ➖ 未校验。 */
function statusSymbol(v) {
  return v === true ? '✅' : v === false ? '❌' : '➖'
}

/** 终端显示宽度：CJK/emoji 按 2 列计（padEnd 自适应对齐用）。 */
function displayWidth(s) {
  let w = 0
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
  return w
}

function padEndDisplay(s, width) {
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)))
}

const MAX_HINTS_PER_ROLE = 3 // 契约红线 4
const MAX_ANOMALY_BLOCKS = 10 // 契约红线 4：超出折叠「还有 N 条」

/**
 * 把 missing/unparsable/stale/ok + audit 渲染成单段人话纯文本（CommandResult 只有
 * 文本出口，H4）。输出结构照 plans/rolegroup-doctor.md §1「输出格式（定稿）」：
 * 表头（stale 时顶部先出 ⚠️ 提示，T4）→ 自适应列宽表格 → llm 不可用提示（如有）
 * → 异常块（❌ 诊断 + 缩进 修复：）→ 总结行。
 * 纯函数：不读 env、不发请求；missing/unparsable 时 audit 可为 undefined。
 * @param {ReportState} state
 * @param {{ verdicts: RoleVerdict[], reportIssues?: Array<{category: string, issue: string, hint: string}>, missingDefaults?: Array<{toolName: string, issue: string, hint: string}>, healthy: number, unhealthy: number }} [audit]
 * @param {{ columnWidths?: boolean }} [opts] columnWidths:false 时表格不做对齐填充
 * @returns {string}
 */
export function renderDoctorText(state, audit, opts) {
  if (state.kind === 'missing') {
    return [
      'dsh-rolegroup doctor — 无法体检',
      `未找到启动快照：${state.path}`,
      '修复：先重载 dsh-rolegroup 插件/重启 dsh web 让它完成一次启动终验（快照只在剪枝终验时写一次），再跑 /rolegroup doctor。',
    ].join('\n')
  }
  if (state.kind === 'unparsable') {
    return [
      'dsh-rolegroup doctor — 无法体检',
      `启动快照不可解析：${state.path}`,
      `原因：${state.reason}`,
      '修复：该文件由插件自动写入，损坏多半是被手工编辑过；删除它并重载插件/重启 dsh web 让其重新生成。',
    ].join('\n')
  }

  const report = state.report
  const lines = []
  lines.push(`dsh-rolegroup doctor — ${report.registered.length} 个在册角色`)
  // stale：顶部显著提示「快照 ≠ 现状」，但表格照常输出（不罢工，AC-20）
  if (state.kind === 'stale') {
    lines.push(`⚠️ 快照已 ${state.ageDays} 天未更新，可能不代表当前状态；建议重启 dsh web 后再跑 doctor`)
  }
  const ageSuffix = typeof state.ageDays === 'number' ? `（${state.ageDays} 天前）` : ''
  const timeText = report.time === null ? '快照时间未知' : `快照时间 ${report.time}${ageSuffix}`
  lines.push(`${timeText}｜配置来源 ${report.configSource ?? '(内置默认表)'}`)
  // 快照文件级异常（AC-22 mtime 改写检测）：⚠️ 提示行，不计入 unhealthy——
  // 它是快照来历的告警，不是角色/provider 的失败
  for (const anomaly of state.anomalies ?? []) lines.push(`⚠️ ${anomaly}`)
  lines.push('')

  // 表格：列宽按内容自适应（padEnd）。
  // v0.5：移除「权限」列——readonly 已废弃，只读不再由角色声明（见 lib/roles.js 头注）。
  const verdicts = audit?.verdicts ?? []
  const rows = verdicts.map((v, i) => {
    const provider = typeof report.registered[i]?.provider === 'string' ? report.registered[i].provider : ''
    return [v.toolName, `${provider}/${v.model}`, statusSymbol(v.providerOk), statusSymbol(v.modelOk)]
  })
  if (rows.length > 0) {
    const header = ['角色', '绑定模型', 'provider', '模型']
    const align = opts?.columnWidths !== false
    const widths = header.map((h, i) => Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[i]))))
    const fmt = (cells) => (align ? cells.map((c, i) => padEndDisplay(c, widths[i])).join(' ') : cells.join(' ')).trimEnd()
    lines.push(fmt(header))
    for (const row of rows) lines.push(fmt(row))
  }

  // 备用档提示：内置链自动降级时必须说清楚「现在跑的不是配置里写的那个模型」
  const degraded = (report.registered ?? []).filter((r) => r.degraded === true)
  if (degraded.length > 0) {
    lines.push('')
    for (const r of degraded) {
      const primary = typeof r.primary === 'string' ? r.primary : '(未知)'
      lines.push(`⚠️ ${r.toolName}：主路由 ${primary} 不可用，已用内置备用档 ${r.provider}/${r.model}`)
    }
    lines.push('   如需固定路由，请在「设置 → 角色配置」里改该角色的 provider/model（显式配置不做自动降级）。')
  }

  // AC-24 内置角色缺席提示：⚠️ 提示级（同 T4 anomalies 口径，不计入 unhealthy、不出 ❌ 块）
  const missingDefaults = audit?.missingDefaults ?? []
  if (missingDefaults.length > 0) {
    lines.push('')
    for (const m of missingDefaults) {
      lines.push(`⚠️ ${m.issue}`)
      if (typeof m.hint === 'string' && m.hint !== '') lines.push(`   提示：${m.hint}`)
    }
  }

  // llm 服务不可用：不明示就是静默显示健康（D2 禁止）——提示行而非异常块（unknown ≠ 异常，AC-8）
  if (verdicts.some((v) => v.issues.some((i) => i.includes('未做运行时校验')))) {
    lines.push('')
    lines.push('⚠️ llm 服务不可用，provider/模型列未做运行时校验（➖），以上仅为上次启动快照内容。')
  }

  // 异常块：硬失败角色（providerOk/modelOk === false）+ 快照级异常（T2 reportIssues）
  const blocks = []
  for (const v of verdicts) {
    if (v.providerOk !== false && v.modelOk !== false) continue
    blocks.push([
      `❌ ${v.toolName}：${v.issues.join('；')}`,
      ...v.hints.slice(0, MAX_HINTS_PER_ROLE).map((h) => `   修复：${h}`),
    ])
  }
  for (const r of audit?.reportIssues ?? []) {
    blocks.push([`❌ ${r.issue}`, `   修复：${r.hint}`])
  }
  if (blocks.length > 0) {
    lines.push('')
    for (const block of blocks.slice(0, MAX_ANOMALY_BLOCKS)) lines.push(...block)
    if (blocks.length > MAX_ANOMALY_BLOCKS) lines.push(`…还有 ${blocks.length - MAX_ANOMALY_BLOCKS} 条异常未展开。`)
  }

  lines.push('')
  lines.push(blocks.length === 0 ? '✅ 无异常' : `✅ 除上述 ${audit?.unhealthy ?? blocks.length} 项外无异常。`)
  return lines.join('\n')
}
