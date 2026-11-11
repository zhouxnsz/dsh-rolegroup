// dsh-rolegroup 命令面适配器：/rolegroup doctor（plans/rolegroup-doctor.md §2/§3 T3）。
// 本特性唯一碰 cordis 的文件：注册命令、解析子命令、调 llm 取数、把 invocation.signal 传下去；
// 判定与渲染全部委托 lib/doctor.js（纯函数，离线可测）。
//
// 契约红线（plans §2）：
//   1. installRolegroupCommands 不得抛——commands 服务缺失时只 log.warn 跳过（AC-17）；
//      注册时机双通道（2026-09-23 实证修订）：apply 时 ctx.get('commands') 的 strict
//      模式只返回「提供方 fiber 已激活」的实现，dsh-commands 晚于本插件就绪时得到
//      undefined——命令静默缺席（今晚上班的 bug）。故：已激活则立即注册；否则
//      ctx.inject(['commands'], cb) 非门控子插件等它就绪（父 apply 不依赖它，
//      profile 禁用 commands 时最坏只是 doctor 缺席，Q3/RK4 结论不变）。
//   2. handler 不得抛——一切 IO 失败归一化为 kind:'error' 结果文本。
//   3. 尊重 invocation.signal：aborted 时立刻返回，不再发起 listModels 调用。
//   4. 单角色 hint ≤3 条、异常 >10 条折叠（渲染层 enforce，见 doctor.js）。
import { readFile } from 'node:fs/promises'
import { auditRoles, readStartupReport, renderDoctorText } from './doctor.js'
import { backupExistingConfig, buildInitPlanFromBuiltins, projectRolegroupFilePath, rolegroupFilePath, summarizeOverwrite, writeInitConfig } from './init.js'

const COMMAND_NAME = 'rolegroup'
const COMMAND_DESCRIPTION = '角色表体检与初始化：doctor 报告绑定模型/provider 可用性，init 按本机可用路由生成起始配置'
const USAGE = [
  '用法：/rolegroup <子命令>',
  '  doctor            角色表体检（读上次启动快照，比对当前 provider/模型可用性并给修复建议）',
  '  init              打印一份「主路由在本机不可用」的角色覆盖配置（不落盘）',
  '  init --write      写入用户级 rolegroup.jsonc（已存在则拒绝；面板接管/项目文件存在时拒绝）',
  '  init --project    写入项目级 .dsh/rolegroup.jsonc（配合 --write）',
  '  init --diff       显示已有文件中哪些角色会被覆盖/丢失（配合 --write 的预演）',
  '  init --force      允许覆盖已存在的配置（会先备份 .bak-<时间戳>）',
  '  --help            显示本帮助',
].join('\n')

/**
 * 自解析子命令（宿主只认注册名，子命令是插件自己的语法责任，H5）。
 * 不做前缀模糊匹配（'docto' → unknown，避免误触发，AC-16）。
 * @param {string} rawInput 命令名之后逐字保留的文本
 * @returns {{ kind: 'doctor' } | { kind: 'usage' } | { kind: 'unknown', sub: string }}
 */
export function parseRolegroupCommand(rawInput) {
  const trimmed = (rawInput ?? '').trim()
  if (trimmed === '') return { kind: 'usage' }
  const sub = trimmed.split(/\s+/u)[0]
  if (sub === '--help' || sub === '-h' || sub === 'help') return { kind: 'usage' }
  if (sub === 'doctor') return { kind: 'doctor' }
  if (sub === 'init') {
    let write = false
    let force = false
    let project = false
    let diff = false
    for (const flag of trimmed.split(/\s+/u).slice(1)) {
      if (flag === '--write') write = true
      else if (flag === '--force') force = true
      else if (flag === '--project') project = true
      else if (flag === '--diff') diff = true
      else return { kind: 'unknown', sub: `init ${flag}` }
    }
    return { kind: 'init', write, force, project, diff }
  }
  return { kind: 'unknown', sub }
}

function warn(ctx, message) {
  try { ctx.logger?.warn?.(message) } catch { /* 日志都不可用时静默 */ }
}

/**
 * 注册 /rolegroup 命令。永不抛（红线 1）：
 * - 双通道时机（见文件头红线 1）：已激活立即注册，否则 ctx.inject 子插件待就绪；
 * - commands 服务始终不可得（老主机/profile 禁用）→ warn 跳过，其余功能照常；
 * - 同名命令已被占用 → warn 放弃，不抢占（RK1，scoped shadow 会互相遮蔽，H11）；
 * - 注册包在 ctx.effect 里以便生命周期回收（H12）。
 * @param {object} ctx cordis Context（本插件对 host 只软取服务，不 import cordis）
 */
