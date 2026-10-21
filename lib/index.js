// dsh-rolegroup: 角色化委派层（v0.1，host-only）。
//
// 设计依据见仓库 docs/proposal.md（§2 F1-F6 / §3 D-Rev1..4 / §7 R1-R2）：
//   - 每角色一个 dsh-tool-subagent 实例：固定 agentOptions{provider,model}
//     + modelSelectionSettings:false + persona（F1）
//   - modelSelectionSettings:false 走 install(ctx, undefined) 站立式组合，
//     工具直接注册在 host 平面，无需 preset scope（dsh-tool-subagent/lib/index.js:582）
//   - 统一 maxDepth:1（主会话可委派、角色子代理不可再委派，D-Rev2；
//     0 会把顶层调用也挡掉，见 2e5ffd6 与 lib/roles.js buildInstanceConfig 注释）
//   - readonly 已移除（v0.5）：工具面白名单表达不了权限边界，在配置面提供它易被误读成安全开关
//     （详见 lib/roles.js 头注）；只读改由 persona 软约束 + 会话级 permission preset 承担
//   - 配置启动时读一次，不热生效（R1）；改配置需重载插件/新会话
//
// 配置文件查找顺序（第一个命中即停）：
//   1. <启动 cwd>/.dsh/rolegroup.jsonc   （项目级）
//   2. $DSH_HOME/rolegroup.jsonc         （用户级，DSH_HOME 缺省 ~/.dsh）
//   都没有则用内置默认表（lib/roles.js DEFAULT_ROLES）。
//
// 启动校验（proposal §4「已知坑」修订版）：
//   源码审计（L1）：modelSelectionSettings:false 时白名单 assertAllowedModelSelection
//   不被调用（policy 为 undefined 直接返回）；真正的运行时防线是委派时的
//   preflightChildLlmRoute（llm.resolveCallConfig）。因此启动校验改为：
//   - 硬校验：provider 必须在 llm 注册表中（不可用时降级为跳过）
//   - 软校验：model 在 provider 广告列表中（列表拉取失败只警告）
//   无效路由的角色不注册，日志给出 actionable 错误。
//
// @module dsh-rolegroup
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { parseJsonc } from './jsonc.js'
import { installRolegroupCommands } from './command.js'
import { Config, ROLEGROUP_CONFIG_TOP_FIELDS, ROLEGROUP_ENTRY_ID, settingsSectionOf } from './config.js'
import { DEFAULT_ROLES, buildInstanceConfig, mergeRoles, roleAnnouncement } from './roles.js'
import { createPruneScheduler } from './startup-scheduler.js'
import { resolveDeploymentModule } from './settings.js'
import { legacyFieldProblems, rolesToSection, sameSection, sectionToFileConfig } from './settings-table.js'
import { buildPresetDefinition, presetIdOf } from './presets.js'

// dsh-tool-subagent 的解析链（2026-09-22 实证，L1）已泛化为 resolveDeploymentModule
// 并迁至 lib/settings.js（裸导入 → ctx.loader.import → 借 @deepseek-ai/* 条目树 baseUrl，
// 顺序逐字不变，S10）；这里保留模块级缓存语义（解析成功后重复调用不重走链）。
let toolSubagent
async function resolveToolSubagent(ctx) {
  if (toolSubagent !== undefined) return toolSubagent
  toolSubagent = await resolveDeploymentModule(ctx, '@deepseek-ai/dsh-tool-subagent')
  return toolSubagent
}

// ---- v0.6（dsh 0.2.1）：Agent Preset 契约自检 / 服务时序 / 基底取数 ----
// 契约依据见 plans/v0.6-dsh-0.2.1-migration.md §1.3：0.2.1 起 persona 只能由 Agent Preset 承载，
// 且显式 preset 会替换父组合 → 角色 preset = 克隆 deployment 默认 preset 的完整 rows。

/** 契约自检：dsh ≥0.2.1 才有 @deepseek-ai/dsh-persona（persona 只能是 preset 内的一行）。 */
async function resolvePersonaModule(ctx) {
  return resolveDeploymentModule(ctx, '@deepseek-ai/dsh-persona')
}

/**
 * 读 deployment 默认 preset 的 rows（loader 里的**有效**配置，profile patch 的覆盖会反映在这里）。
 * 读不到返回 undefined → 调用方 fail-loud（绝不猜一个 preset 顶上）。
 * @param {object} ctx @param {string} defaultId agentPresets.defaultId
 * @returns {unknown[] | undefined}
 */
function readBasePresetRows(ctx, defaultId) {
  let entries
  try {
    entries = [...(ctx.get?.('loader')?.entries?.() ?? [])]
  } catch {
    return undefined
  }
  const entry = entries.find((item) =>
    item?.options?.name === '@deepseek-ai/dsh-agent-preset' && item.options?.config?.id === defaultId)
  const rows = entry?.options?.config?.plugins
  return Array.isArray(rows) && rows.length > 0 ? rows : undefined
}

/**
 * put 一个上界：promise 在 ms 内 settle 则返回其值，否则返回 undefined。
 * 用于 finalize 的健康审计——审计失败/挂起绝不能阻断启动报告（D8）。
 */
function withTimeoutMs(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), Math.max(0, ms))
    timer?.unref?.()
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      () => { clearTimeout(timer); resolve(undefined) },
    )
  })
}

/**
 * 解析 agentPresets 服务（dsh 0.2.1 的 agent-preset registry）。
 * 双通道：已激活立即返回；否则 ctx.inject 等它就绪（cordis strict `ctx.get` 时序坑，handoff 坑 #7）。
 * 上界 timeoutMs（生产 2000）；定时器 unref + 清理；返回 undefined = 缺席/超时（调用方降级，不抛）。
 * @param {object} ctx @param {number} timeoutMs @param {{warn: Function}} log
 * @returns {Promise<object | undefined>}
 */
function resolvePresetsService(ctx, timeoutMs, log) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      const immediate = ctx.get?.('agentPresets')
      if (immediate !== undefined && immediate !== null) return finish(immediate)
    } catch { /* 继续走 inject 通道 */ }
    const timer = setTimeout(() => finish(undefined), Math.max(0, timeoutMs))
    timer?.unref?.()
    try {
      ctx.inject(['agentPresets'], (injectedCtx) => {
        clearTimeout(timer)
        if (settled) {
          log.warn('dsh-rolegroup: agentPresets 服务在超时后到达，本次未注册角色；请重启插件')
          return
        }
        finish(injectedCtx.agentPresets)
      })
    } catch {
      clearTimeout(timer)
      finish(undefined)
    }
  })
}

const name = 'dsh-rolegroup'
const inject = ['systemPrompt']

/**
 * 测试注入通道（v0.4）。
 * cordis 恒以 `apply(ctx, config)` 调用，第二形参已被条目 Config 占用，无法再承载注入项；
 * 测试用 `__setTestOverrides({ debounceMs, maxWaitMs, setTimeoutFn, clearTimeoutFn, watchDebounceMs })`
 * 设置（生产恒为空对象）。旧式「把注入项当第二形参传」的调用**仍然支持**（保兼容）。
 */
let testOverrides = {}

/** 仅供测试：设置/清空注入项。@param {object | undefined} overrides */
export function __setTestOverrides(overrides) {
  testOverrides = overrides ?? {}
}

/** 角色公告在 prompt 中的位置（engineering-workflow 用 160，错开避免相邻）。 */
const SECTION_ORDER = 170

function expandTilde(p) {
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(homedir(), p.slice(2))
  return p
}

/** 解析 harness home（DSH_HOME 覆盖约定 ~/.dsh）。 */
function dshHome() {
  const override = process.env.DSH_HOME
  if (override === undefined || override.trim() === '') return join(homedir(), '.dsh')
  return expandTilde(override.trim())
}

async function pathExists(p) {
  try { await access(p); return true } catch { return false }
}

/** 定位并解析配置文件；返回 { config, source, mtimeMs } 或 { config: undefined, source, error, mtimeMs }。 */
async function loadRoleConfig(ctx) {
  const candidates = [
    join(process.cwd(), '.dsh', 'rolegroup.jsonc'),
    join(dshHome(), 'rolegroup.jsonc'),
  ]
  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue
    let mtimeMs // B1/T3：快照加性字段 configMtimeMs 的数据源；stat 失败 → undefined，不影响主流程
    try { mtimeMs = (await stat(candidate)).mtimeMs } catch { /* 忽略 */ }
    try {
      const text = await readFile(candidate, 'utf8')
      return { config: parseJsonc(text), source: candidate, mtimeMs }
    } catch (error) {
      return { config: undefined, source: candidate, error, mtimeMs }
    }
  }
  return { config: undefined, source: undefined }
}