export function installRolegroupCommands(ctx, options = {}) {
  let done = false
  const tryRegister = (cctx, commands) => {
    if (done) return // 立即通道与 inject 通道理论上只其一触发，防御双触发
    done = true
    registerCommand(cctx, commands, options)
  }

  let immediate
  try { immediate = ctx.get?.('commands') } catch { immediate = undefined }
  if (immediate !== undefined && immediate !== null && typeof immediate.register === 'function') {
    tryRegister(ctx, immediate)
    return
  }

  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['commands'], (cctx) => {
        try {
          tryRegister(cctx, cctx.commands)
        } catch (error) {
          warn(ctx, `dsh-rolegroup: /rolegroup 命令注册失败：${error?.message ?? error}；其余功能不受影响`)
        }
      })
      return
    } catch { /* inject 不可用时落到 warn */ }
  }
  warn(ctx, 'dsh-rolegroup: commands 服务不可用（老主机或 profile 禁用了 commands），跳过 /rolegroup 命令注册；角色委派等其余功能不受影响')
}

/** 实际注册逻辑（两个时机通道共用）。commands 为已确认可用的服务实例。 */
function registerCommand(cctx, commands, options = {}) {
  // RK1：注册前查重
  try {
    const existing = commands.list?.(undefined) ?? []
    if (existing.some((c) => c?.name === COMMAND_NAME)) {
      warn(cctx, `dsh-rolegroup: 全局命令 "/${COMMAND_NAME}" 已被占用，放弃注册（doctor 不可用，其余功能不受影响）`)
      return
    }
  } catch { /* list 不可用时照常注册，冲突由宿主裁决 */ }

  const definition = {
    name: COMMAND_NAME,
    description: COMMAND_DESCRIPTION,
    input: { hint: '[doctor|init]' }, // 不设 attachments：默认拒绝附件（AC-18）
    handler: (invocation) => handleInvocation(cctx, invocation, options),
  }
  try {
    if (typeof cctx.effect === 'function') cctx.effect(() => commands.register(definition), 'dsh-rolegroup: command')
    else commands.register(definition)
  } catch (error) {
    warn(cctx, `dsh-rolegroup: /rolegroup 命令注册失败：${error?.message ?? error}；其余功能不受影响`)
  }
}

/** 命令 handler。永不抛（红线 2）：一切失败归一化为 kind:'error' 结果文本。 */
async function handleInvocation(ctx, invocation, options = {}) {
  try {
    const parsed = parseRolegroupCommand(invocation?.rawInput ?? '')
    if (parsed.kind === 'usage') return { kind: 'success', text: USAGE }
    if (parsed.kind === 'unknown') return { kind: 'error', text: `未知子命令 "${parsed.sub}"。\n\n${USAGE}` }
    if (parsed.kind === 'init') return await executeInit(ctx, parsed, invocation?.signal, options?.describeLayer)
    return await executeDoctor(ctx, invocation?.signal)
  } catch (error) {
    return { kind: 'error', text: `dsh-rolegroup doctor 执行失败：${error?.message ?? error}` }
  }
}

/**
 * `/rolegroup init`：探测本机可用路由 → 生成起始配置 → 打印或落盘。
 * 永不抛（红线 2）；尊重 signal（红线 3）。
 */
async function executeInit(ctx, parsed, signal, describeLayer) {
  if (signal?.aborted) return { kind: 'error', text: 'dsh-rolegroup init：已取消（signal 已中止）' }
  let llm
  try { llm = ctx.get?.('llm') } catch { llm = undefined }
  if (llm === undefined || llm === null) {
    return { kind: 'error', text: 'dsh-rolegroup init：llm 服务不可用，无法探测可用路由。请在 dsh 会话里执行。' }
  }
  let providers
  try {
    providers = llm.listProviders().map((p) => p.id)
  } catch (error) {
    return { kind: 'error', text: `dsh-rolegroup init：读取 provider 列表失败：${error?.message ?? error}` }
  }
  const modelsOf = async (providerId) => {
    try {
      const models = await llm.listModels(providerId)
      return Array.isArray(models) ? models.map((m) => m.id) : undefined
    } catch {
      return undefined // 列表拉不到 → 不做模型名校验（与启动校验同口径）
    }
  }
  const modelCache = new Map()
  for (const providerId of providers) {
    if (signal?.aborted) return { kind: 'error', text: 'dsh-rolegroup init：已取消（signal 已中止）' }
    modelCache.set(providerId, await modelsOf(providerId))
  }
  const plan = buildInitPlanFromBuiltins({
    providers,
    modelsOf: (providerId) => modelCache.get(providerId),
    generatedAt: new Date().toISOString().slice(0, 10),
  })
  // 生效层：面板接管 / 项目 jsonc / 用户 jsonc / 内置表。写错层等于白写，所以在最前面说明。
  const layer = typeof describeLayer === 'function' ? (describeLayer() ?? {}) : {}
  const userPath = layer.userPath ?? rolegroupFilePath()
  const projectPath = layer.projectPath ?? projectRolegroupFilePath()
  const path = parsed.project === true ? projectPath : userPath
  const layerText = layer.panelEnabled === true
    ? '设置面板（settings 层；rolegroup.jsonc 整层让位）'
    : layer.active === 'project'
      ? `项目 jsonc（${layer.path ?? projectPath}）`
      : layer.active === 'user'
        ? `用户 jsonc（${layer.path ?? userPath}）`
        : '内置默认表（没有配置文件）'

  if (!plan.needsFile && plan.unresolved.length === 0) {
    return {
      kind: 'success',
      text: `当前生效层：${layerText}\n内置角色在本机全部可用（已注册 provider：${providers.join(', ') || '(无)'}），无需生成配置。\n`
        + `如需自定义，直接编辑 ${userPath}`,
    }
  }
  const summary = `检测到 ${plan.entries.length} 个角色的主路由在本机不可用`
    + (plan.unresolved.length > 0 ? `；${plan.unresolved.length} 个角色完全没有可用路由` : '') + '。'

  // --diff：整份替换前，先说明会覆盖谁、会丢谁。
  let diffText = ''
  try {
    const existing = await readFile(path, 'utf8')
    const diff = summarizeOverwrite(existing, plan.entries)
    if (diff.unparsable === true) diffText = `\n注意：${path} 解析失败，--diff 无法比较（--write --force 会整份覆盖）。`
    else if (diff.existing === false) diffText = ''
    else {
      const parts = []
      if (diff.replaced.length > 0) parts.push(`会被覆盖：${diff.replaced.join(', ')}`)
      if (diff.dropped.length > 0) parts.push(`会被丢弃（生成内容不含它们）：${diff.dropped.join(', ')}`)
      diffText = parts.length > 0 ? `\n--diff：${parts.join('；')}。` : '\n--diff：已有文件里没有同名角色，不会覆盖任何条目。'
    }
  } catch {
    diffText = ''
  }

  if (!parsed.write) {
    return {
      kind: 'success',
      text: `当前生效层：${layerText}\n${summary}${parsed.diff === true ? diffText : ''}\n\n${plan.text}\n`
        + `写入${parsed.project === true ? '项目级' : '用户级'}配置：/rolegroup init --write${parsed.project === true ? ' --project' : ''}`
        + '（已存在则拒绝；确认覆盖加 --force，会先备份）',
    }
  }

  // --write：先做层检查，避免「写成功但不生效」。
  if (layer.panelEnabled === true) {
    return {
      kind: 'error',
      text: `当前生效层：${layerText}\n未写入：面板已接管，rolegroup.jsonc 整层让位，写文件不会生效。\n`
        + '请先在 设置 → 角色配置 里点「重置为文件配置」，再执行 /rolegroup init --write；或直接在面板里改。',
    }
  }
  if (parsed.project !== true && layer.active === 'project') {
    return {
      kind: 'error',
      text: `当前生效层：${layerText}\n未写入：项目级配置存在，用户级 ${userPath} 不会被读取。\n`
        + '请改用 /rolegroup init --write --project 写入项目级文件，或先删除项目级配置。',
    }
  }
  let warning = ''
  if (parsed.project === true && layer.active === 'user') {
    warning = `\n注意：项目级文件会遮蔽现有的用户级配置（${layer.path ?? userPath}），请确认这是你要的。`
  }

  let backup
  if (parsed.force === true) backup = await backupExistingConfig(path)
  const result = await writeInitConfig(path, plan.text, { force: parsed.force })
  if (result.written !== true) {
    if (result.reason === 'exists') {
      return { kind: 'error', text: `${path} 已存在，未覆盖。确认要覆盖请执行：/rolegroup init --write --force（会先备份）` }
    }
    return { kind: 'error', text: `dsh-rolegroup init：写入 ${path} 失败：${result.error?.message ?? result.reason}` }
  }
  return {
    kind: 'success',
    text: `已写入 ${path}${backup === undefined ? '' : `\n已备份原文件：${backup}`}\n${warning}`
      + `重启 dsh web 并开新会话后生效。\n\n当前生效层：${layerText}\n${summary}${parsed.diff === true ? diffText : ''}`,
  }
}