/** 解析 persona 的 file:// 外链（相对配置文件目录）。 */
async function resolvePersonaFiles(ctx, roles, configSource) {
  for (const role of roles) {
    if (role.personaFile === undefined) continue
    const raw = expandTilde(role.personaFile)
    const path = isAbsolute(raw) || configSource === undefined
      ? raw
      : resolve(dirname(configSource), raw)
    try {
      role.persona = (await readFile(path, 'utf8')).trim()
    } catch (error) {
      ctx.logger.warn(`dsh-rolegroup: 角色 "${role.toolName}" 的 persona 文件读取失败（${path}）：${error.message}；回退为内置/通用 persona`)
      role.persona = DEFAULT_ROLES[role.toolName]?.persona
    }
    delete role.personaFile
  }
}

/**
 * 启动路由校验（proposal §4 修订：白名单对固定 agentOptions 实例不生效，
 * 真正的防线是 provider 注册 + 委派时 preflight；这里把失败尽量提前到启动时）。
 * @returns {Promise<{valid: object[], invalid: Array<{role, reason}>}>}
 */
async function validateRoutes(ctx, roles) {
  const llm = ctx.get?.('llm')
  if (llm === undefined) {
    ctx.logger.warn('dsh-rolegroup: llm 服务不可用，跳过路由启动校验（委派时仍会预检）')
    return { valid: roles, invalid: [] }
  }
  const providers = llm.listProviders()
  const valid = []
  const invalid = []
  for (const role of roles) {
    const provider = providers.find((p) => p.id === role.provider)
    if (provider === undefined) {
      invalid.push({
        role,
        reason: `LLM provider "${role.provider}" 未注册（可用：${providers.map((p) => p.id).join(', ') || '(无)'}）。请检查 rolegroup.jsonc 的 provider 字段`,
      })
      continue
    }
    try {
      const models = await llm.listModels(provider.id)
      if (!models.some((m) => m.id === role.model)) {
        ctx.logger.warn(`dsh-rolegroup: 角色 "${role.toolName}" 的模型 "${role.model}" 不在 ${provider.id} 的广告列表（${models.map((m) => m.id).join(', ') || '(空)'}）；仍注册，委派时预检会最终裁决`)
      }
    } catch (error) {
      ctx.logger.warn(`dsh-rolegroup: 拉取 ${provider.id} 的模型列表失败（${error.message}），跳过模型名校验`)
    }
    valid.push(role)
  }
  return { valid, invalid }
}