/**
 * 取数 + 判定 + 渲染；返回 { kind, text } 供 handler 决定成功/错误语义
 * （missing/unparsable/空角色表 → kind:'error'，§1/AC-11）。
 * signal 优先（红线 3）：开头与每次 listModels 前各查一次 aborted。
 */
async function executeDoctor(ctx, signal) {
  if (signal?.aborted) return { kind: 'error', text: 'dsh-rolegroup doctor：已取消（signal 已中止）' }

  let state
  try {
    state = await readStartupReport({ now: new Date() })
  } catch (error) { // readStartupReport 自身永不抛，此处兜底红线 2
    return { kind: 'error', text: `dsh-rolegroup doctor：读取启动快照失败：${error?.message ?? error}` }
  }
  if (state.kind === 'missing' || state.kind === 'unparsable') {
    return { kind: 'error', text: renderDoctorText(state) }
  }

  const report = state.report
  // llm 软取（与 lib/index.js 既有 ctx.get?.('llm') 防御同款，H7）；不可用 → 全 unknown（D2）
  let llm
  try { llm = ctx.get?.('llm') } catch { llm = undefined }
  let providers = null
  let modelsOf
  let configurableErrors
  if (llm !== undefined && llm !== null) {
    try {
      providers = llm.listProviders().map((p) => p.id)
    } catch (error) {
      warn(ctx, `dsh-rolegroup doctor: listProviders 失败（${error?.message ?? error}），provider/模型列按未校验处理`)
      providers = null
    }
  }
  if (providers !== null) {
    // AC-23（H10 增值判据）：取「已声明但未激活」的路由列表，区分 provider 完全不存在 vs
    // 已配置未启用/key 缺失。?. 可选调用 + try/catch：API 不存在（老主机）或抛错时静默降级为
    // 现状行为（保持「当前未注册」措辞）。
    try {
      const configurable = await llm.listConfigurableProviders?.()
      if (Array.isArray(configurable)) {
        const map = new Map()
        for (const c of configurable) {
          if (c === null || typeof c !== 'object' || typeof c.provider !== 'string') continue
          if (providers.includes(c.provider)) continue // 已激活的路由不需要此判据
          map.set(c.provider, { error: c.error, settingsNs: c.settingsNs, displayName: c.displayName })
        }
        configurableErrors = map
      }
    } catch { /* 静默降级：configurableErrors 保持 undefined，auditRoles 走原「未注册」措辞 */ }

    // RK2：只对去重后的 provider 集合各查一次；单 provider 失败降级 unknown 不重试
    const wanted = [...new Set(report.registered.map((r) => r.provider))].filter((p) => providers.includes(p))
    const modelsByProvider = new Map()
    for (const provider of wanted) {
      if (signal?.aborted) break // 红线 3：中止后不再发起新的 listModels
      try {
        modelsByProvider.set(provider, (await llm.listModels(provider)).map((m) => m.id))
      } catch (error) {
        warn(ctx, `dsh-rolegroup doctor: 拉取 ${provider} 的模型列表失败（${error?.message ?? error}），该 provider 的模型列按未校验处理`)
        modelsByProvider.set(provider, null)
      }
    }
    modelsOf = (provider) => (modelsByProvider.has(provider) ? modelsByProvider.get(provider) : null)
  }

  const audit = auditRoles(report, { providers, modelsOf, configurableErrors })
  const text = renderDoctorText(state, audit)
  if (report.registered.length === 0) return { kind: 'error', text } // 空角色表 → error 语义
  return { kind: 'success', text }
}

/**
 * 供命令与测试共用的取数+渲染入口（plans §2 契约签名）。
 * @param {object} ctx
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>} 渲染产物（错误场景返回错误文本本身，不抛）
 */
export async function runDoctor(ctx, signal) {
  return (await executeDoctor(ctx, signal)).text
}