async function apply(ctx, optionsOrConfig) {
  const log = ctx.logger
  // 第二形参有两种来源，形状不重叠，按「是否含**任一** Config 顶层字段」判别：
  //   - cordis 传**解析后的条目 Config**（顶层字段见 ROLEGROUP_CONFIG_TOP_FIELDS）；
  //   - 测试传注入项（debounceMs / setTimeoutFn / watchDebounceMs…），见 plans/startup-hardening.md T5。
  // 不嗅探单键：字段增减会让单键判别静默失效（收口审查 N-1）；新增顶层字段时同步 config.js 的清单。
  const isEntryConfig = optionsOrConfig !== null && typeof optionsOrConfig === 'object'
    && ROLEGROUP_CONFIG_TOP_FIELDS.some((key) => key in optionsOrConfig)
  const entryConfig = isEntryConfig ? optionsOrConfig : undefined
  const opts = isEntryConfig ? testOverrides : { ...testOverrides, ...optionsOrConfig }

  const { config, source, error, mtimeMs } = await loadRoleConfig(ctx)
  if (error !== undefined) {
    log.error(`dsh-rolegroup: 配置文件 ${source} 解析失败：${error.message}；回退为内置默认角色表。请修正 JSONC 语法后重载插件`)
  } else if (source !== undefined) {
    log.info(`dsh-rolegroup: 使用配置文件 ${source}（改动需重载插件/新会话生效，R1）`)
  } else {
    log.info('dsh-rolegroup: 未找到 rolegroup.jsonc，使用内置默认角色表')
  }

  // jsonc 侧的表：**始终准备**——它既可能是生效表，也可能是 settings 用户层被清空后的回落目标（D4）。
  const fileMerged = mergeRoles(config)
  await resolvePersonaFiles(ctx, fileMerged.roles, source)
  const fileSection = rolesToSection(fileMerged.roles)

  // D4 优先级：settings 用户层（roles 非空）> jsonc 链（项目级 → 用户级 → 内置）。
  const settingsSection = settingsSectionOf(entryConfig)
  const settingsSource = `settings 面板（profile patch: ${ROLEGROUP_ENTRY_ID}）`
  const usingSettings = settingsSection !== undefined
  let roles
  let problems
  if (usingSettings) {
    const merged = mergeRoles(sectionToFileConfig(settingsSection))
    // settings 层只有内联 persona（D1：面板不支持 file:// 外链），故传 undefined 不给它解析相对路径。
    await resolvePersonaFiles(ctx, merged.roles, undefined)
    roles = merged.roles
    // 收口审查 B-1：sectionToFileConfig 是**白名单投影**，遗留的 readonly 会在投影时被丢掉，
    // mergeRoles 再也看不到 → 必须在这条路径上单独收一次遗留字段提示，否则用户 profile patch 里
    // 残留的 readonly 会被**静默忽略**（正是 lib/roles.js 头注说的"最危险"）。
    problems = [...merged.problems, ...legacyFieldProblems(settingsSection)]
    // 层语义是「整层择一」而非逐角色缝合：接管后 jsonc **整层让位**，未列进面板的角色回落内置表。
    // 这句必须把后果说全——只说"被覆盖"会让用户以为未列出的角色还沿用 jsonc（README §4 已按此写死）。
    log.info(`dsh-rolegroup: settings 用户层接管角色表（${settingsSource}）——jsonc 文件表整层让位`
      + `${source !== undefined ? `（${source} 不再参与）` : ''}；未在面板列出的角色回落内置表，不会沿用 jsonc`)
    // 被覆盖的文件层问题：逐条 warn（不降级成计数，否则文案与修复建议丢失）
    for (const overridden of fileMerged.problems) {
      log.warn(`dsh-rolegroup: rolegroup.jsonc 的以下问题当前被 settings 用户层覆盖、未生效：${overridden}`)
    }
  } else {
    roles = fileMerged.roles
    problems = fileMerged.problems
  }
  for (const problem of problems) log.error(`dsh-rolegroup: ${problem}`)
  /** 启动报告 configSource 的初始取值（D4/T4 三态：jsonc 路径 / settings 面板 / null=内置默认）。 */
  const initialSource = usingSettings ? settingsSource : (source ?? null)
  /** 当前生效来源；随每次重组装更新，避免依赖函数默认参数导致 prune 覆写成初始值（收口 S-1）。 */
  let currentConfigSource = initialSource

  // 立即注册全部角色，不做启动时路由硬校验——实证（2026-09-22 双实例，L1）：
  // llm-pi-ai 的 provider 注册晚于本插件 apply（彼时只有内置 deepseek-official），
  // 启动即校验会误杀全部非 deepseek 角色。校验延后到 llm/adapters-updated 防抖后进行。
  const fibers = new Map() // role -> cordis Fiber（dispose 即注销该角色的工具）
  const registered = []
  const failed = []
  const subagentModule = await resolveToolSubagent(ctx)
  if (subagentModule === undefined) {
    log.warn('dsh-rolegroup: @deepseek-ai/dsh-tool-subagent 不可解析（loader 链全部失败），跳过实例注册')
  }

  // ---- v0.6：契约自检 + agentPresets 服务 + 默认 preset 基底（plans/v0.6 §4.2–§4.4）----
  // 先探 @deepseek-ai/dsh-persona：它只存在于 0.2.1+，可让 0.2.0 立即 fail-loud（不必白等服务超时）。
  const personaModule = await resolvePersonaModule(ctx)
  let presetsService
  let basePresetId
  let basePresetRows
  if (personaModule === undefined) {
    log.warn('dsh-rolegroup: 需要 dsh ≥ 0.2.1（@deepseek-ai/dsh-persona 不可解析）；角色不注册，其余功能降级')
  } else {
    presetsService = await resolvePresetsService(ctx, opts?.presetsReadyTimeoutMs ?? 2000, log)
    if (presetsService === undefined) {
      log.warn('dsh-rolegroup: 需要 dsh ≥ 0.2.1（agentPresets 服务缺席或超时）；角色不注册，其余功能降级')
    } else {
      basePresetId = presetsService.defaultId
      basePresetRows = readBasePresetRows(ctx, basePresetId)
      if (basePresetRows === undefined) {
        log.error(`dsh-rolegroup: 无法读取 deployment 默认 agent preset（id=${basePresetId}）的 plugins；`
          + '角色将全部跳过。请确认 dsh ≥0.2.1 且该 preset 已声明')
      } else {
        log.info(`dsh-rolegroup: 角色 preset 基底 = ${basePresetId}`
          + `（克隆 ${basePresetRows.length} 行 + 替换 persona + 剔除 delegation）`)
      }
    }
  }
  // fail-loud：契约不满足时角色全部进 failed[]（报告可见），绝不静默降级成"没有角色"
  const canRegisterRoles = basePresetRows !== undefined
  if (!canRegisterRoles) for (const role of roles) failed.push(role)

  // ---- v0.6 注册链：角色 = Agent Preset（persona + 克隆的完整组合）+ 委派工具实例 ----
  // 顺序不可交换：tool-subagent 的 validate() 会 readDocument(presetId)（上游 lib/index.js:533/:583）。
  const presetDisposers = new Map() // role -> disposePreset

  /** 注销一个角色：**先 fiber 后 preset**，每步独立 try/warn（顺序理由：工具先消失）。 */
  const disposeRole = async (role) => {
    const fiber = fibers.get(role)
    fibers.delete(role)
    try {
      await fiber?.dispose()
    } catch (err) {
      log.warn(`dsh-rolegroup: 角色 "${role.toolName}" 注销失败：${err?.message ?? err}`)
    }
    const disposePreset = presetDisposers.get(role)
    presetDisposers.delete(role)
    try {
      await disposePreset?.()
    } catch (err) {
      log.warn(`dsh-rolegroup: 角色 "${role.toolName}" 的 agent preset 注销失败：${err?.message ?? err}`)
    }
  }

  // early effect（D9）：任何注册动作之前挂上。插件重载/卸载时 await 回收全部 preset+fiber；
  // 否则会留孤儿 preset → 下次加载撞 `Duplicate agent preset` 让全部角色失败。
  try {
    ctx.effect?.(() => async () => {
      for (const role of [...fibers.keys()]) await disposeRole(role)
    }, 'dsh-rolegroup: dispose roles')
  } catch { /* effect 不可用时忽略（宿主 teardown 时 cordis 仍会 dispose 子 fiber） */ }

  const registerAll = async (list) => {
    if (subagentModule === undefined || !canRegisterRoles) return
    for (let index = 0; index < list.length; index += 1) {
      const role = list[index]
      let disposePreset
      try {
        const definition = buildPresetDefinition(basePresetRows, role, index)
        disposePreset = await presetsService.register(definition)
        const fiber = await ctx.plugin(subagentModule, buildInstanceConfig(role, definition.id))
        presetDisposers.set(role, disposePreset)
        fibers.set(role, fiber)
        registered.push(role)
        log.info(`dsh-rolegroup: 角色 "${role.toolName}" 就绪（preset ${definition.id}）`)
      } catch (err) {
        // 原子回滚：preset 已注册但 fiber 失败 → 立即回收，不留孤儿
        try { await disposePreset?.() } catch { /* 主错误已记录，回滚失败不覆盖 */ }
        failed.push(role)
        log.error(`dsh-rolegroup: 角色 "${role.toolName}" 注册失败：${err?.message ?? err}`)
      }
    }
  }
  await registerAll(roles)

  let disposeSection
  const announce = (rs) => {
    disposeSection?.()
    disposeSection = rs.length > 0
      ? ctx.systemPrompt.section({ name: 'dsh-rolegroup:roles', order: SECTION_ORDER, text: roleAnnouncement(rs) })
      : undefined
  }
  announce(registered)

  const writeReport = async (valid, invalid, configSource) => {
    // 启动报告落盘：cordis logger 在本部署不走 stdout（export 器在 client 侧），
    // 终端排障/自动化验收以本文件为准（插件状态目录惯例 $DSH_HOME/plugins/<pkg>）。
    // configSource 缺省 = 配置文件路径（v0.1 文案不变）；settings 重组装时由 compose 传入标注值（D2/T2）。
    try {
      const stateDir = join(dshHome(), 'plugins', 'dsh-rolegroup')
      await mkdir(stateDir, { recursive: true })
      await writeFile(join(stateDir, 'last-startup.json'), JSON.stringify({
        time: new Date().toISOString(),
        configSource,
        configError: error?.message ?? null,
        // 加性字段（plans/startup-hardening.md §2.2）：无文件/stat 失败 → null。
        // ⚠️ 这里**不是改字段语义**，而是让它回到被记录下来的语义——lib/doctor.js 的 JSDoc 与
        // 「配置年龄提示」一直把它当"**生效**配置文件 mtime"消费；缺陷在写入侧：接管时也照抄了
        // 已被整层让位的 jsonc 文件 mtime，于是提示把那个文件的年龄算到 settings 面板头上。
        // 故按「生效来源就是该文件」把关：面板接管 / 内置表兜底一律 null（2026-10-15 实测复现）。
        configMtimeMs: (source !== undefined && configSource === source) ? (mtimeMs ?? null) : null,
        // ⚠️ v0.5 破坏性变更（红线 3「仅加性字段」的**显式例外**）：
        //    registered[] 移除 `readonly` 字段。理由：该字段承载的语义已整体废弃（不再有 toolFilter），
        //    保留一个恒 true/false 的死字段会让 doctor/消费者误以为它仍有意义。
        //    读取方（lib/doctor.js）已同步为「缺 readonly 即正常」，不再把它计入 missing 断言。
        registered: valid.map((r) => ({ toolName: r.toolName, provider: r.provider, model: r.model })),
        failed: failed.map((r) => r.toolName),
        invalid: invalid.map(({ role, reason }) => ({ toolName: role.toolName, reason })),
        problems,
      }, null, 2))
    } catch (reportError) {
      log.warn(`dsh-rolegroup: 启动报告写入失败：${reportError?.message ?? reportError}`)
    }
  }

  // 终验 + 剪枝：provider 仍未注册的角色 dispose 掉（工具从 catalog 移除），
  // 日志给 actionable 错误。防抖 3s（provider 可能分多批注册，各批都触发事件）；
  // 无任何事件时由初始定时器兜底（热加载场景）。
  let pruned = false
  let pendingTable // {section, configSource} | undefined：pruned 闸门 / 串行化记账
  let volatileHandle // volatile 防抖定时器（D5）
  let composing = false
  let currentSection = rolesToSection(roles) // 当前生效表（onTable 的 sameSection 短路基准）

  // T2 抽取的共用收尾链（prune 终验 = 首次校验，compose 重组装复用，语义逐字不变）
  const finalize = async (configSource, alwaysAnnounce = false) => {
    // 显式记账：prune 终验不带 source 时沿用「当前生效来源」，不得被初始值悄悄覆写（收口 S-1）
    if (configSource !== undefined) currentConfigSource = configSource
    // W3：validateRoutes 抛错（如 llm 服务在防抖窗内被卸载）不得吞掉整轮终验——按全量在册兜底走完写报告
    let valid
    let invalid
    try {
      const result = await validateRoutes(ctx, registered)
      valid = result.valid
      invalid = result.invalid
    } catch (validationError) {
      log.warn(`dsh-rolegroup: 启动终验路由校验失败（${validationError?.message ?? validationError}），按全量在册写报告`)
      valid = registered
      invalid = []
    }
    // v0.6 preset 健康审计（D8/D12）：只在 finalize 做——此时 apply 已返回，不会在宿主 row
    // activation 内调 list()（registry 的 diagnostic 可能 await loader.await() → 自等挂死）。
    // 审计超时/失败降级为 warn，**绝不阻断报告**；查 broken 也查「id 失踪」（registry 重载后
    // definitions 会被清空，角色看似在册但委派必失败）。
    if (canRegisterRoles && valid.length > 0) {
      try {
        const roster = await withTimeoutMs(presetsService.list(), 2000)
        if (roster === undefined) {
          log.warn('dsh-rolegroup: preset 健康审计超时，按已注册写报告')
        } else {
          const byId = new Map(roster.map((item) => [item.id, item]))
          const healthy = []
          for (const role of valid) {
            const presetId = presetIdOf(role.toolName)
            const record = byId.get(presetId)
            if (record === undefined) {
              invalid.push({ role, reason: `agent preset "${presetId}" 失踪（可能被外部移除或服务重载）` })
            } else if (record.broken !== undefined) {
              invalid.push({ role, reason: `agent preset "${presetId}" 激活失败：${record.broken}` })
            } else {
              healthy.push(role)
            }
          }
          valid.length = 0
          valid.push(...healthy)
        }
      } catch (auditError) {
        log.warn(`dsh-rolegroup: preset 健康审计失败（${auditError?.message ?? auditError}），按已注册写报告`)
      }
    }
    for (const { role, reason } of invalid) {
      log.error(`dsh-rolegroup: 角色 "${role.toolName}" 已注销——${reason}`)
      await disposeRole(role) // v0.6：fiber + preset 一并回收（剪枝路径也不得留孤儿）
    }
    if (invalid.length > 0 || alwaysAnnounce) announce(valid)
    const summary = valid.map((r) => `${r.toolName}→${r.provider}/${r.model}`).join(' ')
    if (invalid.length === 0 && failed.length === 0 && problems.length === 0) {
      log.info(`dsh-rolegroup: ${valid.length} 个角色已注册：${summary}`)
    } else {
      log.warn(`dsh-rolegroup: ${valid.length} 个角色在册（${summary}）；${invalid.length + failed.length + problems.length} 项异常，见上方错误`)
    }
    await writeReport(valid, invalid, currentConfigSource)
  }

  // D2 可重入装配：dispose 现有全部 fiber → 按新表注册 → finalize 收尾（三集合先清账再重记）
  const compose = async (nextRoles, configSource) => {
    for (const role of [...fibers.keys()]) await disposeRole(role)
    registered.length = 0
    failed.length = 0
    await registerAll(nextRoles)
    await finalize(configSource, true) // 表已变：无论是否有 invalid 都须重公告
  }

  // 生效表变更 → 重组装（红线 1：失败降级 warn；红线 2：composing 串行化，异值尾随合并一次）
  const recompose = async (section, configSource) => {
    if (composing) { pendingTable = { section, configSource }; return }
    composing = true
    try {
      const { roles: nextRoles, problems: nextProblems } = mergeRoles(sectionToFileConfig(section))
      // 收口审查 v0.5 复审 ①.1：`sectionToFileConfig` 是**白名单投影**，遗留的 readonly 会在投影时被丢掉，
      // `mergeRoles` 再也看不到。**热更新（面板保存）这条路径必须与启动分支一样单独收一次**，
      // 否则「面板里带着残留 readonly 保存」= 静默失效，与 B-1 原症状完全同类。
      const effectiveProblems = [...nextProblems, ...legacyFieldProblems(section)]
      // 写回闭包 `problems`：finalize 的摘要计数与 writeReport 都读它。
      // 不改的话，热更新阶段发现的问题只进日志、不进 last-startup.json，doctor 就看不到。
      problems.length = 0
      problems.push(...effectiveProblems)
      for (const problem of effectiveProblems) log.error(`dsh-rolegroup: ${problem}`)
      await resolvePersonaFiles(ctx, nextRoles, undefined) // settings 层只有内联 persona
      currentSection = section
      await compose(nextRoles, configSource)
    } catch (e) {
      log.warn(`dsh-rolegroup: 生效表重组装失败（${e?.message ?? e}），保留当前注册表`)
    } finally {
      composing = false
    }
    const next = pendingTable
    pendingTable = undefined
    if (next !== undefined && !sameSection(next.section, currentSection)) await recompose(next.section, next.configSource)
  }

  const onTable = (section, configSource) => {
    if (sameSection(section, currentSection)) return // 同值短路（含「未接管」时的首回调 === 文件表）
    if (pruned !== true) { pendingTable = { section, configSource }; return } // pruned 闸门：终验未完成只记账
    void recompose(section, configSource)
  }

  const prune = async () => {
    if (pruned) return
    pruned = true
    await finalize()
    const table = pendingTable // 闸门补做：终验前到达的表变更补一次 recompose
    pendingTable = undefined
    if (table !== undefined) await recompose(table.section, table.configSource)
  }
  // 防抖 + 最大等待上限由调度器承担（plans/startup-hardening.md A1：防事件高频时防抖饿死）；
  // 一次性语义由 scheduler.ran + prune 内 pruned 双守卫承担
  const sched = createPruneScheduler({
    run: prune,
    // T5：debounceMs/maxWaitMs 可经 apply(ctx, opts) 注入（undefined 时走缺省 3000/10000，
    // 生产行为不变；host 以 apply(ctx)/apply(ctx, config) 调用均不受影响，仅供测试注入）
    debounceMs: opts?.debounceMs,
    maxWaitMs: opts?.maxWaitMs,
    setTimeoutFn: opts?.setTimeoutFn, // T2 假时钟注入（测试专用；缺省全局 = 生产零变化），同组喂 settings watch 防抖
    clearTimeoutFn: opts?.clearTimeoutFn,
    // T5 兜底：prune 内未覆盖的抛点（announce/summary 构造等）不得升级为 unhandled
    // rejection（Node ≥15 默认致命退出）——显式上报日志，不是吞错
    onError: (e) => log.warn(`dsh-rolegroup: 终验执行失败（${e?.message ?? e}）；角色剪枝与启动报告可能不完整`),
  })
  sched.schedule()
  try { ctx.on('llm/adapters-updated', () => sched.schedule()) } catch {
    log.warn('dsh-rolegroup: llm/adapters-updated 事件不可订阅，剪枝仅靠初始定时器兜底')
  }
  try {
    ctx.effect?.(() => () => {
      sched.cancel()
      // volatile 防抖定时器一并清理（两者共用一条 effect，保持「apply 只注册一条 effect」的既有形状）
      if (volatileHandle !== undefined) settingsClearTimeout(volatileHandle)
    })
  } catch { /* effect 不可用时忽略 */ }
  installRolegroupCommands(ctx) // /rolegroup doctor（plans/rolegroup-doctor.md T3；内部软取 commands，缺失只 warn 不抛）

  // v0.4：生效通知改走 cordis volatile 配置更新（0.1.7 已无旧的 settings 作用域 watch，见 plans/v0.4-settings-migration.md §0 S9）。
  // 面板保存 → configEditor 写 profile patch → loader 提交 volatile → 这里触发重建（D5「保存即重组装」语义不变）。
  const settingsDebounceMs = opts?.watchDebounceMs ?? 300
  const settingsSetTimeout = opts?.setTimeoutFn ?? setTimeout
  const settingsClearTimeout = opts?.clearTimeoutFn ?? clearTimeout
  const applyVolatile = () => {
    const section = settingsSectionOf(entryConfig)
    if (section !== undefined) onTable(section, settingsSource)
    else onTable(fileSection, source ?? null) // 用户清空（unset roles）→ 回落 jsonc 文件表（D4）
  }
  const onVolatileUpdate = () => {
    if (volatileHandle !== undefined) settingsClearTimeout(volatileHandle)
    volatileHandle = settingsSetTimeout(() => {
      volatileHandle = undefined
      try {
        applyVolatile()
      } catch (e) {
        log.warn(`dsh-rolegroup: settings 变更处理失败（${e?.message ?? e}），保留当前注册表`)
      }
    }, settingsDebounceMs)
    volatileHandle?.unref?.() // 与 createPruneScheduler 同款：防抖定时器不得吊住宿主进程
  }
  try {
    ctx.on('loader/volatile-update', onVolatileUpdate)
  } catch {
    log.warn('dsh-rolegroup: loader/volatile-update 事件不可订阅；面板保存后需重载插件/开新会话才生效')
  }
}

export { Config, ROLEGROUP_ENTRY_ID, apply, inject, name }
export default { Config, apply, inject, name }
