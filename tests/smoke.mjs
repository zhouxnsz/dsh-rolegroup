// dsh-rolegroup smoke test: 离线校验纯逻辑（jsonc 解析、角色合并、实例配置构建）。
// 不依赖 cordis / dsh host 环境。
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createPruneScheduler } from '../lib/startup-scheduler.js'
import { auditRoles, editDistance, normalizeReport, readStartupReport, renderDoctorText, startupReportPath } from '../lib/doctor.js'
import { CONFIG_AGE_HINT_DAYS } from '../lib/doctor.js'
import { installRolegroupCommands, parseRolegroupCommand, runDoctor } from '../lib/command.js'
import { __setTestOverrides, apply } from '../lib/index.js'
import {
  DEFAULT_ROLES,
  TOOL_NAME_RE,
  buildInstanceConfig,
  mergeRoles,
  parseRouteRef,
  resolveRoleRoute,
  roleAnnouncement,
} from '../lib/roles.js'
import {
  DELEGATION_GROUP_ID,
  PERSONA_PLUGIN,
  PRESET_ID_PREFIX,
  buildPresetDefinition,
  buildRolePresetRows,
  cloneEntryList,
  presetDisplayName,
  presetIdOf,
} from '../lib/presets.js'
import { renderBindingsExport } from '../lib/init.js'
import { NAV_ICON_CSS, installSettingsNavIcon, markSettingsNavButton } from '../src/client/settings-nav-icon.js'

// 客户端 controller 的预填 / 「配置文件」按钮会 fetch 宿主接口；单测统一走内存桩，绝不打真实网络。
const realFetch = globalThis.fetch
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, effective: { roles: [] } }) })

/** 内置角色数（派生自内置表：加角色不再需要改 20 处魔法数字）。 */
const BUILTIN_COUNT = Object.keys(DEFAULT_ROLES).length

let passed = 0
function ok(label, fn) {
  fn()
  passed += 1
  console.log(`ok - ${label}`)
}

// --- jsonc ---


// --- mergeRoles ---
ok('mergeRoles: 无配置 → 内置角色表（数量派生自 DEFAULT_ROLES）', () => {
  const { roles, problems } = mergeRoles(undefined)
  assert.equal(problems.length, 0)
  assert.equal(roles.length, BUILTIN_COUNT)
  assert.deepEqual(roles.map((r) => r.toolName), Object.keys(DEFAULT_ROLES))
})

ok('mergeRoles: 覆盖内置角色的模型（v0.5 起不再有 readonly 字段）', () => {
  const { roles, problems } = mergeRoles({ roles: { coder: { model: 'other-model' } } })
  assert.equal(problems.length, 0)
  const coder = roles.find((r) => r.toolName === 'coder')
  assert.equal(coder.provider, 'kimi-coding') // 未覆盖字段继承默认
  assert.equal(coder.model, 'other-model')
  assert.ok(!('readonly' in coder), 'v0.5 起角色对象不得再带 readonly')
})

ok('mergeRoles: 老配置残留 readonly → 报可执行的迁移提示（不静默忽略）', () => {
  const { roles, problems } = mergeRoles({ roles: { coder: { readonly: true } } })
  assert.equal(problems.length, 1, JSON.stringify(problems))
  assert.ok(problems[0].includes('readonly') && problems[0].includes('permission preset'), problems[0])
  // 角色本身照常注册（只警告，不拒收）
  assert.ok(roles.some((r) => r.toolName === 'coder'))
  assert.ok(!('readonly' in roles.find((r) => r.toolName === 'coder')))
})

ok('mergeRoles: 自定义角色 + 非法角色被拒', () => {
  const { roles, problems } = mergeRoles({
    roles: {
      'my-role': { provider: 'p', model: 'm' },      // 非法工具名（含 -）
      my_role: { provider: 'p', model: 'm' },        // 合法自定义
      broken: { provider: 'p' },                     // 缺 model
      wrong_type: 'nope',                            // 非对象
    },
  })
  assert.ok(roles.some((r) => r.toolName === 'my_role' && r.custom))
  assert.ok(!roles.some((r) => r.toolName === 'my-role'))
  assert.ok(!roles.some((r) => r.toolName === 'broken'))
  assert.equal(problems.length, 3)
})

ok('mergeRoles: file:// persona 传递为 personaFile，内联 persona 生效', () => {
  const { roles } = mergeRoles({ roles: { analyst: { persona: 'file://./personas/a.md' }, coder: { persona: '内联' } } })
  assert.equal(roles.find((r) => r.toolName === 'analyst').personaFile, './personas/a.md')
  assert.equal(roles.find((r) => r.toolName === 'coder').persona, '内联')
})

ok('mergeRoles: 根/roles 类型错误', () => {
  assert.equal(mergeRoles([]).problems.length, 1)
  assert.equal(mergeRoles({ roles: [] }).problems.length, 1)
})

// --- v0.6 lib/presets.js：默认 preset 克隆 / persona 替换 / delegation 剔除（plans/v0.6 §13 T1）---
// 背景：dsh 0.2.1 起 persona 只能由 Agent Preset 承载，而显式 preset 会**替换**父组合
// （plans/v0.6 §1.2 P0），故角色 preset = 克隆 deployment 默认 preset 的完整 rows。
class FakeJsExpr { constructor(code) { this.code = code } } // 模拟上游 JsExpr 实例（不可 JSON 深拷）

const BASE_ROWS = [
  { id: 'persona', name: PERSONA_PLUGIN, config: { prefix: '部署默认 persona', suffix: '' } },
  { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
  { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: new FakeJsExpr("process.platform === 'win32'") },
  { id: DELEGATION_GROUP_ID, name: 'cordis:group', group: true, config: [{ id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent' }] },
]
const PRESET_ROLE = { toolName: 'analyst', provider: 'qwen-token-plan-cn', model: 'qwen3.8-max', persona: '你是 analyst。', summary: '需求澄清' }

ok('presets: 命名口径（v0.6/A1）', () => {
  assert.equal(PRESET_ID_PREFIX, 'rolegroup-')
  assert.equal(PERSONA_PLUGIN, '@deepseek-ai/dsh-persona')
  assert.equal(DELEGATION_GROUP_ID, 'delegation')
  assert.equal(presetIdOf('analyst'), 'rolegroup-analyst')
  assert.equal(presetDisplayName('analyst'), '角色：analyst')
  assert.equal(presetDisplayName('analyst', 'qwen3.8-max'), '角色：analyst · qwen3.8-max')
})

ok('presets: cloneEntryList —— 纯对象/数组深拷，JsExpr 实例按引用保留（v0.6/A1）', () => {
  const expr = BASE_ROWS[2].disabled
  const cloned = cloneEntryList(BASE_ROWS)
  assert.notEqual(cloned, BASE_ROWS) // 顶层新数组
  assert.notEqual(cloned[0].config, BASE_ROWS[0].config) // 纯对象深拷
  assert.equal(cloned[2].disabled, expr) // 实例引用不变（关键：JSON 深拷会破坏它）
  cloned[0].config.prefix = '改了'
  assert.equal(BASE_ROWS[0].config.prefix, '部署默认 persona', '不得污染 baseRows')
})

ok('presets: buildRolePresetRows —— 替换 persona 前缀、剔除 delegation、其余原样（v0.6/A1）', () => {
  const rows = buildRolePresetRows(BASE_ROWS, PRESET_ROLE)
  assert.deepEqual(rows.map((r) => r.id), ['persona', 'agent-instructions', 'tool-bash'])
  assert.equal(rows[0].config.prefix, '你是 analyst。')
  assert.equal(rows[0].config.suffix, '', 'persona 行其余字段保留')
  assert.equal(rows[1].config.maxBytes, 65536)
  assert.equal(rows[2].disabled, BASE_ROWS[2].disabled, 'JsExpr 引用保留')
  assert.equal(BASE_ROWS[0].config.prefix, '部署默认 persona', 'baseRows 不被修改')
})

ok('presets: baseRows 非法 / 缺 persona 行时兜底追加（v0.6/A1）', () => {
  assert.throws(() => buildRolePresetRows(undefined, PRESET_ROLE), /base preset/)
  assert.throws(() => buildRolePresetRows([], PRESET_ROLE), /base preset/)
  const noPersona = buildRolePresetRows([{ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' }], PRESET_ROLE)
  assert.deepEqual(noPersona[0], { id: 'persona', name: PERSONA_PLUGIN, config: { prefix: '你是 analyst。' } })
})

ok('presets: buildPresetDefinition 精确形状（v0.6/A1）', () => {
  const def = buildPresetDefinition(BASE_ROWS, PRESET_ROLE, 3)
  assert.equal(def.id, 'rolegroup-analyst')
  assert.equal(def.name, '角色：analyst · qwen3.8-max')
  assert.equal(def.description, '需求澄清 · qwen-token-plan-cn/qwen3.8-max')
  assert.equal(def.order, 203)
  assert.deepEqual(def.plugins.map((r) => r.id), ['persona', 'agent-instructions', 'tool-bash'])
})

// --- buildInstanceConfig ---
ok('buildInstanceConfig: dsh 0.2.1 形状 —— agentPreset 成对 + maxDepth:1 + 无 persona/backgroundMode（v0.6/A2）', () => {
  const { roles } = mergeRoles(undefined)
  const analyst = roles.find((r) => r.toolName === 'analyst')
  const config = buildInstanceConfig(analyst, 'rolegroup-analyst')
  assert.deepEqual(config, {
    provider: 'spawn',
    toolName: 'analyst',
    modelSelectionSettings: false,
    agentOptions: { provider: 'qwen-token-plan-cn', model: 'qwen3.8-max' },
    agentPreset: 'rolegroup-analyst',
    allowedAgentPresets: ['rolegroup-analyst'],
    maxDepth: 1, // 顶层可委派、角色不可再委派（resolveChildDepth 语义实证）
  })
  // 0.2.1 契约：persona/toolFilter/backgroundMode 一律不得出现在实例配置里（出现即被上游 throw）
  for (const forbidden of ['persona', 'toolFilter', 'backgroundMode']) {
    assert.equal(Object.hasOwn(config, forbidden), false, `${forbidden} 不得出现在 0.2.1 实例配置中`)
  }
  assert.equal(Object.hasOwn(config.agentOptions, 'persona'), false)
})

ok('buildInstanceConfig: reasoningEffort 透传 + allowedAgentPresets 单元素（v0.6/A2）', () => {
  const { roles } = mergeRoles({ roles: { coder: { reasoningEffort: 'high' } } })
  const coder = roles.find((r) => r.toolName === 'coder')
  const config = buildInstanceConfig(coder, 'rolegroup-coder')
  assert.deepEqual(config.agentOptions, { provider: 'kimi-coding', model: 'k3.1-pro', reasoningEffort: 'high' })
  assert.deepEqual(config.agentPreset, 'rolegroup-coder')
  assert.deepEqual(config.allowedAgentPresets, ['rolegroup-coder'])
})

ok('roleAnnouncement: 有降级时追加「运行时降级」段；健康时完全不出现（v0.7/AC-12）', () => {
  const roles = [{ toolName: 'scout', provider: 'deepseek-official', model: 'deepseek-flash', summary: '探索定位' }]
  const healthy = roleAnnouncement(roles)
  assert.equal(healthy.includes('运行时降级'), false, '健康时不得出现降级段（否则每次会话都在报错）')
  const degraded = roleAnnouncement(roles, { degradations: ['已剪枝：coder', '注册失败：planner'] })
  assert.ok(degraded.includes('运行时降级'), degraded)
  assert.ok(degraded.includes('已剪枝：coder'), degraded)
  assert.ok(degraded.includes('注册失败：planner'), degraded)
  assert.ok(degraded.includes('/rolegroup doctor'), '降级提示必须指向 doctor（模型据此告知用户怎么修）')
  assert.equal(degraded.includes('`coder`'), false, '降级段不得用反引号包角色名（既有断言靠它判断在册列表）')
})

// --- v0.8/AC-13：多模态角色 vision 的绑定与安全约束 ---
// 选型依据（两条独立证据，写进断言防止随手改坏）：
//   ① 用户长期实践：omo `multimodal-looker` 长期跑 qwen3.8-flash；
//   ② 本项目委托链路探针 scout-02（子会话 OCR）：qwen3.8-flash 10/10；
//      同批 MiniMax-M3 仅 4/10 且**编造**候选字符串 → 必须排除。
ok('roles: vision 角色 —— 绑定 qwen3.8-flash、备用链只含视觉已验证且保证注册的档位（v0.8/AC-13）', () => {
  const { roles } = mergeRoles(undefined)
  const vision = roles.find((r) => r.toolName === 'vision')
  assert.ok(vision, '内置表必须含 vision 角色')
  assert.equal(vision.provider, 'qwen-token-plan-cn')
  assert.equal(vision.model, 'qwen3.8-flash', '选型依据：omo 长期实践 + scout-02 10/10')
  assert.deepEqual(vision.fallbackModels, ['deepseek-account/deepseek-flash', 'deepseek-official/deepseek-flash'],
    '备用链只放 dsh 自带的两个 DeepSeek provider（账号优先），且只放视觉已验证的 flash')
  assert.ok(!JSON.stringify(vision).toLowerCase().includes('minimax'),
    'MiniMax-M3 在 OCR 探针 4/10 且编造内容，绝不可进 vision 的链')
  assert.ok(!JSON.stringify(vision.fallbackModels).includes('v4-pro'),
    'deepseek-v4-pro 的视觉能力未测，不放进视觉角色的链')
  assert.ok(vision.summary.includes('图'), 'summary 必须说清这是看图角色')
  assert.ok(vision.persona.includes('看不清'), `persona 必须含"看不清就说不清"的铁律：${vision.persona}`)
  assert.ok(/绝不猜测|不编造/.test(vision.persona), 'persona 必须禁止猜测/编造')
  assert.ok(vision.persona.includes('read_image'), 'persona 必须点名 read_image 工具（委派只能传文字路径）')
})

ok('所有内置角色名都是合法工具名且唯一', () => {
  const names = Object.keys(DEFAULT_ROLES)
  assert.equal(new Set(names).size, names.length)
  for (const n of names) assert.ok(TOOL_NAME_RE.test(n), n)
})

ok('roleAnnouncement: 包含每个角色与模型 + 0.2.1 委派语义（v0.6/A14）', () => {
  const { roles } = mergeRoles(undefined)
  const text = roleAnnouncement(roles)
  for (const r of roles) {
    assert.ok(text.includes(`\`${r.toolName}\``), r.toolName)
    assert.ok(text.includes(`${r.provider}/${r.model}`), r.toolName)
  }
  assert.ok(text.includes('不可再嵌套委派'), '必须保留"不可再嵌套委派"约定')
  assert.ok(text.includes('立即返回'), '必须说明委派立即返回 subagent id')
  assert.ok(text.includes('完成通知') || text.includes('完成时收到通知'), '必须说明完成通知语义')
  assert.ok(text.includes('description') && text.includes('子任务标题'), '必须要求 description 带模型并说明它会显示为子任务标题')
})

console.log(`\n${passed} passed`)

// --- doctor: 快照读取与归一化（plans/rolegroup-doctor.md T1，AC-1..AC-5）---
// readStartupReport 是异步接口，这里用 await 逐个跑；计数与上方 ok() 共用 passed。
async function okAsync(label, fn) {
  await fn()
  passed += 1
  console.log(`ok - ${label}`)
}

await okAsync('doctor: startupReportPath 与 writeReport 同语义（DSH_HOME 覆盖 / 缺省 ~/.dsh / ~ 展开）（AC-1）', () => {
  const tail = join('plugins', 'dsh-rolegroup', 'last-startup.json')
  assert.equal(startupReportPath({ DSH_HOME: '/tmp/x' }, '/h'), join('/tmp/x', tail))
  // DSH_HOME 为空白串 → 回落 homedir/.dsh
  assert.equal(startupReportPath({ DSH_HOME: '   ' }, '/h'), join('/h', '.dsh', tail))
  assert.equal(startupReportPath({}, '/h'), join('/h', '.dsh', tail))
  // ~/foo 形式按 homedir 展开
  assert.equal(startupReportPath({ DSH_HOME: '~/foo' }, '/h'), join('/h', 'foo', tail))
})

await okAsync('doctor: readStartupReport 指向不存在的 DSH_HOME → missing 且不抛（AC-2）', async () => {
  const state = await readStartupReport({ env: { DSH_HOME: join(tmpdir(), 'dsh-rg-doctor-definitely-missing') }, homedir: '/h' })
  assert.equal(state.kind, 'missing')
  assert.ok(state.path.endsWith(join('plugins', 'dsh-rolegroup', 'last-startup.json')))
})

await okAsync('doctor: readStartupReport 非法 JSON / 根非对象 → unparsable（AC-3）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-doctor-'))
  const dir = join(tmp, 'plugins', 'dsh-rolegroup')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'last-startup.json')
  await writeFile(file, '{ not json')
  const bad = await readStartupReport({ env: { DSH_HOME: tmp } })
  assert.equal(bad.kind, 'unparsable')
  assert.equal(bad.path, file)
  assert.ok(typeof bad.reason === 'string' && bad.reason.length > 0)
  // 根是数组同样归 unparsable
  await writeFile(file, '["array root"]')
  const arr = await readStartupReport({ env: { DSH_HOME: tmp } })
  assert.equal(arr.kind, 'unparsable')
  // 根是字符串同样归 unparsable
  await writeFile(file, '"just a string"')
  const str = await readStartupReport({ env: { DSH_HOME: tmp } })
  assert.equal(str.kind, 'unparsable')
})

await okAsync('doctor: readStartupReport 读真实快照副本 → ok + 7 角色（锁死 H13 形状）（AC-4）', async () => {
  const fixtureHome = fileURLToPath(new URL('./fixtures/dsh-home', import.meta.url))
  // 注入 now（快照时间 2026-09-22T12:09:27.382Z 之后数小时），避免用例随真实日期漂移
  const state = await readStartupReport({ env: { DSH_HOME: fixtureHome }, now: new Date('2026-09-22T20:00:00Z') })
  assert.equal(state.kind, 'ok')
  // 这是**静态夹具**（2026-09-22 的旧快照只有 7 条），与当前内置角色数无关 → 保持字面量
  assert.equal(state.report.registered.length, 7)
  const first = state.report.registered[0]
  assert.equal(first.toolName, 'analyst')
  assert.equal(state.report.time, '2026-09-22T12:09:27.382Z')
  // v0.5 向后兼容：磁盘上仍可能躺着**旧格式快照**（条目带 readonly）。doctor 必须原样容忍，
  // 不得因为多了这个字段就报 anomaly（否则用户升级后一跑 doctor 就满屏告警）。
  assert.deepEqual(state.report.anomalies, [], '旧格式快照（含 readonly）不得产生**字段级**异常')
  // 文件级 anomalies 里可能有一条与 readonly 无关的（mtime 晚于记录时间），但它**不得提到 readonly**
  for (const a of state.anomalies ?? []) {
    assert.ok(!a.includes('readonly'), `旧快照的 readonly 不应被当成异常：${a}`)
  }
})

await okAsync('doctor: 备用档快照字段透传 + 渲染明确标注主路由不可用（chains/AC-3）', async () => {
  const report = normalizeReport({
    time: '2026-11-06T00:00:00.000Z',
    configSource: null,
    registered: [
      { toolName: 'analyst', provider: 'deepseek-official', model: 'deepseek-v4-pro', primary: 'qwen-token-plan-cn/qwen3.8-max', degraded: true },
      { toolName: 'scout', provider: 'deepseek-official', model: 'deepseek-flash' },
    ],
    failed: [], invalid: [], problems: [],
  })
  assert.equal(report.registered[0].primary, 'qwen-token-plan-cn/qwen3.8-max')
  assert.equal(report.registered[0].degraded, true)
  assert.equal('degraded' in report.registered[1], false, '未降级的角色不得凭空多出 degraded')
  const audit = auditRoles(report, { providers: ['deepseek-official'], modelsOf: () => ['deepseek-v4-pro', 'deepseek-flash'] })
  const text = renderDoctorText({ kind: 'ok', path: '/p', report, audit })
  assert.ok(text.includes('主路由 qwen-token-plan-cn/qwen3.8-max 不可用'), text)
  assert.ok(text.includes('deepseek-official/deepseek-v4-pro'), '必须写明实际在用的备用档')
  assert.ok(text.includes('显式配置不做自动降级'), '必须解释为什么配置里的路由没生效')
})

await okAsync('doctor: normalizeReport 容忍缺字段（v0.5：readonly 已不在快照里）（AC-5）', () => {
  assert.deepEqual(normalizeReport({}).registered, [])
  assert.deepEqual(normalizeReport(undefined).registered, [])
  assert.deepEqual(normalizeReport(null).registered, [])
  // registered 非数组 → []
  assert.deepEqual(normalizeReport({ registered: 'nope' }).registered, [])
  const { registered, anomalies } = normalizeReport({ registered: [{ toolName: 'coder', provider: 'p', model: 'm' }] })
  assert.equal(registered.length, 1)
  assert.ok(!('readonly' in registered[0]), 'v0.5 起归一化结果不得再带 readonly')
  // 缺 provider/model 的条目给兜底值并记入 anomalies
  const sparse = normalizeReport({ registered: [{ toolName: 'broken' }] })
  assert.equal(sparse.registered[0].provider, '')
  assert.equal(sparse.registered[0].model, '')
  assert.ok(sparse.anomalies.length >= 1)
  assert.ok(Array.isArray(anomalies))
})

// --- doctor: 判定核心 auditRoles（plans/rolegroup-doctor.md T2，AC-6..AC-12）---
// 说明：计划 §2 返回类型只列了 { verdicts, healthy, unhealthy }，但 AC-10/AC-11 要求
// 产出「快照级独立异常」且 AC-11 明确 verdicts 为 []，故实现做加性扩展：
// 返回值另含 reportIssues: [{ category, issue, hint }]，不改签名与 RoleVerdict 形状。

ok('doctor: auditRoles provider 命中→健康；未命中→false 且 hint 含在用 provider 列表（AC-6）', () => {
  const report = normalizeReport({
    registered: [
      { toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false },
      { toolName: 'fallback', provider: 'example-provider', model: 'example-model', readonly: true },
    ],
  })
  const audit = auditRoles(report, {
    providers: ['kimi-coding', 'qwen-token-plan-cn'],
    modelsOf: (p) => (p === 'kimi-coding' ? ['k3'] : []),
  })
  assert.equal(audit.verdicts.length, 2)
  const hit = audit.verdicts.find((v) => v.toolName === 'coder')
  assert.equal(hit.providerOk, true)
  assert.equal(hit.modelOk, true)
  assert.deepEqual(hit.issues, [])
  assert.deepEqual(hit.hints, [])
  assert.equal(hit.model, 'k3')
  const miss = audit.verdicts.find((v) => v.toolName === 'fallback')
  assert.equal(miss.providerOk, false)
  assert.equal(miss.modelOk, 'unknown') // provider 都没了就不必查模型
  assert.ok(miss.issues.length >= 1)
  assert.ok(miss.hints.length >= 1)
  // actionable 风格对齐 lib/index.js validateRoutes：hint 必须含实际在用 provider 列表
  const hintText = miss.hints.join('\n')
  assert.ok(hintText.includes('kimi-coding'), hintText)
  assert.ok(hintText.includes('qwen-token-plan-cn'), hintText)
  assert.equal(audit.healthy, 1)
  assert.equal(audit.unhealthy, 1)
})

ok('doctor: auditRoles 模型不在广告列表 → modelOk:false + 列前 ≤5 个候选（AC-7）', () => {
  const advertised = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']
  const report = normalizeReport({
    registered: [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3-typo', readonly: false }],
  })
  const audit = auditRoles(report, { providers: ['kimi-coding'], modelsOf: () => advertised })
  const v = audit.verdicts[0]
  assert.equal(v.providerOk, true)
  assert.equal(v.modelOk, false)
  assert.ok(v.issues.length >= 1)
  const issueText = v.issues.join('\n')
  assert.ok(issueText.includes('广告列表'), issueText)
  assert.ok(issueText.includes('kimi-coding'), issueText)
  // 只列前 ≤5 个候选模型名
  assert.ok(issueText.includes('m5'), issueText)
  assert.ok(!issueText.includes('m6'), issueText)
  assert.ok(!issueText.includes('m7'), issueText)
  assert.ok(v.hints.length >= 1)
  assert.equal(audit.healthy, 0)
  assert.equal(audit.unhealthy, 1)
})

ok('doctor: auditRoles providers:null → 全 unknown，healthy===0 且 unhealthy===0（AC-8）', () => {
  const report = normalizeReport({
    registered: [
      { toolName: 'analyst', provider: 'qwen-token-plan-cn', model: 'qwen3.8-max', readonly: true },
      { toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false },
    ],
  })
  const audit = auditRoles(report, { providers: null })
  assert.equal(audit.verdicts.length, 2)
  for (const v of audit.verdicts) {
    assert.equal(v.providerOk, 'unknown')
    assert.equal(v.modelOk, 'unknown')
    assert.ok(v.issues.some((i) => i.includes('未做运行时校验')), v.issues.join('\n'))
  }
  // 铁律：unknown 绝不允许计入 healthy；同时未知 ≠ 异常
  assert.equal(audit.healthy, 0)
  assert.equal(audit.unhealthy, 0)
  assert.deepEqual(audit.reportIssues, [])
})

ok("doctor: auditRoles modelsOf 返回 null/未提供 → modelOk:'unknown' 但不算异常（AC-9）", () => {
  const report = normalizeReport({
    registered: [
      { toolName: 'analyst', provider: 'qwen', model: 'qwen3.8-max', readonly: true },
      { toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false },
    ],
  })
  // coder 的 provider 拉取模型列表失败（null）→ 软校验降级，不计异常
  const audit = auditRoles(report, {
    providers: ['qwen', 'kimi-coding'],
    modelsOf: (p) => (p === 'qwen' ? ['qwen3.8-max'] : null),
  })
  const softUnknown = audit.verdicts.find((v) => v.toolName === 'coder')
  assert.equal(softUnknown.providerOk, true)
  assert.equal(softUnknown.modelOk, 'unknown')
  assert.deepEqual(softUnknown.issues, [])
  assert.equal(audit.healthy, 1) // 只有 analyst 全绿
  assert.equal(audit.unhealthy, 0)
  // modelsOf 整个未提供 → 同样降级为 unknown
  const noModelsOf = auditRoles(report, { providers: ['qwen', 'kimi-coding'] })
  for (const v of noModelsOf.verdicts) {
    assert.equal(v.providerOk, true)
    assert.equal(v.modelOk, 'unknown')
    assert.deepEqual(v.issues, [])
  }
})

ok('doctor: auditRoles 快照 invalid/failed/problems 非空 → 各产出独立异常且 hint 不同（AC-10）', () => {
  const report = normalizeReport({
    configSource: '/proj/.dsh/rolegroup.jsonc',
    registered: [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false }],
    failed: ['scribe'],
    invalid: [{ toolName: 'fallback', reason: 'provider "example-provider" 未注册' }],
    problems: ['roles.broken 缺 model'],
  })
  const audit = auditRoles(report, { providers: ['kimi-coding'], modelsOf: () => ['k3'] })
  // 在册角色本身全绿
  assert.equal(audit.healthy, 1)
  assert.deepEqual(audit.verdicts[0].issues, [])
  // 三类快照异常各自独立产出
  assert.equal(audit.reportIssues.length, 3)
  const byCategory = Object.fromEntries(audit.reportIssues.map((r) => [r.category, r]))
  assert.ok(byCategory.failed.issue.includes('scribe'))
  assert.ok(byCategory.invalid.issue.includes('fallback'))
  assert.ok(byCategory.problems.issue.includes('缺 model'))
  // hint 各不相同且指向不同修复方向：invalid → provider 配置；problems → jsonc 文件与 configSource
  assert.ok(byCategory.invalid.hint.includes('provider'), byCategory.invalid.hint)
  assert.ok(byCategory.problems.hint.includes('jsonc'), byCategory.problems.hint)
  assert.ok(byCategory.problems.hint.includes('/proj/.dsh/rolegroup.jsonc'), byCategory.problems.hint)
  const hints = audit.reportIssues.map((r) => r.hint)
  assert.equal(new Set(hints).size, hints.length)
  assert.equal(audit.unhealthy, 3)
})

ok('doctor: auditRoles 空角色表 → verdicts:[] + 「无任何在册角色」异常（AC-11）', () => {
  const audit = auditRoles(normalizeReport({}), { providers: ['kimi-coding'] })
  assert.deepEqual(audit.verdicts, [])
  assert.equal(audit.healthy, 0)
  assert.equal(audit.unhealthy, 1)
  assert.equal(audit.reportIssues.length, 1)
  assert.ok(audit.reportIssues[0].issue.includes('无任何在册角色'), audit.reportIssues[0].issue)
  assert.ok(audit.reportIssues[0].hint.length > 0)
})

ok('doctor: auditRoles 纯函数性：无 await/Date.now/env/请求，同入参同出（AC-12）', () => {
  const src = auditRoles.toString()
  assert.ok(!/\bawait\b/.test(src), 'auditRoles 函数体内不得有 await')
  assert.ok(!/Date\.now|new Date|process\.env|fetch\(|import\(/.test(src), 'auditRoles 不得调 Date/env/请求/动态 import')
  const report = normalizeReport({
    registered: [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false }],
  })
  const opts = { providers: ['kimi-coding'], modelsOf: () => ['k3'] }
  assert.deepEqual(auditRoles(report, opts), auditRoles(report, opts))
})

// --- doctor: 渲染 renderDoctorText + 命令面（plans/rolegroup-doctor.md T3，AC-13..AC-19）---

ok('doctor: renderDoctorText 输出含每个角色的 toolName / provider/model（v0.5 起无权限列）（AC-13）', () => {
  const report = normalizeReport({
    time: '2026-09-22T12:09:27.382Z',
    configSource: '/proj/.dsh/rolegroup.jsonc',
    registered: [
      { toolName: 'analyst', provider: 'qwen', model: 'qwen3.8-max', readonly: true },
      { toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false },
      { toolName: 'fallback', provider: 'example-provider', model: 'example-model', readonly: true },
    ],
  })
  const audit = auditRoles(report, {
    providers: ['qwen', 'kimi-coding'],
    modelsOf: () => ['qwen3.8-max', 'k3'],
  })
  const text = renderDoctorText({ kind: 'ok', path: '/p', report }, audit)
  for (const r of report.registered) {
    assert.ok(text.includes(r.toolName), r.toolName)
    assert.ok(text.includes(`${r.provider}/${r.model}`), r.toolName)
  }
  // v0.5：权限列已随 readonly 移除；表头不再是「角色/绑定模型/权限/provider/模型」
  assert.ok(!text.includes('权限'), 'doctor 表格不得再有权限列')
  assert.ok(text.includes('角色') && text.includes('绑定模型'))
  assert.ok(text.includes('✅'))
  assert.ok(text.includes('❌')) // fallback provider 未注册
  assert.ok(text.includes('➖')) // provider 没了就不必查模型
})

ok('doctor: renderDoctorText 首行含在册数/快照时间/configSource（null→内置默认表）（AC-14）', () => {
  const mk = (configSource) => normalizeReport({
    time: '2026-09-22T12:09:27.382Z',
    ...(configSource === null ? {} : { configSource }),
    registered: [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false }],
  })
  const auditOf = (report) => auditRoles(report, { providers: ['kimi-coding'], modelsOf: () => ['k3'] })
  const text = renderDoctorText({ kind: 'ok', path: '/p', report: mk(null) }, auditOf(mk(null)))
  const firstLine = text.split('\n')[0]
  assert.ok(firstLine.includes('1 个在册角色'), firstLine)
  assert.ok(text.includes('2026-09-22T12:09:27.382Z'))
  assert.ok(text.includes('内置默认表'))
  assert.ok(!text.includes('null'))
  const withSource = renderDoctorText({ kind: 'ok', path: '/p', report: mk('/proj/.dsh/rolegroup.jsonc') }, auditOf(mk('/proj/.dsh/rolegroup.jsonc')))
  assert.ok(withSource.includes('/proj/.dsh/rolegroup.jsonc'))
})

ok('doctor: renderDoctorText 全绿含「无异常」；有异常含「修复」且异常条数=unhealthy（AC-15）', () => {
  // 全绿
  const green = normalizeReport({
    registered: [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false }],
  })
  const greenText = renderDoctorText({ kind: 'ok', path: '/p', report: green }, auditRoles(green, { providers: ['kimi-coding'], modelsOf: () => ['k3'] }))
  assert.ok(greenText.includes('无异常'))
  assert.ok(!greenText.includes('修复'))
  // 1 项异常
  const report = normalizeReport({
    registered: [
      { toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false },
      { toolName: 'fallback', provider: 'example-provider', model: 'example-model', readonly: true },
    ],
  })
  const audit = auditRoles(report, { providers: ['kimi-coding'], modelsOf: () => ['k3'] })
  assert.equal(audit.unhealthy, 1)
  const text = renderDoctorText({ kind: 'ok', path: '/p', report }, audit)
  assert.ok(text.includes('修复'))
  const blockLines = text.split('\n').filter((l) => l.startsWith('❌ '))
  assert.equal(blockLines.length, audit.unhealthy)
  assert.ok(text.includes('除上述 1 项外无异常'), text.split('\n').at(-1))
  // llm 不可用（providers:null）→ 不算异常，但必须明示「未做运行时校验」（D2：不许静默显示 ✅）
  const unknownAudit = auditRoles(report, { providers: null })
  assert.equal(unknownAudit.unhealthy, 0)
  const unknownText = renderDoctorText({ kind: 'ok', path: '/p', report }, unknownAudit)
  assert.ok(unknownText.includes('未做运行时校验'))
  assert.ok(unknownText.includes('无异常'))
  assert.equal(unknownText.split('\n').filter((l) => l.startsWith('❌ ')).length, 0)
})

ok('doctor: renderDoctorText 异常 >10 条折叠「还有 N 条」，单角色 hint ≤3 条（契约红线 4）', () => {
  const registered = Array.from({ length: 11 }, (_, i) => ({ toolName: `role_${i}`, provider: 'nope', model: 'm', readonly: true }))
  const report = normalizeReport({ registered })
  const audit = auditRoles(report, { providers: ['kimi-coding'] })
  assert.equal(audit.unhealthy, 11)
  const text = renderDoctorText({ kind: 'ok', path: '/p', report }, audit)
  const blockLines = text.split('\n').filter((l) => l.startsWith('❌ '))
  assert.equal(blockLines.length, 10)
  assert.ok(text.includes('还有 1 条'))
  // 渲染层防御：verdict 携带 4 条 hint 时只渲染前 3 条
  const fakeAudit = {
    verdicts: [{ toolName: 'x', model: 'm', readonly: true, providerOk: false, modelOk: 'unknown', issues: ['i1'], hints: ['h1', 'h2', 'h3', 'h4'] }],
    reportIssues: [],
    healthy: 0,
    unhealthy: 1,
  }
  const text2 = renderDoctorText(
    { kind: 'ok', path: '/p', report: normalizeReport({ registered: [{ toolName: 'x', provider: 'nope', model: 'm', readonly: true }] }) },
    fakeAudit,
  )
  assert.ok(text2.includes('h3'))
  assert.ok(!text2.includes('h4'))
})

ok('command: parseRolegroupCommand 子命令解析，不做前缀模糊匹配（AC-16）', () => {
  assert.deepEqual(parseRolegroupCommand(''), { kind: 'usage' })
  assert.deepEqual(parseRolegroupCommand('   '), { kind: 'usage' })
  assert.deepEqual(parseRolegroupCommand(' doctor '), { kind: 'doctor' })
  assert.deepEqual(parseRolegroupCommand('doctor'), { kind: 'doctor' })
  assert.deepEqual(parseRolegroupCommand('doctor extra'), { kind: 'doctor' })
  assert.deepEqual(parseRolegroupCommand('docto'), { kind: 'unknown', sub: 'docto' })
  assert.deepEqual(parseRolegroupCommand('--help'), { kind: 'usage' })
  assert.deepEqual(parseRolegroupCommand('-h'), { kind: 'usage' })
  assert.deepEqual(parseRolegroupCommand('help'), { kind: 'usage' })
  assert.deepEqual(parseRolegroupCommand('init'), { kind: 'init' })
  assert.deepEqual(parseRolegroupCommand(' init '), { kind: 'init' })
  // 自 v0.11 起 init 只是导出器：旧标志一律视为未知子命令（不许静默忽略）
  assert.deepEqual(parseRolegroupCommand('init --write'), { kind: 'unknown', sub: 'init --write' })
  assert.deepEqual(parseRolegroupCommand('init --force'), { kind: 'unknown', sub: 'init --force' })
})

// --- /rolegroup init：按本机可用路由生成起始配置（layer 2）---
ok('init: 导出当前生效绑定为 JSONC 文本（不再落盘/不再作为配置来源）（v0.11/AC-1）', () => {
  const text = renderBindingsExport({ generatedAt: '2026-11-13' })
  assert.ok(text.includes('"roles"'), text)
  assert.ok(text.includes('生成时间：2026-11-13'), text)
  assert.ok(text.includes('不再作为配置来源'), '导出文本必须说明它只是参考')
  // 8 个内置角色全在，且每行带 provider/model
  for (const name of Object.keys(DEFAULT_ROLES)) assert.ok(text.includes(`"${name}"`), `导出必须包含 ${name}`)
  // 合法性：去掉注释后是合法 JSON
  const stripped = text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  const parsed = JSON.parse(stripped)
  assert.deepEqual(Object.keys(parsed.roles).sort(), Object.keys(DEFAULT_ROLES).sort())
  // 不再提供落盘函数
  assert.equal(typeof renderBindingsExport, 'function')
})

await okAsync('command: /rolegroup init 只导出绑定文本、不写任何文件（v0.11/AC-2）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-init-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  try {
    let captured
    const fakeCommands = { list: () => [], register: (definition) => { captured = definition; return () => {} } }
    const llm = {
      listProviders: () => [{ id: 'deepseek-official' }],
      listModels: async () => [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }],
    }
    const fakeCtx = { get: (n) => (n === 'commands' ? fakeCommands : n === 'llm' ? llm : undefined), effect: (fn) => fn(), logger: { warn: () => {} } }
    installRolegroupCommands(fakeCtx)

    const printed = await captured.handler({ rawInput: 'init' })
    assert.equal(printed.kind, 'success', printed.text)
    assert.ok(printed.text.includes('"analyst"'), '导出必须含角色')
    assert.ok(printed.text.includes('不再作为配置来源'), '导出文本必须说明它只是参考')
    assert.equal(existsSync(join(tmp, 'rolegroup.jsonc')), false, 'init 不得写任何配置文件')

    const unknown = await captured.handler({ rawInput: 'init --write' })
    assert.equal(unknown.kind, 'error', '旧的 --write 必须报未知，不许静默忽略')
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

ok('command: installRolegroupCommands 无 commands 服务时不抛、只 warn（AC-17）', () => {
  const warnings = []
  const fakeCtx = { get: () => undefined, logger: { warn: (m) => warnings.push(m) } }
  assert.doesNotThrow(() => installRolegroupCommands(fakeCtx))
  assert.equal(warnings.length, 1)
  // ctx 连 get 都没有也不抛（契约红线 1）
  assert.doesNotThrow(() => installRolegroupCommands({ logger: { warn: () => {} } }))
})

ok('command: 注册元数据 name/description/input.hint，无 attachments，注册包在 ctx.effect 内（AC-18）', () => {
  let captured
  let effectUsed = false
  const fakeCommands = {
    list: () => [],
    register: (def) => { captured = def; return () => {} },
  }
  const fakeCtx = {
    get: (n) => (n === 'commands' ? fakeCommands : undefined),
    effect: (fn) => { effectUsed = true; return fn() },
    logger: { warn: () => {} },
  }
  installRolegroupCommands(fakeCtx)
  assert.ok(effectUsed, '注册必须包在 ctx.effect 里（H12 生命周期回收）')
  assert.equal(captured.name, 'rolegroup')
  assert.ok(typeof captured.description === 'string' && captured.description.length > 0 && captured.description.length <= 80, captured.description)
  assert.equal(captured.input?.hint, '[doctor|init]')
  assert.equal(captured.input?.attachments, undefined)
  assert.equal(typeof captured.handler, 'function')
})

ok('command: 同名命令已存在时 warn 并放弃注册，不抢占（RK1）', () => {
  const warnings = []
  let registerCalled = false
  const fakeCtx = {
    get: (n) => (n === 'commands' ? {
      list: () => [{ name: 'rolegroup' }],
      register: () => { registerCalled = true; return () => {} },
    } : undefined),
    effect: (fn) => fn(),
    logger: { warn: (m) => warnings.push(m) },
  }
  assert.doesNotThrow(() => installRolegroupCommands(fakeCtx))
  assert.equal(registerCalled, false)
  assert.equal(warnings.length, 1)
})

ok('command: apply 时 commands 未激活 → ctx.inject 延迟注册（2026-09-23 实证 bug 回归测试）', () => {
  // 复现宿主时序：get('commands') strict 模式只返活动 fiber 的实现，dsh-commands
  // 晚于本插件就绪时 apply 拿到 undefined。修法：ctx.inject(['commands'], cb) 待就绪。
  let injectCb
  let captured
  const fakeCtx = {
    get: () => undefined, // apply 时尚未激活
    inject: (deps, cb) => { assert.deepEqual(deps, ['commands']); injectCb = cb },
    logger: { warn: (m) => { throw new Error(`不应走到 warn：${m}`) } },
  }
  installRolegroupCommands(fakeCtx)
  assert.equal(typeof injectCb, 'function', '未激活时必须走 ctx.inject 通道而不是 warn 放弃')
  // 宿主稍后就绪，回调拿到带 commands 的子 ctx
  injectCb({
    commands: { list: () => [], register: (def) => { captured = def; return () => {} } },
    effect: (fn) => fn(),
    logger: { warn: () => {} },
  })
  assert.equal(captured?.name, 'rolegroup')
})

await okAsync('command: runDoctor 端到端（假 llm）：去重后 provider 各查一次（RK2），输出含表格', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-cmd-'))
  const dir = join(tmp, 'plugins', 'dsh-rolegroup')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'last-startup.json'), JSON.stringify({
    time: '2026-09-22T12:09:27.382Z',
    configSource: null,
    registered: [
      { toolName: 'planner', provider: 'kimi-coding', model: 'k3', readonly: false },
      { toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false },
    ],
    failed: [],
    invalid: [],
    problems: [],
  }))
  const calls = []
  const fakeLlm = {
    listProviders: () => [{ id: 'kimi-coding' }, { id: 'qwen' }],
    listModels: async (p) => { calls.push(p); return [{ id: 'k3' }] },
  }
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  try {
    const text = await runDoctor({ get: (n) => (n === 'llm' ? fakeLlm : undefined) }, new AbortController().signal)
    assert.ok(text.includes('2 个在册角色'), text)
    assert.ok(text.includes('planner'))
    assert.ok(text.includes('kimi-coding/k3'))
    assert.ok(text.includes('无异常'))
    // RK2：两个角色同 provider → 去重后只查一次
    assert.deepEqual(calls, ['kimi-coding'])
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
  }
})

await okAsync('command: runDoctor 尊重 signal.aborted：立刻返回且不发 listModels（契约红线 3）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-cmd-'))
  const dir = join(tmp, 'plugins', 'dsh-rolegroup')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'last-startup.json'), JSON.stringify({
    registered: [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false }],
  }))
  const calls = []
  const fakeLlm = {
    listProviders: () => [{ id: 'kimi-coding' }],
    listModels: async (p) => { calls.push(p); return [] },
  }
  const controller = new AbortController()
  controller.abort()
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  try {
    const text = await runDoctor({ get: (n) => (n === 'llm' ? fakeLlm : undefined) }, controller.signal)
    assert.equal(calls.length, 0)
    assert.ok(text.includes('已取消'), text)
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
  }
})

// --- doctor: 新鲜度检测 staleness 与「快照 ≠ 现状」提示（plans/rolegroup-doctor.md T4，AC-20..AC-22）---
// 设计选择（AC-22 的两条路线）：选「readStartupReport 返回加性字段 state.anomalies」。
// 理由：readStartupReport 本就独占快照文件 IO（readFile），mtime 比对所需的 stat 放这里
// 可让全部文件 IO 收拢一处；若走 renderDoctorText 参数路线，则 command.js 得自己 stat，
// 路径/IO 知识被拆进适配器层，且渲染层签名要为一个可选提示扩容。

await okAsync('doctor: readStartupReport 快照超 7 天 → stale，渲染顶部提示且表格照常输出（AC-20）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-stale-'))
  const dir = join(tmp, 'plugins', 'dsh-rolegroup')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'last-startup.json')
  const contentTime = new Date('2026-09-10T00:00:00.000Z')
  await writeFile(file, JSON.stringify({
    time: contentTime.toISOString(),
    registered: [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false }],
  }))
  // mtime 对齐内容时间：隔离 AC-22 的 mtime 异常，本用例只验 stale 分支
  await utimes(file, contentTime, contentTime)

  const state = await readStartupReport({ env: { DSH_HOME: tmp }, now: new Date('2026-09-20T00:00:00Z') })
  assert.equal(state.kind, 'stale')
  assert.equal(state.ageDays, 10)
  assert.equal(state.report.registered.length, 1)

  const audit = auditRoles(state.report, { providers: ['kimi-coding'], modelsOf: () => ['k3'] })
  const text = renderDoctorText(state, audit)
  // 顶部显著提示（AC-20 文案）
  assert.ok(text.includes('快照已 10 天未更新'), text)
  assert.ok(text.includes('可能不代表当前状态'), text)
  assert.ok(text.includes('重启 dsh web'), text)
  const staleLineIndex = text.split('\n').findIndex((l) => l.includes('快照已 10 天未更新'))
  assert.ok(staleLineIndex >= 0 && staleLineIndex <= 2, `stale 提示必须在顶部（实际第 ${staleLineIndex + 1} 行）`)
  // 表格仍然照常输出，不因过期罢工
  assert.ok(text.includes('coder'))
  assert.ok(text.includes('kimi-coding/k3'))
  assert.ok(text.includes('无异常'))

  // 边界：恰好 7 天 → 不判 stale（须严格大于 staleAfterDays）
  const boundary = await readStartupReport({ env: { DSH_HOME: tmp }, now: new Date('2026-09-17T00:00:00Z') })
  assert.equal(boundary.kind, 'ok')
  assert.equal(boundary.ageDays, 7)
  // staleAfterDays 可注入：阈值 3 天时 5 天前的快照 → stale
  const custom = await readStartupReport({ env: { DSH_HOME: tmp }, now: new Date('2026-09-15T00:00:00Z'), staleAfterDays: 3 })
  assert.equal(custom.kind, 'stale')
  assert.equal(custom.ageDays, 5)
  // 新鲜快照 → ok，ageDays 照常给出（供「（N 天前）」后缀）
  const fresh = await readStartupReport({ env: { DSH_HOME: tmp }, now: new Date('2026-09-12T00:00:00Z') })
  assert.equal(fresh.kind, 'ok')
  assert.equal(fresh.ageDays, 2)
})

await okAsync('doctor: readStartupReport time 缺失/非法 ISO → 不判 stale、ageDays:null、渲染「快照时间未知」（AC-21）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-notime-'))
  const dir = join(tmp, 'plugins', 'dsh-rolegroup')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'last-startup.json')
  const registered = [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false }]
  const auditOf = (report) => auditRoles(report, { providers: ['kimi-coding'], modelsOf: () => ['k3'] })
  // now 远在 7 天之后：若误判 stale 本用例会立刻抓到
  const farFuture = new Date('2030-01-01T00:00:00Z')

  // time 缺失
  await writeFile(file, JSON.stringify({ registered }))
  const noTime = await readStartupReport({ env: { DSH_HOME: tmp }, now: farFuture })
  assert.equal(noTime.kind, 'ok')
  assert.equal(noTime.ageDays, null)
  const noTimeText = renderDoctorText(noTime, auditOf(noTime.report))
  assert.ok(noTimeText.includes('快照时间未知'), noTimeText)
  assert.ok(!noTimeText.includes('快照已'), noTimeText)

  // time 非法 ISO
  await writeFile(file, JSON.stringify({ time: 'not-a-date', registered }))
  const badTime = await readStartupReport({ env: { DSH_HOME: tmp }, now: farFuture })
  assert.equal(badTime.kind, 'ok')
  assert.equal(badTime.ageDays, null)
  const badTimeText = renderDoctorText(badTime, auditOf(badTime.report))
  assert.ok(badTimeText.includes('快照时间未知'), badTimeText)
  assert.ok(!badTimeText.includes('快照已'), badTimeText)
})

await okAsync('doctor: readStartupReport mtime 晚于内容记录时间 → 追加「被改写过」anomaly（AC-22）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-mtime-'))
  const dir = join(tmp, 'plugins', 'dsh-rolegroup')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'last-startup.json')
  const contentTime = new Date('2026-09-20T00:00:00.000Z')
  await writeFile(file, JSON.stringify({
    time: contentTime.toISOString(),
    registered: [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false }],
  }))
  const now = new Date('2026-09-21T00:00:00Z') // 内容 1 天前，落在新鲜档

  // mtime 与内容时间一致（合法写入）→ 无 anomaly
  await utimes(file, contentTime, contentTime)
  const clean = await readStartupReport({ env: { DSH_HOME: tmp }, now })
  assert.equal(clean.kind, 'ok')
  assert.deepEqual(clean.anomalies, [])

  // mtime 比内容记录时间晚两天（排障时手工编辑后忘恢复）→ anomaly
  const later = new Date('2026-09-22T00:00:00.000Z')
  await utimes(file, later, later)
  const touched = await readStartupReport({ env: { DSH_HOME: tmp }, now })
  assert.equal(touched.kind, 'ok')
  assert.ok(touched.anomalies.some((a) => a.includes('改写过')), JSON.stringify(touched.anomalies))
  const audit = auditRoles(touched.report, { providers: ['kimi-coding'], modelsOf: () => ['k3'] })
  const text = renderDoctorText(touched, audit)
  assert.ok(text.includes('改写过'), text)
})

// --- doctor: 建议质量增强（plans/rolegroup-doctor.md T5，AC-23..AC-25）---
// 计数口径（先于实现拍板）：
// - AC-23「路由已声明但未激活」= 原「provider 当前未注册」硬诊断的更精确版本：providerOk 仍
//   false、角色仍计入 unhealthy（当前确实不可委派），只是措辞更准、hint 指向 GUI 设置页 settingsNs。
// - AC-24 内置角色缺席 = 提示级 ⚠️（同 T4 anomalies 口径）：缺席角色不在 registered 里，无法判定
//   其健康度；且可能是有意删配置（预期）也可能被剪枝（症状），故不计入 healthy/unhealthy。
// - AC-25 近似模型名建议 = 提示级：追加到已因 modelOk:false 计入 unhealthy 的角色 hint 上，
//   不改变计数；单角色 hint 仍 ≤3 条（契约红线 4）。
// 签名说明：计划 §2 预留 configurableErrors?: ReadonlyMap<string, string>，但 AC-23 的 hint 需要
// settingsNs（H10），纯 string 值承载不了 → 加性扩展为 string | {error?, settingsNs?, displayName?}，
// string 值保持原语义（仅有 error 文本）。Map 形状与参数名不变。

ok('doctor: auditRoles provider 已声明未激活 → 措辞精确化 + error 原文 + settingsNs hint，仍计入 unhealthy（AC-23）', () => {
  const report = normalizeReport({
    registered: [{ toolName: 'fallback', provider: 'example-provider', model: 'example-model', readonly: true }],
  })
  const audit = auditRoles(report, {
    providers: ['kimi-coding'],
    modelsOf: () => ['k3'],
    configurableErrors: new Map([['example-provider', { error: '缺少 API key（providers.example-provider.apiKey 为空）', settingsNs: 'llm.providers', displayName: 'Example' }]]),
  })
  const v = audit.verdicts[0]
  assert.equal(v.providerOk, false) // 替换原「未注册」硬诊断，仍不健康
  assert.equal(audit.unhealthy, 1)
  const issueText = v.issues.join('\n')
  assert.ok(issueText.includes('路由已声明但未激活'), issueText)
  assert.ok(issueText.includes('缺少 API key（providers.example-provider.apiKey 为空）'), issueText) // error 原样带上
  assert.ok(!issueText.includes('当前未注册'), issueText) // 更精确措辞替换旧措辞
  const hintText = v.hints.join('\n')
  assert.ok(hintText.includes('设置页'), hintText)
  assert.ok(hintText.includes('llm.providers'), hintText) // hint 指向 GUI 设置页 settingsNs
  // 兼容计划 §2 原始形态：Map 值是纯 error 字符串时同样生效（无 settingsNs 则退回通用修复建议）
  const legacy = auditRoles(report, {
    providers: ['kimi-coding'],
    configurableErrors: new Map([['example-provider', 'key 未配置']]),
  })
  assert.ok(legacy.verdicts[0].issues.join('\n').includes('路由已声明但未激活'))
  assert.ok(legacy.verdicts[0].issues.join('\n').includes('key 未配置'))
  // 不在 configurable 列表里的 provider → 保持原「当前未注册」措辞（真·完全不存在）
  const plain = auditRoles(report, { providers: ['kimi-coding'] })
  assert.ok(plain.verdicts[0].issues.join('\n').includes('当前未注册'))
})

await okAsync('command: runDoctor 接 listConfigurableProviders；API 缺失/抛错时静默降级（AC-23 取数侧）', async () => {
  const mkHome = async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-cfg-'))
    const dir = join(tmp, 'plugins', 'dsh-rolegroup')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'last-startup.json'), JSON.stringify({
      time: '2026-09-22T12:09:27.382Z',
      registered: [{ toolName: 'fallback', provider: 'example-provider', model: 'example-model', readonly: true }],
    }))
    return tmp
  }
  const prev = process.env.DSH_HOME
  try {
    // 有 listConfigurableProviders → 精确措辞 + error 原文 + settingsNs 指路
    process.env.DSH_HOME = await mkHome()
    const llm1 = {
      listProviders: () => [{ id: 'kimi-coding' }],
      listModels: async () => [{ id: 'k3' }],
      listConfigurableProviders: () => [
        { provider: 'example-provider', displayName: 'Example', settingsNs: 'llm.providers', settingsPath: ['example-provider'], error: '缺少 API key' },
      ],
    }
    const text1 = await runDoctor({ get: (n) => (n === 'llm' ? llm1 : undefined) }, new AbortController().signal)
    assert.ok(text1.includes('路由已声明但未激活'), text1)
    assert.ok(text1.includes('缺少 API key'), text1)
    assert.ok(text1.includes('llm.providers'), text1)
    assert.ok(!text1.includes('当前未注册'), text1)
    // 无 listConfigurableProviders（老主机，?. 可选调用）→ 静默降级为现状措辞，不抛
    process.env.DSH_HOME = await mkHome()
    const llm2 = {
      listProviders: () => [{ id: 'kimi-coding' }],
      listModels: async () => [{ id: 'k3' }],
    }
    const text2 = await runDoctor({ get: (n) => (n === 'llm' ? llm2 : undefined) }, new AbortController().signal)
    assert.ok(text2.includes('当前未注册'), text2)
    assert.ok(!text2.includes('路由已声明但未激活'), text2)
    // listConfigurableProviders 抛错 → 同样静默降级（try/catch）
    process.env.DSH_HOME = await mkHome()
    const llm3 = {
      listProviders: () => [{ id: 'kimi-coding' }],
      listModels: async () => [{ id: 'k3' }],
      listConfigurableProviders: () => { throw new Error('boom') },
    }
    const text3 = await runDoctor({ get: (n) => (n === 'llm' ? llm3 : undefined) }, new AbortController().signal)
    assert.ok(text3.includes('当前未注册'), text3)
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
  }
})

ok('doctor: auditRoles 内置角色缺席快照 → missingDefaults 提示级 ⚠️ 不计入 unhealthy，渲染显式缺席（AC-24 负向：删 scout）', () => {
  const { roles } = mergeRoles(undefined) // 内置角色
  // 负向构造：删掉 scout 的快照
  const withoutScout = normalizeReport({
    registered: roles.filter((r) => r.toolName !== 'scout').map((r) => ({
      toolName: r.toolName, provider: r.provider, model: r.model, readonly: r.readonly,
    })),
  })
  assert.equal(withoutScout.registered.length, BUILTIN_COUNT - 1, '删掉 scout 后剩内置角色数 - 1')
  const providers = ['qwen-token-plan-cn', 'kimi-coding', 'deepseek-official', 'example-provider']
  const modelsByProvider = {
    'qwen-token-plan-cn': ['qwen3.8-max', 'qwen3.8-flash'],
    'kimi-coding': ['k3', 'k3.1-pro'],
    'deepseek-official': ['deepseek-flash'],
    "example-provider": ['example-model'],
  }
  const modelsOf = (p) => modelsByProvider[p] ?? null
  const audit = auditRoles(withoutScout, { providers, modelsOf })
  // 在册 6 角色全绿，缺席提示不影响计数（提示级，同 T4 anomalies 口径）
  assert.equal(audit.healthy, BUILTIN_COUNT - 1, '在册角色全绿，缺席提示不影响计数')
  assert.equal(audit.unhealthy, 0)
  assert.equal(audit.missingDefaults.length, 1)
  assert.equal(audit.missingDefaults[0].toolName, 'scout')
  assert.ok(audit.missingDefaults[0].issue.includes('角色 scout 未在册'), audit.missingDefaults[0].issue)
  assert.ok(audit.missingDefaults[0].issue.includes('剪枝'), audit.missingDefaults[0].issue)
  // 渲染：⚠️ 提示行出现，总结仍是「无异常」，无 ❌ 异常块
  const text = renderDoctorText({ kind: 'ok', path: '/p', report: withoutScout }, audit)
  assert.ok(text.includes('角色 scout 未在册（可能被剪枝或配置删除）'), text)
  assert.ok(text.includes('无异常'), text)
  assert.equal(text.split('\n').filter((l) => l.startsWith('❌ ')).length, 0)
  // 完整内置角色快照 → 无缺席提示
  const full = normalizeReport({
    registered: roles.map((r) => ({ toolName: r.toolName, provider: r.provider, model: r.model, readonly: r.readonly })),
  })
  const fullAudit = auditRoles(full, { providers, modelsOf })
  assert.deepEqual(fullAudit.missingDefaults, [])
  assert.equal(fullAudit.healthy, BUILTIN_COUNT)
})

ok('doctor: auditRoles 模型名近似建议：edit-distance ≤2 或互为前缀 → hint 追加「是否想用」（AC-25）', () => {
  // editDistance 纯函数基本性质
  assert.equal(editDistance('k3', 'k3'), 0)
  assert.equal(editDistance('example-model', 'example-models'), 1)
  assert.equal(editDistance('abc', 'xyz'), 3)
  assert.equal(editDistance('', 'ab'), 2)
  assert.equal(editDistance('ab', ''), 2)
  const report = normalizeReport({
    registered: [
      { toolName: 'typo1', provider: 'p1', model: 'example-models', readonly: true }, // edit distance 1
      { toolName: 'typo2', provider: 'p2', model: 'k3-turbo', readonly: true }, // 与广告名互为前缀（距离 6）
      { toolName: 'typo3', provider: 'p3', model: 'totally-different', readonly: true }, // 无近似 → 不追加
    ],
  })
  const audit = auditRoles(report, {
    providers: ['p1', 'p2', 'p3'],
    modelsOf: (p) => ({ p1: ['example-model'], p2: ['k3'], p3: ['m9'] })[p],
  })
  assert.equal(audit.unhealthy, 3) // 三个角色 modelOk:false，建议不改变计数
  const v1 = audit.verdicts.find((v) => v.toolName === 'typo1')
  assert.equal(v1.modelOk, false)
  assert.ok(v1.hints.some((h) => h.includes('是否想用') && h.includes('example-model')), v1.hints.join('\n'))
  const v2 = audit.verdicts.find((v) => v.toolName === 'typo2')
  assert.equal(v2.modelOk, false)
  assert.ok(v2.hints.some((h) => h.includes('是否想用') && h.includes('k3')), v2.hints.join('\n'))
  const v3 = audit.verdicts.find((v) => v.toolName === 'typo3')
  assert.equal(v3.modelOk, false)
  assert.ok(!v3.hints.some((h) => h.includes('是否想用')), v3.hints.join('\n'))
  assert.ok(v3.hints.length >= 1) // 基础修复 hint 仍在
  // hint 预算：单角色 ≤3 条（契约红线 4）
  for (const v of audit.verdicts) assert.ok(v.hints.length <= 3, v.hints.join('\n'))
})

// --- startup-scheduler: 防抖 + 最大等待上限（plans/startup-hardening.md T1，AC-26..AC-28）---

// 受控假时钟 + 假定时器队列：「到期」由 advance(ms) 手动推进，不用真实定时器。
function makeFakeTimers() {
  let t = 0
  let seq = 0
  const timers = new Map() // id -> { at, fn }
  const setTimeoutFn = (fn, delay) => {
    const id = ++seq
    timers.set(id, { at: t + delay, fn })
    return { id } // 假句柄：故意不带 unref 方法（AC-28 可选链验证点）
  }
  const clearTimeoutFn = (handle) => { timers.delete(handle.id) }
  const advance = (ms) => {
    const target = t + ms
    for (;;) {
      let dueId = null
      let dueAt = Infinity
      for (const [id, timer] of timers) {
        if (timer.at <= target && (timer.at < dueAt || (timer.at === dueAt && id < dueId))) {
          dueId = id
          dueAt = timer.at
        }
      }
      if (dueId === null) break
      const timer = timers.get(dueId)
      timers.delete(dueId)
      t = timer.at
      timer.fn()
    }
    t = target
  }
  return { setTimeoutFn, clearTimeoutFn, advance, now: () => t }
}

ok('startup-scheduler: 防抖重置：自最后一次 schedule 起满 debounceMs 才触发（AC-26）', () => {
  const f = makeFakeTimers()
  let runCount = 0
  const s = createPruneScheduler({
    setTimeoutFn: f.setTimeoutFn, clearTimeoutFn: f.clearTimeoutFn, now: f.now,
    debounceMs: 3000, maxWaitMs: 10000,
    run: () => { runCount += 1 },
  })
  s.schedule()       // t=0，deadline=10000，fire@3000
  f.advance(2000)    // t=2000
  s.schedule()       // 重置，fire@5000
  f.advance(2000)    // t=4000
  s.schedule()       // 重置，fire@7000
  f.advance(2999)    // t=6999，差 1ms 不满防抖窗
  assert.equal(runCount, 0)
  f.advance(1)       // t=7000，满 3000ms → 触发
  assert.equal(runCount, 1)
})

ok('startup-scheduler: 最大等待上限：每 2000ms 重置防抖也在 t=10000 触发且仅 1 次（AC-27）', () => {
  const f = makeFakeTimers()
  let runCount = 0
  const s = createPruneScheduler({
    setTimeoutFn: f.setTimeoutFn, clearTimeoutFn: f.clearTimeoutFn, now: f.now,
    debounceMs: 3000, maxWaitMs: 10000,
    run: () => { runCount += 1 },
  })
  // 每 2000ms 调一次 schedule()（永远重置防抖）——旧实现的防抖饿死场景
  s.schedule()                    // t=0，deadline=10000
  f.advance(2000); s.schedule()   // t=2000
  f.advance(2000); s.schedule()   // t=4000
  f.advance(2000); s.schedule()   // t=6000
  f.advance(2000)                 // t=8000，尚未触发
  assert.equal(runCount, 0)
  s.schedule()       // t=8000，delay 被钳到 deadline 剩余量 2000 → fire@10000
  f.advance(1999)    // t=9999
  assert.equal(runCount, 0)
  f.advance(1)       // t=10000，到达 deadline → 触发
  assert.equal(runCount, 1)
  f.advance(20000)   // 之后不再重复触发
  assert.equal(runCount, 1)
})

ok('startup-scheduler: 生命周期与 state 形状（cancel/一次性/无 unref 不抛）（AC-28）', () => {
  const f = makeFakeTimers()
  let runCount = 0
  const s = createPruneScheduler({
    setTimeoutFn: f.setTimeoutFn, clearTimeoutFn: f.clearTimeoutFn, now: f.now,
    run: () => { runCount += 1 }, // debounceMs/maxWaitMs 走缺省 3000/10000
  })
  assert.deepEqual(s.state, { scheduled: false, ran: false, deadlineAt: null }) // 初始形状
  assert.doesNotThrow(() => s.schedule()) // 假句柄无 unref 方法，可选链不抛
  assert.deepEqual(s.state, { scheduled: true, ran: false, deadlineAt: 10000 }) // t=0 + 缺省 maxWaitMs
  s.cancel()
  assert.deepEqual(s.state, { scheduled: false, ran: false, deadlineAt: null }) // cancel 不重置 ran（此处本就 false）
  f.advance(99999) // cancel 后推进任意时长不触发
  assert.equal(runCount, 0)
  s.schedule() // cancel 后再 schedule 起新一轮：deadlineAt 重算
  assert.deepEqual(s.state, { scheduled: true, ran: false, deadlineAt: 99999 + 10000 })
  f.advance(3000) // 新一轮满 debounceMs → 触发
  assert.equal(runCount, 1)
  assert.deepEqual(s.state, { scheduled: false, ran: true, deadlineAt: 99999 + 10000 }) // 触发后形状
  s.schedule() // ran===true 后再 schedule 为无操作
  assert.deepEqual(s.state, { scheduled: false, ran: true, deadlineAt: 99999 + 10000 })
  f.advance(99999)
  assert.equal(runCount, 1)
})

ok('startup-scheduler: 模块红线：零 cordis / 零 process.env / Date.now 仅缺省值 1 次（AC-26..28 附）', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/startup-scheduler.js', import.meta.url)), 'utf8')
  assert.ok(!/cordis/.test(src), 'startup-scheduler 不得出现 cordis')
  assert.ok(!/process\.env/.test(src), 'startup-scheduler 不得读 process.env')
  assert.equal(src.match(/Date\.now/g)?.length ?? 0, 1, 'Date.now 只允许作为 now 参数缺省值出现一次')
})

// --- apply() 接线集成：fake ctx 离线（plans/startup-hardening.md T2，AC-29 / AC-30）---
// fake ctx 约定：get 只对受控服务名返回对象，且不挂 loader → resolveToolSubagent 走
// warn+跳过分支（离线、不碰 cordis），故 ctx.plugin 不会被调用、registered 恒为空；
// 「全量在册」即 apply 期间实际在册的角色（经 plugin 调用记录推导）原样进入报告。
function makeFakeCtx({ services = {}, on, effect } = {}) {
  const logs = { info: [], warn: [], error: [] }
  const calls = { plugin: [], on: [], effectCleanups: [] }
  // v0.6：默认注入 agentPresets + contract loader（缺省即可让 apply 走正常注册路径；
  // 需要测契约缺席路径的用例显式传 undefined 覆盖）
  const resolvedServices = {
    agentPresets: makeFakeAgentPresets().service,
    loader: makeContractLoader(),
    ...services,
  }
  const ctx = {
    logger: {
      info: (m) => logs.info.push(m),
      warn: (m) => logs.warn.push(m),
      error: (m) => logs.error.push(m),
    },
    get: (n) => resolvedServices[n],
    plugin: async (mod, cfg) => { // 桩 fiber：记录调用但不真加载 subagent 模块
      calls.plugin.push({ mod, cfg })
      return { dispose: async () => {} }
    },
    systemPrompt: { section: () => () => {} }, // 返回 dispose 桩
    on: on ?? ((event, cb) => { calls.on.push({ event, cb }) }),
    effect: effect ?? ((fn) => { calls.effectCleanups.push(fn()) }), // cordis 语义：立即执行并回收其返回的清理函数
  }
  return { ctx, logs, calls }
}

// 轮询等待终验落盘：配合 apply(ctx, { debounceMs, maxWaitMs }) 注入的毫秒级防抖（T5/RK3
// 允许项落地），典型几 ms 内返回；timeoutMs 上限仅作防挂死兜底，不是固定等待。
async function waitForReport(path, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      if (Date.now() > deadline) throw new Error(`等待超时（${timeoutMs}ms）：${path} 未生成`)
      await new Promise((r) => setTimeout(r, 5))
    }
  }
}

await okAsync('apply 接线：ctx.on 抛错 → warn 降级不抛；正常 → 订阅 llm/adapters-updated + effect 清理（AC-29）', async () => {
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = await mkdtemp(join(tmpdir(), 'dsh-rg-apply-')) // 兜底防意外落盘到真实 home
  try {
    const thrown = makeFakeCtx({ on: () => { throw new Error('事件系统不可用') } })
    await assert.doesNotReject(apply(thrown.ctx))
    assert.ok(
      thrown.logs.warn.some((m) => m.includes('事件不可订阅')),
      'ctx.on 抛错时必须 warn 降级（现状为静默 catch），而不是吞掉',
    )
    thrown.calls.effectCleanups.filter((fn) => typeof fn === 'function').forEach((fn) => fn()) // 取消 pending 定时器/回收角色，防串用例

    const normal = makeFakeCtx()
    await assert.doesNotReject(apply(normal.ctx))
    assert.ok(normal.calls.on.some((c) => c.event === 'llm/adapters-updated'), '必须订阅 llm/adapters-updated 回调')
    // v0.6：apply 注册两条 effect——① early dispose roles（preset+fiber，D9 幂等回收）② scheduler cancel。
    assert.equal(normal.calls.effectCleanups.length, 2, 'ctx.effect 必须注册两条清理函数（角色回收 + 调度器）')
    for (const cleanup of normal.calls.effectCleanups) {
      if (typeof cleanup !== 'function') continue
      assert.doesNotThrow(() => cleanup()) // 触发清理不抛、无 unhandled rejection
    }
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('apply W3：终验路由校验抛错仍写报告（registered 全量在册 + invalid:[]）（AC-30）', async () => {
  // T5/RK3 允许项落地：apply(ctx, opts) 把 debounceMs/maxWaitMs 透传给调度器（缺省仍为
  // 生产值 3000/10000，host 的 apply(ctx)/apply(ctx, config) 调用不受影响），本用例注入
  // 毫秒级防抖 + 轮询落盘，消灭原 3.4s 真实等待。
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-w3-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp // 截获 last-startup.json
  try {
    const fake = makeFakeCtx({
      services: {
        llm: { listProviders() { throw new Error('llm 已卸载') } },
        // 桩 loader（评审弱点修复）：此前 fake ctx 不提供 loader，resolveToolSubagent 走
        // 「解析失败 → warn + 跳过注册」分支，ctx.plugin 从未被调用、registered 恒为空，
        // 「全量在册」断言被空集平凡满足。现提供桩 loader 让全部角色真实走完注册
        // （bare import 在本仓库必 ERR_MODULE_NOT_FOUND，已实证，故桩 loader 必定被走到）。
        // 缓存串扰说明：resolveToolSubagent 的 toolSubagent 是模块级变量，本用例成功后
        // 桩模块会被缓存并泄漏给后续用例（AC-31）——AC-31 自带同款桩 loader 且只断言
        // 本次快照字段，缓存串扰不影响其结论；本用例位于所有 apply 用例之尾，无前向污染。
        loader: makeContractLoader(),
      },
    })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report = await waitForReport(join(tmp, 'plugins', 'dsh-rolegroup', 'last-startup.json'))
    assert.equal(fake.calls.plugin.length, BUILTIN_COUNT, '桩 loader 下所有内置角色必须真实走完 ctx.plugin 注册（杜绝空集平凡满足）')
    assert.equal(report.registered.length, BUILTIN_COUNT, '无论校验成败，registered 必须全量在册（未被剪枝/吞没）')
    assert.deepEqual(report.registered.map((r) => r.toolName), Object.keys(DEFAULT_ROLES), 'registered 的 toolName 集合必须 == 内置角色名')
    assert.deepEqual(report.invalid, [], '校验失败时 invalid 必须为空数组')
    assert.deepEqual(report.failed, [], '桩 loader 下不得有注册失败')
    assert.ok(
      fake.logs.warn.some((m) => m.includes('启动终验路由校验失败') && m.includes('llm 已卸载')),
      'logger 必须含 W3 warn：启动终验路由校验失败（llm 已卸载），按全量在册写报告',
    )
    console.log(`    last-startup.json 关键内容: ${JSON.stringify({ registered: report.registered.map((r) => r.toolName), invalid: report.invalid, failed: report.failed, problems: report.problems })}`)
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

// --- apply() 快照加性字段 configMtimeMs（plans/startup-hardening.md T3，AC-31）---


// --- doctor: 配置年龄提示（plans/startup-hardening.md T4，AC-32 / AC-33）---
// 口径：提示走 state.anomalies 通道（⚠️ 提示级，与 AC-22/AC-24 同口径），绝不进 reportIssues、
// 不污染 unhealthy 计数（RK5）；与 time 的 stale 判定相互独立——time 非法/缺失（AC-21 分支）
// 时照常评估。一律显式注入 now，不依赖真实当前时间。

await okAsync('doctor: 配置超龄 → anomalies 恰多 1 条 ⚠️ 提示且 unhealthy 计数不变（AC-32）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-cfgage-'))
  const dir = join(tmp, 'plugins', 'dsh-rolegroup')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'last-startup.json')
  const DAY = 24 * 60 * 60 * 1000
  const now = new Date('2026-09-24T00:00:00.000Z')
  const contentTime = new Date(now.getTime() - DAY) // time 新鲜（1 天），隔离 stale 干扰
  const configSource = '/home/u/.dsh/rolegroup.jsonc'
  const snapshot = {
    time: contentTime.toISOString(),
    configSource,
    configMtimeMs: now.getTime() - 23 * DAY, // 上次改动 2026-09-01（UTC 日历日）
    registered: [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false }],
  }
  await writeFile(file, JSON.stringify(snapshot))
  await utimes(file, contentTime, contentTime) // mtime 对齐内容时间，隔离 AC-22 anomaly

  const state = await readStartupReport({ env: { DSH_HOME: tmp }, now })
  assert.equal(state.kind, 'ok')
  assert.equal(state.anomalies.length, 1, JSON.stringify(state.anomalies))
  const hint = state.anomalies[0]
  assert.ok(hint.includes(configSource), hint) // 含 source 路径
  assert.ok(hint.includes('23 天'), hint)
  assert.ok(hint.includes('上次改动 2026-09-01'), hint)
  assert.ok(hint.includes('提示：'), hint) // 提示级前缀，非「修复：」
  assert.ok(!hint.includes('修复：'), hint)

  const audit = auditRoles(state.report, { providers: ['kimi-coding'], modelsOf: () => ['k3'] })
  const text = renderDoctorText(state, audit)
  // 断言 3：提示只出现在 ⚠️ 行（anomalies 既有渲染出口，renderDoctorText 零改动）
  assert.ok(text.includes(`⚠️ ${hint}`), text)

  // 不污染计数——T5 修订为可证伪断言组合（旧断言「state.report vs 去 configMtimeMs 副本
  // 比较 unhealthy」在类型层面恒真：auditRoles 根本拿不到 state.anomalies，无证伪力）：
  const { configMtimeMs: _dropped, ...withoutAge } = snapshot
  const baselineReport = normalizeReport(withoutAge)
  const baselineAudit = auditRoles(baselineReport, { providers: ['kimi-coding'], modelsOf: () => ['k3'] })
  // 断言 1：提示不得进 reportIssues 通道（RK5）——与无 configMtimeMs 的基线条数相等
  assert.equal(audit.reportIssues.length, baselineAudit.reportIssues.length, '提示不得进 reportIssues 通道（与无 configMtimeMs 基线比对）')
  // 断言 2：渲染产物里 ❌ 行数必须等于 unhealthy 计数（提示若走 ❌ 异常块必破等式）
  const crossCount = text.split('\n').filter((l) => l.startsWith('❌')).length
  assert.equal(crossCount, audit.unhealthy, `渲染产物 ❌ 行数（${crossCount}）必须等于 unhealthy（${audit.unhealthy}）`)
})

await okAsync('doctor: 配置年龄阈值边界与宽容（14 天不出/15 天出/缺字段兼容/time 非法照常）（AC-33）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-cfgage-edge-'))
  const dir = join(tmp, 'plugins', 'dsh-rolegroup')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'last-startup.json')
  const DAY = 24 * 60 * 60 * 1000
  const now = new Date('2026-09-24T00:00:00.000Z')
  const contentTime = new Date(now.getTime() - DAY) // time 新鲜，隔离 stale
  const registered = [{ toolName: 'coder', provider: 'kimi-coding', model: 'k3', readonly: false }]
  const read = () => readStartupReport({ env: { DSH_HOME: tmp }, now })
  const writeSnapshot = async (extra) => {
    await writeFile(file, JSON.stringify({ time: contentTime.toISOString(), registered, ...extra }))
    await utimes(file, contentTime, contentTime) // 隔离 AC-22 anomaly
  }

  // 恰好 CONFIG_AGE_HINT_DAYS（14）天：不大于阈值 → 无提示（须严格大于）
  assert.equal(CONFIG_AGE_HINT_DAYS, 14, 'CONFIG_AGE_HINT_DAYS 须为 2× STALE_AFTER_DAYS = 14')
  await writeSnapshot({ configMtimeMs: now.getTime() - CONFIG_AGE_HINT_DAYS * DAY })
  assert.deepEqual((await read()).anomalies, [])

  // 15 天 → 有提示
  await writeSnapshot({ configMtimeMs: now.getTime() - (CONFIG_AGE_HINT_DAYS + 1) * DAY })
  const over = await read()
  assert.equal(over.anomalies.length, 1, JSON.stringify(over.anomalies))
  assert.ok(over.anomalies[0].includes('15 天'), over.anomalies[0])

  // configMtimeMs 缺失 / null → 无提示（旧快照兼容，RK7：缺 ≠ 异常）
  await writeSnapshot({})
  assert.deepEqual((await read()).anomalies, [])
  await writeSnapshot({ configMtimeMs: null })
  assert.deepEqual((await read()).anomalies, [])

  // normalizeReport 宽容：缺失/null/NaN/Infinity/非 number → 归一 null 且不产生 anomaly；
  // 有限 number 原样保留
  for (const extra of [{}, { configMtimeMs: null }, { configMtimeMs: NaN }, { configMtimeMs: Infinity }, { configMtimeMs: '2026-09-01' }]) {
    const normalized = normalizeReport({ registered, ...extra })
    assert.equal(normalized.configMtimeMs, null, JSON.stringify(extra))
    assert.deepEqual(normalized.anomalies, [], JSON.stringify(extra))
  }
  assert.equal(normalizeReport({ configMtimeMs: 1788220800000 }).configMtimeMs, 1788220800000)

  // time 非法（AC-21 分支）但 configMtimeMs 超龄 → 提示照常出现（独立性）；
  // configSource 为 null 时文案显示「内置默认表」
  await writeFile(file, JSON.stringify({ time: 'not-a-date', configMtimeMs: now.getTime() - 23 * DAY, registered }))
  const badTime = await read()
  assert.equal(badTime.kind, 'ok')
  assert.equal(badTime.ageDays, null)
  assert.equal(badTime.anomalies.length, 1, JSON.stringify(badTime.anomalies))
  assert.ok(badTime.anomalies[0].includes('23 天'), badTime.anomalies[0])
  assert.ok(badTime.anomalies[0].includes('内置默认表'), badTime.anomalies[0])
})

// --- startup-scheduler: run() 兜底 onError（plans/startup-hardening.md §2.1 T5 修订，AC-34）---
// 背景：prune() 内只有 validateRoutes/writeReport 有 try/catch，announce(valid)、summary
// 构造等抛点若冒泡成 void run() 的 unhandled rejection，Node ≥15 默认致命退出。

await okAsync('startup-scheduler: run 同步/异步抛错均由 onError 兜底且不重复触发（AC-34）', async () => {
  // 场景一：run 同步抛错 → onError 收到该错误；ran 已置位，schedule() 不再触发第二次 run
  const f1 = makeFakeTimers()
  const syncErr = new Error('prune 同步爆炸')
  const received = []
  let runCount = 0
  const s1 = createPruneScheduler({
    setTimeoutFn: f1.setTimeoutFn, clearTimeoutFn: f1.clearTimeoutFn, now: f1.now,
    debounceMs: 10, maxWaitMs: 100,
    run: () => { runCount += 1; throw syncErr },
    onError: (e) => received.push(e),
  })
  s1.schedule()
  f1.advance(10) // 同步抛错不得穿透 fire()（否则此处直接炸掉本用例进程）
  assert.equal(runCount, 1)
  assert.deepEqual(received, [syncErr], '同步抛错必须由 onError 收到原错误对象')
  assert.equal(s1.state.ran, true, '抛错不影响一次性语义：ran 仍须置位')
  s1.schedule()
  f1.advance(1000)
  assert.equal(runCount, 1, 'ran 后 schedule() 不得触发第二次 run')
  assert.equal(received.length, 1)

  // 场景二：run 返回 rejected promise → onError 收到 rejection 原因（await 一个 tick）
  const f2 = makeFakeTimers()
  const asyncErr = new Error('prune 异步爆炸')
  const received2 = []
  const s2 = createPruneScheduler({
    setTimeoutFn: f2.setTimeoutFn, clearTimeoutFn: f2.clearTimeoutFn, now: f2.now,
    debounceMs: 10, maxWaitMs: 100,
    run: () => Promise.reject(asyncErr),
    onError: (e) => received2.push(e),
  })
  s2.schedule()
  f2.advance(10)
  await new Promise((r) => setImmediate(r)) // 让 .catch(onError) 链跑完一个 tick
  assert.deepEqual(received2, [asyncErr], 'rejected promise 的原因必须由 onError 收到')

  // 场景三：onError 缺省（no-op）→ 同步/异步抛错都不得让测试进程崩溃
  const f3 = makeFakeTimers()
  const s3 = createPruneScheduler({
    setTimeoutFn: f3.setTimeoutFn, clearTimeoutFn: f3.clearTimeoutFn, now: f3.now,
    debounceMs: 10, maxWaitMs: 100,
    run: () => { throw new Error('缺省 onError 下同步爆炸') },
  })
  s3.schedule()
  assert.doesNotThrow(() => f3.advance(10))
  const f4 = makeFakeTimers()
  const s4 = createPruneScheduler({
    setTimeoutFn: f4.setTimeoutFn, clearTimeoutFn: f4.clearTimeoutFn, now: f4.now,
    debounceMs: 10, maxWaitMs: 100,
    run: () => Promise.reject(new Error('缺省 onError 下异步爆炸')),
  })
  s4.schedule()
  assert.doesNotThrow(() => f4.advance(10))
  await new Promise((r) => setImmediate(r)) // 有 unhandled rejection 时进程会在此时崩溃
})

ok('startup-scheduler: 生产缺省值 debounceMs=3000 / maxWaitMs=10000（AC-34 附，注入时钟不虚等）', () => {
  const f = makeFakeTimers()
  let runCount = 0
  const s = createPruneScheduler({
    setTimeoutFn: f.setTimeoutFn, clearTimeoutFn: f.clearTimeoutFn, now: f.now,
    run: () => { runCount += 1 }, // 不传 debounceMs/maxWaitMs → 必须走生产缺省
  })
  s.schedule()
  assert.equal(s.state.deadlineAt, 10000, '缺省 maxWaitMs 必须为 10000')
  f.advance(2999)
  assert.equal(runCount, 0, '缺省 debounceMs 下 2999ms 不得触发')
  f.advance(1)
  assert.equal(runCount, 1, '缺省 debounceMs 必须为 3000')
})

// --- v0.4 settings 迁移 T1：section 双向映射 + 校验 + Config 层（plans/v0.4-settings-migration.md T2）---
// 纯逻辑离线断言；settings 服务相关用例全部用假 ctx，不触 cordis。
import { rolesToSection, sameSection, sectionToFileConfig, validateSectionProblems } from '../lib/settings-table.js'
import { resolveDeploymentModule } from '../lib/settings.js'
import { CONFIG_UNAVAILABLE_REASON, Config, ROLEGROUP_CONFIG_FIELDS, ROLEGROUP_CONFIG_TOP_FIELDS, ROLEGROUP_ENTRY_ID, rolesFieldOf, rolesFromConfig, settingsSectionOf } from '../lib/config.js'

ok('settings-table: rolesToSection 内置表 → 7 项、首项 analyst 四字段 + persona/summary（v0.3/AC-5）', () => {
  const { roles } = mergeRoles(undefined)
  const section = rolesToSection(roles)
  assert.equal(section.roles.length, BUILTIN_COUNT)
  const first = section.roles[0]
  assert.equal(first.toolName, 'analyst')
  assert.equal(first.provider, 'qwen-token-plan-cn')
  assert.equal(first.model, 'qwen3.8-max')
  assert.ok(!('readonly' in first), 'v0.5 起 section 不得再带 readonly')
  assert.ok(typeof first.persona === 'string' && first.persona.length > 0, 'persona 必须带出')
  assert.ok(typeof first.summary === 'string' && first.summary.length > 0, 'summary 必须带出')
  // custom 是派生标记，不入 section（D1/§2.1）
  for (const item of section.roles) assert.ok(!('custom' in item), item.toolName)
})

ok('settings-table: round-trip 无损——section 喂回 mergeRoles 后 sameSection 相等（v0.3/AC-6）', () => {
  const { roles } = mergeRoles({ roles: { coder: { reasoningEffort: 'high' } } })
  const original = rolesToSection(roles)
  const roundTripped = rolesToSection(mergeRoles(sectionToFileConfig(original)).roles)
  assert.ok(sameSection(original, roundTripped), '同一条 mergeRoles 管线的 round-trip 必须无损')
  assert.equal(roundTripped.roles.find((r) => r.toolName === 'coder').reasoningEffort, 'high', 'reasoningEffort 也要无损')
  // 非法输入不抛，返回空表（§2.1 契约）
  assert.deepEqual(sectionToFileConfig(undefined), { roles: {} })
  assert.deepEqual(sectionToFileConfig('nope'), { roles: {} })
})

ok('settings-table: validateSectionProblems 各类非法各出一条人话问题，合法表返回 []（v0.3/AC-7）', () => {
  const legal = rolesToSection(mergeRoles(undefined).roles)
  assert.deepEqual(validateSectionProblems(legal), [])
  // ① 根非对象
  assert.equal(validateSectionProblems('nope').length, 1)
  assert.equal(validateSectionProblems(['x']).length, 1)
  // ② roles 非数组
  assert.equal(validateSectionProblems({ roles: {} }).length, 1)
  // ③ toolName 重复
  const dup = validateSectionProblems({ roles: [
    { toolName: 'coder', provider: 'p', model: 'm' },
    { toolName: 'coder', provider: 'p', model: 'm' },
  ] })
  assert.equal(dup.length, 1, JSON.stringify(dup))
  assert.ok(dup[0].includes('coder') && dup[0].includes('重复'), dup[0])
  // ④ toolName 非法（Foo 不匹配 TOOL_NAME_RE）
  const badName = validateSectionProblems({ roles: [{ toolName: 'Foo', provider: 'p', model: 'm' }] })
  assert.equal(badName.length, 1, JSON.stringify(badName))
  assert.ok(badName[0].includes('Foo'), badName[0])
  // ⑤ provider 空白
  const blank = validateSectionProblems({ roles: [{ toolName: 'coder', provider: '   ', model: 'm' }] })
  assert.equal(blank.length, 1, JSON.stringify(blank))
  assert.ok(blank[0].includes('provider'), blank[0])
  // ⑥ v0.5：残留 readonly → 迁移提示（无论其值是什么）
  const legacyRo = validateSectionProblems({ roles: [{ toolName: 'coder', provider: 'p', model: 'm', readonly: true }] })
  assert.equal(legacyRo.length, 1, JSON.stringify(legacyRo))
  assert.ok(legacyRo[0].includes('readonly') && legacyRo[0].includes('permission preset'), legacyRo[0])
})

ok('settings-table: 面板行携带 fallbackModels → 保存后仍保留为显式链（v0.8/AC-4）', () => {
  const section = rolesToSection(mergeRoles(undefined).roles)
  for (const row of section.roles) {
    assert.ok(Array.isArray(row.fallbackModels) && row.fallbackModels.length > 0,
      `${row.toolName} 的 section 行必须携带链（否则面板一保存就丢降级）`)
  }
  const { roles, problems } = mergeRoles(sectionToFileConfig(section))
  assert.deepEqual(problems, [])
  for (const role of roles) {
    assert.ok(Array.isArray(role.fallbackModels) && role.fallbackModels.length > 0,
      `${role.toolName} 经面板投影后必须仍有链`)
  }
  // round-trip 稳定：再投影一次，链不变且 sameSection 相等
  assert.equal(sameSection(rolesToSection(roles), section), true)
  // 非法链必须报问题（不让坏数据静默进 host）
  const bad = { roles: [{ toolName: 'x', provider: 'p', model: 'm', fallbackModels: ['not-a-ref'] }] }
  assert.ok(validateSectionProblems(bad).some((m) => m.includes('fallbackModels')), JSON.stringify(validateSectionProblems(bad)))
})

ok('settings-table: sameSection 顺序无关——乱序同表 true、改一个 model false（v0.3/AC-8）', () => {
  const section = rolesToSection(mergeRoles(undefined).roles)
  assert.ok(sameSection(section, { roles: [...section.roles].reverse() }))
  const changed = { roles: section.roles.map((r) => (r.toolName === 'coder' ? { ...r, model: 'k3-x' } : r)) }
  assert.ok(!sameSection(section, changed))
  assert.ok(!sameSection(section, undefined))
})

await okAsync('host 导出面：apply/name/inject/Config 四者齐备且取值正确（v0.4/AC-6，不依赖部署树）', async () => {
  // 这条**故意不依赖 schemastery**：无论部署树是否可达，插件模块都必须能 import 且导出面完整
  //（Config 可以是 undefined —— 那是设计内的降级，不是导出面缺失）。
  const hostMod = await import('../lib/index.js')
  for (const key of ['apply', 'name', 'inject', 'Config']) {
    assert.ok(key in hostMod, `lib/index.js 必须导出 ${key}（cordis 装配契约）`)
  }
  assert.equal(hostMod.name, 'dsh-rolegroup')
  assert.deepEqual(hostMod.inject, ['systemPrompt'])
  assert.equal(typeof resolveDeploymentModule, 'function')
})

await okAsync('config: Config 形状/字段口径/volatile 位置/接管判据（v0.4/AC-5、AC-14）', async () => {
  // 这条**依赖部署树 schemastery**（scripts/link-deployment-deps.mjs 建的软链，pretest 会先建好）。
  // 缺软链是真实的环境错误，必须让测试可见（否则「全绿却没验到 Config」）。
  assert.equal(CONFIG_UNAVAILABLE_REASON, undefined,
    `Config 不可用：${CONFIG_UNAVAILABLE_REASON?.message ?? '(原因未知)'}——请在本仓库跑 \`npm run link:deps\` 后重试`)
  assert.notEqual(Config, undefined, 'Config 必须可用（缺软链时见上一条）')

  // --- AC-5：schema 形状 ---
  assert.equal(typeof Config.toJSON, 'function', 'Config 必须是可序列化的 schemastery schema（S2）')
  // schemastery 的 toJSON 是 { uid, refs } 引用表——取值要先解引用
  const json = Config.toJSON()
  const deref = (node) => (typeof node === 'number' ? json.refs[String(node)] : node)
  const root = deref(json.uid ?? json)
  assert.equal(root.type, 'object')
  assert.deepEqual(Object.keys(root.dict).sort(), ['enabled', 'roles'],
    '顶层字段须恰为 enabled + roles（enabled 是接管判据，不可省）')
  // lib/index.js 用 ROLEGROUP_CONFIG_TOP_FIELDS 判别「条目 Config vs 测试注入项」：
  // 该清单必须与 schema 顶层字段**严格一致**，否则新增字段后判别会静默失效（收口审查 N-1）。
  assert.deepEqual([...ROLEGROUP_CONFIG_TOP_FIELDS].sort(), Object.keys(root.dict).sort(),
    'ROLEGROUP_CONFIG_TOP_FIELDS 必须与 schema 顶层字段逐字一致（新增字段时同步更新）')
  // 接管判据：enabled 必须是 volatile 布尔位（官方 subagent-model-selection-settings 同款）
  const enabledSchema = deref(root.dict.enabled)
  assert.equal(enabledSchema.type, 'boolean')
  assert.equal(enabledSchema.meta?.volatile, true, 'enabled 必须 volatile（否则面板无法写回接管状态）')
  assert.equal(enabledSchema.meta?.default, false, 'enabled 缺省必须为 false = 未接管')
  const rolesSchema = deref(root.dict.roles)
  assert.ok(rolesSchema, 'roles 字段必须存在')
  assert.equal(rolesSchema.type, 'array')
  // S5：volatile 标在**数组**上
  assert.equal(rolesSchema.meta?.volatile, true, 'roles 必须整数组 volatile（否则条目不进 describe 镜像）')
  // 元素字段一律不得 volatile（schemastery 会抛「enclosing volatile field」）
  const inner = deref(rolesSchema.inner)
  for (const [key, field] of Object.entries(inner.dict ?? {})) {
    assert.ok(deref(field).meta?.volatile !== true, `数组元素字段 "${key}" 不得标 volatile（S5）`)
  }
  // 字段口径与 v0.3 schema 逐字对齐
  assert.deepEqual(Object.keys(inner.dict).sort(), Object.keys(ROLEGROUP_CONFIG_FIELDS).sort())
  assert.equal(ROLEGROUP_ENTRY_ID, 'dsh-rolegroup', '命名空间须等于 Loader 条目 id（S2）')

  // --- AC-14：D4 接管判据由**显式 enabled 位**决定 ---
  // 背景（收口审查 B-1）：schemastery 会把 z.array 自动补成 []，故「字段缺省」与「显式空数组」
  // 在解析值上不可区分，靠长度/缺省判断接管是不可能的 → 必须用显式布尔位。
  assert.equal(settingsSectionOf(undefined), undefined, '无 config = 未接管 → 回落 jsonc')
  assert.equal(settingsSectionOf({}), undefined, 'enabled 缺省 false = 未接管 → 回落 jsonc')
  assert.equal(settingsSectionOf({ enabled: false, roles: [{ toolName: 'a' }] }), undefined,
    'enabled=false 时即便带了 roles 也不得接管（显式位优先）')
  assert.deepEqual(settingsSectionOf({ enabled: true, roles: [] }), { roles: [] },
    'enabled=true + 空表 = 接管且零覆盖（合法意图，不得静默回落）')
  assert.deepEqual(settingsSectionOf({ enabled: true, roles: [{ toolName: 'a' }] }), { roles: [{ toolName: 'a' }] })
  assert.deepEqual(settingsSectionOf({ enabled: { get: () => true }, roles: { get: () => [] } }), { roles: [] },
    'volatile 引用须经 .get() 解包')
  // 防御性：非数组/脏元素不抛
  assert.equal(rolesFieldOf({ roles: 'nope' }), undefined)
  assert.deepEqual(rolesFromConfig(undefined), [])
  assert.deepEqual(rolesFromConfig({ roles: [null, 'x', { toolName: 'a' }] }), [{ toolName: 'a' }], '非对象元素必须被过滤且不抛')
  assert.deepEqual(rolesFromConfig({ roles: { get: () => [{ toolName: 'a' }] } }), [{ toolName: 'a' }], 'volatile 引用须经 .get() 解包')
})

// --- v0.4 settings 迁移 T3：compose 抽取 + 保存即重组装（plans/v0.4-settings-migration.md D5/T3）---
// 约定：时间相关断言一律注入假时钟（makeFakeTimers，AC-26..28 先例）——apply 经
// __setTestOverrides 同时喂给 prune 调度器与 volatile 防抖；
// 落盘/轮询沿用 waitForReport 先例（真实文件 IO，不是时间断言）。

// T3 专用 fake ctx：compose 断言面（fiber dispose 记账、systemPrompt 公告捕获）
// + v0.4 生效通道（`loader/volatile-update` 事件的注册与触发）。
// 桩 loader 与 AC-30 同款（bare import 必失败已实证；resolveToolSubagent 模块级缓存此时
// 已被 AC-30 置为桩模块，本桩是双保险）。
// --- v0.6 假宿主：agentPresets 服务 + loader 里的默认 preset 声明（plans/v0.6 §13 T3）---
// 严格复刻 registry 的五条真实语义，否则测试会变成"假绿"：
//   ① register 是 async，返回 async disposer；
//   ② 同 id 重复注册抛错；
//   ③ 激活失败**不抛**，只把 broken 写进 list() 结果（真实 registry 的坑）；
//   ④ list() 是 async；
//   ⑤ dispose 后定义从 roster 消失。
// 用工厂而非 const：makeFakeCtx（定义在本节之前）在模块求值期就会调用 makeContractLoader，
// 用 const 会撞 TDZ（Cannot access before initialization）。
function fakeBaseRows() {
  return [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: '部署默认 persona' } },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions' },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'delegation', name: 'cordis:group', group: true, config: [{ id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent' }] },
  ]
}

function makeBasePresetEntry(rows = fakeBaseRows(), id = 'standard') {
  return { options: { id: `preset-${id}`, name: '@deepseek-ai/dsh-agent-preset', config: { id, plugins: rows } } }
}

/**
 * 复刻 @deepseek-ai/dsh-agent-preset-registry 的可观测语义（见本节头注①–⑤）。
 * @param {{ brokenIds?: Set<string>, listGate?: Promise<void> }} [opts]
 */
function makeFakeAgentPresets({ brokenIds = new Set(), listGate, trace } = {}) {
  const calls = []
  const definitions = new Map()
  let gate = listGate
  const record = (event, id) => {
    calls.push([event, id])
    trace?.push([event, id]) // 与 makeComposeCtx 共享同一数组 → 可断跨 helper 的先后顺序
  }
  const service = {
    defaultId: 'standard',
    async register(definition) {
      record('register', definition.id)
      if (definitions.has(definition.id)) throw new Error(`Duplicate agent preset: ${definition.id}`)
      definitions.set(definition.id, {
        id: definition.id,
        ...(brokenIds.has(definition.id) ? { broken: '模拟的 preset 激活失败' } : {}),
      })
      return async () => { record('preset-dispose', definition.id); definitions.delete(definition.id) }
    },
    async list() {
      record('list')
      if (gate !== undefined) await gate
      return [...definitions.values()].map((record) => ({
        id: record.id,
        ...(record.broken === undefined ? {} : { broken: record.broken }),
      }))
    },
  }
  return {
    service,
    calls,
    definitions,
    /** 让后续 list() 挂起，直到返回的 release() 被调用（死锁 oracle 用）。 */
    holdList() {
      let release
      gate = new Promise((resolve) => { release = resolve })
      return () => { gate = undefined; release?.() }
    },
  }
}

/** 假 loader：提供 tool-subagent / persona 的模块解析 + 默认 preset 声明。 */
function makeContractLoader({ baseRows = fakeBaseRows(), agentPresetId = 'standard' } = {}) {
  return {
    import: async (specifier) => (
      specifier === '@deepseek-ai/dsh-tool-subagent' || specifier === '@deepseek-ai/dsh-persona' ? {} : undefined
    ),
    entries: () => [makeBasePresetEntry(baseRows, agentPresetId)],
  }
}

await okAsync('v0.6 假宿主自测：register 幂等/重复 id 抛/list 形状/dispose（plans/v0.6 §13 T3）', async () => {
  const fake = makeFakeAgentPresets({ brokenIds: new Set(['rolegroup-bad']) })
  assert.equal(fake.service.defaultId, 'standard')
  const dispose = await fake.service.register({ id: 'rolegroup-good', plugins: [] })
  assert.equal(typeof dispose, 'function', 'register 必须返回 disposer')
  assert.equal(fake.definitions.has('rolegroup-good'), true, 'register 后定义必须在 roster 里')
  await assert.rejects(() => fake.service.register({ id: 'rolegroup-good', plugins: [] }), /Duplicate/)
  await fake.service.register({ id: 'rolegroup-bad', plugins: [] })
  const roster = await fake.service.list()
  assert.deepEqual(roster, [
    { id: 'rolegroup-good' },
    { id: 'rolegroup-bad', broken: '模拟的 preset 激活失败' },
  ])
  await dispose()
  assert.equal(fake.definitions.has('rolegroup-good'), false, 'dispose 后定义必须消失')
  // 失败的重复注册尝试也记账（更贴近真实：调用发生了、但抛了）
  assert.deepEqual(fake.calls.filter((c) => c[0] === 'register').map((c) => c[1]), ['rolegroup-good', 'rolegroup-good', 'rolegroup-bad'])
  assert.deepEqual(fake.calls.filter((c) => c[0] === 'preset-dispose').map((c) => c[1]), ['rolegroup-good'])
})

await okAsync('v0.6 假宿主自测：loader 默认 preset 声明可取到 rows（plans/v0.6 §13 T3）', async () => {
  const loader = makeContractLoader()
  const entries = loader.entries()
  assert.equal(entries.length, 1)
  assert.equal(entries[0].options.name, '@deepseek-ai/dsh-agent-preset')
  assert.equal(entries[0].options.config.id, 'standard')
  assert.deepEqual(entries[0].options.config.plugins.map((r) => r.id), ['persona', 'agent-instructions', 'tool-fs', 'delegation'])
  assert.deepEqual(await loader.import('@deepseek-ai/dsh-persona'), {})
  assert.deepEqual(await loader.import('@deepseek-ai/dsh-tool-subagent'), {})
  assert.equal(await loader.import('@deepseek-ai/unknown'), undefined)
})

function makeComposeCtx({
  llm,
  agentPresets = makeFakeAgentPresets().service, // v0.6 默认契约就绪；契约缺席路径显式传 null
  loader = makeContractLoader(),
  injectImpl, // v0.6：契约时序用例可注入 inject 行为（缺省 noop = 永不回调）
  trace, // v0.6：与 makeFakeAgentPresets 共享的时序记录（断言 preset/fiber 的先后顺序）
} = {}) {
  const logs = { info: [], warn: [], error: [] }
  const calls = { plugin: [], disposes: [], announcements: [], effectCleanups: [] }
  const handlers = new Map()
  const ctx = {
    logger: { info: (m) => logs.info.push(m), warn: (m) => logs.warn.push(m), error: (m) => logs.error.push(m) },
    get: (n) => ({
      llm,
      agentPresets, // v0.6：假 registry（undefined = 契约自检不通过路径）
      loader,
    })[n],
    plugin: async (mod, cfg) => { // 桩 fiber：记录注册配置，dispose 记账（AC-12/15 断言面）
      calls.plugin.push(cfg)
      trace?.push(['fiber-register', cfg.toolName])
      return { dispose: async () => { calls.disposes.push(cfg); trace?.push(['fiber-dispose', cfg.toolName]) } }
    },
    systemPrompt: { section: (opts) => { calls.announcements.push(opts.text); return () => {} } },
    on: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
    },
    effect: (fn) => { const cleanup = fn(); calls.effectCleanups.push(cleanup); return cleanup },
    inject: injectImpl ?? (() => {}), // v0.4 起不再用 settings 软接入；v0.6 用 inject 等 agentPresets
  }
  /** 触发一次 cordis volatile 配置提交（面板保存 → configEditor 写 profile patch → loader 提交）。 */
  const fireVolatile = () => { for (const handler of handlers.get('loader/volatile-update') ?? []) handler() }
  return { ctx, logs, calls, fireVolatile, hasVolatileListener: () => (handlers.get('loader/volatile-update')?.length ?? 0) > 0 }
}

/**
 * 模拟 cordis 传给 apply 的条目 Config：`enabled` / `roles` 都是 volatile 引用（`.get()` 读当前值）。
 * 缺省 `enabled = true`（= 面板已接管），需要「未接管」形态时显式传 false。
 * @param {Array<object>} roles 初始 roles 数组。
 * @param {boolean} enabled 是否接管（缺省 true）。
 */
function makeEntryConfig(roles = [], enabled = true) {
  let current = { enabled, roles }
  return {
    config: {
      enabled: { get: () => current.enabled },
      roles: { get: () => (Array.isArray(current.roles) ? current.roles : []) },
    },
    setRoles: (next) => { current = { ...current, roles: next } },
    setEnabled: (next) => { current = { ...current, enabled: next } },
  }
}

// 条件轮询（waitForReport 同款风格）：上限仅作防挂死兜底，不是固定等待。
async function waitForCond(cond, label, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`等待超时（${timeoutMs}ms）：${label}`)
    await new Promise((r) => setTimeout(r, 5))
  }
}

const reportPathOf = (home) => join(home, 'plugins', 'dsh-rolegroup', 'last-startup.json')
const readReportWhen = (home, cond) => waitForCond(() => {
  try {
    const report = JSON.parse(readFileSync(reportPathOf(home), 'utf8'))
    return cond(report)
  } catch { return false }
}, 'last-startup.json 满足条件')

await okAsync('compose 重构等价性：启动快照字段形状与 registered 内容锁定（v0.4/AC-13 起点）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-t2-equiv-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  try {
    const fake = makeComposeCtx() // 不传条目 Config → settings 未接管形态，行为须与 v0.1 逐字一致
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report = await waitForReport(reportPathOf(tmp))
    assert.equal(fake.calls.plugin.length, BUILTIN_COUNT, '启动路径必须立即注册全部内置角色（不等 settings/prune）')
    assert.deepEqual(Object.keys(report).sort(),
      ['configError', 'configMtimeMs', 'configSource', 'failed', 'invalid', 'problems', 'registered', 'time'],
      '快照字段集合必须与重构前逐字一致（锁死重构未改变产物）')
    assert.equal(report.configSource, null)
    assert.equal(report.configError, null)
    assert.equal(report.configMtimeMs, null)
    assert.ok(typeof report.time === 'string')
    assert.equal(report.registered.length, BUILTIN_COUNT)
    assert.deepEqual(report.registered.map((r) => r.toolName), Object.keys(DEFAULT_ROLES))
    // v0.5：registered[] 不再带 readonly（红线 3 的显式例外，见 lib/index.js writeReport）
    assert.deepEqual(report.registered[0], { toolName: 'analyst', provider: 'qwen-token-plan-cn', model: 'qwen3.8-max' })
    for (const entry of report.registered) assert.deepEqual(Object.keys(entry).sort(), ['model', 'provider', 'toolName'])
    assert.deepEqual(report.failed, [])
    assert.deepEqual(report.invalid, [])
    assert.deepEqual(report.problems, [])
    console.log(`    快照字段: ${JSON.stringify(Object.keys(report))}`)
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})


await okAsync('compose settings **启动**接管路径：残留 readonly 必须给出迁移提示（收口审查 B-1 回归）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-t2-legacy-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  try {
    // settings 接管，且表里带一个 v0.5 已移除的 readonly 字段。
    // 关键：sectionToFileConfig 是白名单投影，会在 mergeRoles 之前丢掉 readonly——
    // 故提示必须在投影**之前**单独收集，否则用户 profile patch 里的残留字段被静默忽略。
    const fake = makeComposeCtx()
    __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
    await apply(fake.ctx, makeEntryConfig([
      { toolName: 'scout', provider: 'deepseek-official', model: 'deepseek-flash', readonly: true },
    ], true).config)
    __setTestOverrides(undefined)
    const report = await waitForReport(reportPathOf(tmp))
    assert.equal(report.problems.length, 1, JSON.stringify(report.problems))
    assert.ok(report.problems[0].includes('readonly') && report.problems[0].includes('permission preset'), report.problems[0])
    // 角色本身照常注册（只提示不拒收）
    assert.ok(fake.calls.plugin.some((c) => c.toolName === 'scout'))
    // 提示也必须真的出现在日志里（lib/index.js 对 problems 走 log.error）
    assert.ok(fake.logs.error.some((m) => m.includes('readonly')), JSON.stringify(fake.logs.error))
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('compose volatile 热更新路径：残留 readonly 也必须给出迁移提示并落报告（收口审查 v0.5 复审 ①.1 回归）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-t2-legacy-hot-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  const f = makeFakeTimers()
  const entry = makeEntryConfig([], true) // 启动即接管，且初始表干净
  __setTestOverrides({ debounceMs: 3000, maxWaitMs: 10000, setTimeoutFn: f.setTimeoutFn, clearTimeoutFn: f.clearTimeoutFn, watchDebounceMs: 300 })
  try {
    const fake = makeComposeCtx()
    await apply(fake.ctx, entry.config)
    f.advance(3000)
    const startup = await waitForReport(reportPathOf(tmp))
    assert.deepEqual(startup.problems, [], '启动时表干净 → 无问题')
    // 面板保存一张**带残留 readonly** 的表 → volatile 热更新
    entry.setRoles([{ toolName: 'scout', provider: 'deepseek-official', model: 'deepseek-flash', readonly: true }])
    fake.fireVolatile()
    f.advance(300)
    await waitForCond(() => fake.logs.error.some((m) => m.includes('readonly')), '热更新路径必须报出遗留字段')
    // 关键：这条提示必须**落进报告**（不只进日志），否则 doctor 看不到
    await readReportWhen(tmp, (r) => Array.isArray(r.problems) && r.problems.length > 0)
    const report = JSON.parse(readFileSync(reportPathOf(tmp), 'utf8'))
    assert.equal(report.problems.length, 1, JSON.stringify(report.problems))
    assert.ok(report.problems[0].includes('readonly') && report.problems[0].includes('permission preset'), report.problems[0])
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('compose volatile 触发重组装：旧 fiber 全 dispose、按新表重注册、公告与报告含新模型与 settings 标注（v0.4/AC-9）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-t2-recompose-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  const f = makeFakeTimers() // prune 3000ms 与 volatile 300ms 全部走假时钟，零真实等待
  const entry = makeEntryConfig([], false) // 初始未接管（enabled=false）→ 生效表 = 文件表
  __setTestOverrides({ debounceMs: 3000, maxWaitMs: 10000, setTimeoutFn: f.setTimeoutFn, clearTimeoutFn: f.clearTimeoutFn, watchDebounceMs: 300 })
  try {
    const fake = makeComposeCtx()
    await apply(fake.ctx, entry.config)
    assert.ok(fake.hasVolatileListener(), 'v0.4 必须订阅 loader/volatile-update（取代已移除的 SettingsScope.watch）')
    assert.equal(fake.calls.plugin.length, BUILTIN_COUNT, '启动路径立即注册全部内置角色（文件表）')
    f.advance(3000) // 终验跑完（首次校验）
    await waitForReport(reportPathOf(tmp))
    assert.equal(fake.calls.plugin.length, BUILTIN_COUNT, '终验不得重复注册')
    assert.ok(!JSON.parse(readFileSync(reportPathOf(tmp), 'utf8')).configSource?.includes?.('settings'), '未接管时 configSource 不得标 settings')
    // 面板保存一张把 coder.model 改掉的表 → cordis 提交 volatile
    const base = rolesToSection(mergeRoles(undefined).roles)
    const changed = { roles: base.roles.map((r) => (r.toolName === 'coder' ? { ...r, model: 'k3-recomposed' } : r)) }
    entry.setEnabled(true); entry.setRoles(changed.roles) // 面板保存 = enabled + roles 一起写
    fake.fireVolatile()
    assert.equal(fake.calls.plugin.length, BUILTIN_COUNT, 'volatile 防抖窗（300ms）内不得立即重组装')
    f.advance(300) // 满防抖 → onTable → recompose
    await waitForCond(() => fake.calls.plugin.length === BUILTIN_COUNT * 2, '重组装后第二轮全量注册（N+N）')
    assert.equal(fake.calls.disposes.length, BUILTIN_COUNT, '旧 fiber 必须全部 dispose')
    const coderCfg = fake.calls.plugin.filter((c) => c.toolName === 'coder').at(-1)
    assert.equal(coderCfg.agentOptions.model, 'k3-recomposed', '第二轮 coder 必须按新表注册')
    const lastAnnouncement = fake.calls.announcements.at(-1)
    assert.ok(lastAnnouncement.includes('kimi-coding/k3-recomposed'), `公告文本须含新模型：${lastAnnouncement}`)
    await readReportWhen(tmp, (r) => typeof r.configSource === 'string' && r.configSource.includes('settings'))
    const report = JSON.parse(readFileSync(reportPathOf(tmp), 'utf8'))
    assert.ok(report.configSource.includes('settings'), report.configSource)
    assert.ok(report.configSource.includes('rolegroup'), report.configSource)
    assert.equal(report.registered.find((r) => r.toolName === 'coder').model, 'k3-recomposed')
    console.log(`    recompose 后 configSource: ${report.configSource}`)
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('compose pruned 闸门：终验前表变更只置 pending 不重组装，prune 完成后补做一次（v0.4/AC-10）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-t2-gate-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  const f = makeFakeTimers() // prune 永不触发除非 advance → pruned 恒 false，全程可控
  const entry = makeEntryConfig([], false)
  __setTestOverrides({ debounceMs: 3000, maxWaitMs: 10000, setTimeoutFn: f.setTimeoutFn, clearTimeoutFn: f.clearTimeoutFn, watchDebounceMs: 300 })
  try {
    const fake = makeComposeCtx()
    await apply(fake.ctx, entry.config)
    const pending = rolesToSection(mergeRoles(undefined).roles).roles
      .map((r) => (r.toolName === 'coder' ? { ...r, model: 'k3-pending' } : r))
    entry.setEnabled(true); entry.setRoles(pending) // 面板保存（终验尚未完成）
    fake.fireVolatile()
    f.advance(300) // volatile 防抖满 → onTable；但 pruned===false → 只许记账
    // 全部定时器在假时钟上；若闸门失效（pruned===false 也重组装），其微任务链在
    // setImmediate 排空后必然已推进到 ctx.plugin——这是确定性检测，不是真实等待
    await new Promise((r) => setImmediate(r))
    assert.equal(fake.calls.plugin.length, BUILTIN_COUNT, 'pruned===false 期间表变更只许置 pendingTable，不得重组装')
    assert.equal(fake.calls.disposes.length, 0, 'pruned===false 期间不得 dispose 任何 fiber')
    f.advance(3000) // 终验跑完 → 须补做一次 recompose
    await waitForCond(() => fake.calls.plugin.length === BUILTIN_COUNT * 2, 'prune 完成后补做的 recompose（N+N）')
    assert.equal(fake.calls.disposes.length, BUILTIN_COUNT)
    await readReportWhen(tmp, (r) => typeof r.configSource === 'string' && r.configSource.includes('settings'))
    const report = JSON.parse(readFileSync(reportPathOf(tmp), 'utf8'))
    assert.equal(report.registered.find((r) => r.toolName === 'coder').model, 'k3-pending', '补做的 recompose 必须按 pending 表注册')
    console.log(`    闸门补做后 configSource: ${report.configSource}`)
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('volatile: 300ms 防抖 + sameSection 短路——同值连发 0 次、异值连发恰好 1 次尾随（v0.4/AC-9）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-t2-debounce-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  const f = makeFakeTimers()
  const entry = makeEntryConfig([], false)
  __setTestOverrides({ debounceMs: 3000, maxWaitMs: 10000, setTimeoutFn: f.setTimeoutFn, clearTimeoutFn: f.clearTimeoutFn, watchDebounceMs: 300 })
  try {
    const fake = makeComposeCtx()
    await apply(fake.ctx, entry.config)
    f.advance(3000) // 先让 pruned===true，把防抖语义与 pruned 闸门隔离开
    await waitForReport(reportPathOf(tmp))
    const base = rolesToSection(mergeRoles(undefined).roles)
    const v1 = { roles: base.roles.map((r) => (r.toolName === 'coder' ? { ...r, model: 'k3-v1' } : r)) }
    const v2 = { roles: base.roles.map((r) => (r.toolName === 'coder' ? { ...r, model: 'k3-v2' } : r)) }
    // ① 同值连发 3 次（与当前生效表同值）→ sameSection 短路，0 次重组装
    entry.setEnabled(true); entry.setRoles(base.roles)
    fake.fireVolatile(); fake.fireVolatile(); fake.fireVolatile()
    f.advance(1000)
    assert.equal(fake.calls.plugin.length, BUILTIN_COUNT, '同值连发必须被 sameSection 短路（0 次重组装触发）')
    // ② 异值连发（v1 → v2 → v1）→ 防抖后恰好 1 次尾随执行，值为最后一发
    entry.setRoles(v1.roles); fake.fireVolatile(); f.advance(100)
    entry.setRoles(v2.roles); fake.fireVolatile(); f.advance(100)
    entry.setRoles(v1.roles); fake.fireVolatile()
    f.advance(299)
    assert.equal(fake.calls.plugin.length, BUILTIN_COUNT, '防抖窗未满（299ms）不得重组装')
    f.advance(1) // 满 300ms
    await waitForCond(() => fake.calls.plugin.length === BUILTIN_COUNT * 2, '异值连发必须恰好 1 次尾随执行')
    f.advance(1000)
    assert.equal(fake.calls.plugin.length, BUILTIN_COUNT * 2, '尾随之后不得重复重组装')
    const coderCfg = fake.calls.plugin.filter((c) => c.toolName === 'coder').at(-1)
    assert.equal(coderCfg.agentOptions.model, 'k3-v1', '尾随执行的值必须是最后一发')
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('compose 干净环境（无第三方凭据、模型列表为空）→ 8 角色全在册、6 个降级到 deepseek-account（v0.11.4/AC-1）', async () => {
  // 真机实测（隔离 DSH_HOME + 无任何密钥）暴露过：链上「模型不在广告列表」比主路由严格，
  // 导致整条链不可用、6 个角色被剪枝。这条把「8/8 + 6 degraded」从真机证据变成离线锁。
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-clean-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const fake = makeComposeCtx({
      loader: makeContractLoader(),
      llm: {
        listProviders: () => [{ id: 'deepseek-account' }, { id: 'deepseek-official' }],
        listModels: async () => [], // 无凭据：模型列表为空
      },
    })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report = await waitForReport(reportPathOf(tmp), 8000)
    assert.equal(report.registered.length, BUILTIN_COUNT, '干净环境也必须 8 个角色全在册')
    assert.deepEqual(report.invalid, [], '不得再因为模型列表为空而剪枝角色')
    const degraded = report.registered.filter((r) => r.degraded === true)
    assert.equal(degraded.length, 6, `应有 6 个角色降级（qwen/kimi 系），实际 ${degraded.length}`)
    for (const role of degraded) {
      assert.equal(role.provider, 'deepseek-account', `${role.toolName} 应降级到账号 provider`)
      assert.equal(role.model, 'deepseek-flash')
      assert.ok(typeof role.primary === 'string' && role.primary.length > 0, `${role.toolName} 必须记下原主路由`)
    }
    assert.deepEqual(
      report.registered.filter((r) => r.degraded !== true).map((r) => r.toolName).sort(),
      ['fallback', 'scout'],
      '主路由就是 deepseek-official 的两个角色不算降级',
    )
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('compose recompose 的角色校验：新表中未注册 provider 的角色被 dispose 且进报告 invalid[]（v0.4/AC-12）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-t2-invalid-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  const f = makeFakeTimers()
  const builtinRoles = mergeRoles(undefined).roles
  const fakeLlm = { // 内置表全部 provider 已注册 → 启动终验零剪枝；ghost-provider 不在册
    listProviders: () => [...new Set(builtinRoles.map((r) => r.provider))].map((id) => ({ id })),
    listModels: async (p) => builtinRoles.filter((r) => r.provider === p).map((r) => ({ id: r.model })),
  }
  const entry = makeEntryConfig([], false)
  __setTestOverrides({ debounceMs: 3000, maxWaitMs: 10000, setTimeoutFn: f.setTimeoutFn, clearTimeoutFn: f.clearTimeoutFn, watchDebounceMs: 300 })
  try {
    const fake = makeComposeCtx({ llm: fakeLlm })
    await apply(fake.ctx, entry.config)
    f.advance(3000) // 终验：全部 provider 在册 → 无剪枝
    const startup = await waitForReport(reportPathOf(tmp))
    assert.deepEqual(startup.invalid, [], '启动终验不得剪枝（全部 provider 已注册）')
    const base = rolesToSection(builtinRoles)
    // 显式配置**不带链**（模拟 jsonc/旧面板）→ 决策 1「显式配置不自动降级」→ 该角色应被剪枝。
    // （携带链的情形由下一条 A-chain 用例覆盖：会降级而不是剪枝。）
    const ghost = base.roles.map((r) => {
      if (r.toolName !== 'scribe') return r
      const { fallbackModels: _dropped, ...rest } = { ...r, provider: 'ghost-provider' }
      return rest
    })
    entry.setEnabled(true); entry.setRoles(ghost) // 面板保存一张把 scribe.provider 改成未注册值的表
    fake.fireVolatile()
    f.advance(300) // 防抖满 → recompose
    await waitForCond(() => fake.calls.plugin.length === BUILTIN_COUNT * 2, '重组装第二轮注册')
    await readReportWhen(tmp, (r) => typeof r.configSource === 'string' && r.configSource.includes('settings'))
    const report = JSON.parse(readFileSync(reportPathOf(tmp), 'utf8'))
    assert.equal(report.invalid.length, 1, JSON.stringify(report.invalid))
    assert.equal(report.invalid[0].toolName, 'scribe')
    assert.ok(report.invalid[0].reason.includes('ghost-provider'), report.invalid[0].reason)
    // 剪枝原因不得再让用户去改 rolegroup.jsonc（v0.11 起它不生效），必须指向面板
    assert.equal(report.invalid[0].reason.includes('rolegroup.jsonc'), false,
      `剪枝原因不得再指向已废弃的配置文件：${report.invalid[0].reason}`)
    assert.ok(report.invalid[0].reason.includes('设置'), '剪枝原因必须指向设置面板')
    assert.equal(report.registered.length, BUILTIN_COUNT - 1, 'scribe 被剪枝后剩 内置角色数 - 1 在册')
    assert.ok(!report.registered.some((r) => r.toolName === 'scribe'))
    // 记账正确性：内置角色数条旧 fiber + scribe 在重组装中新建又判 invalid 的 1 条 = N+1 次 dispose
    assert.equal(fake.calls.disposes.length, BUILTIN_COUNT + 1, JSON.stringify(fake.calls.disposes.map((c) => c.toolName)))
    assert.equal(fake.calls.disposes.filter((c) => c.toolName === 'scribe').length, 2, 'scribe 新旧两条 fiber 均须 dispose')
    assert.ok(!fake.calls.announcements.at(-1).includes('`scribe`'), '末次公告不得再含被剪枝的 scribe')
    console.log(`    invalid[0]: ${JSON.stringify(report.invalid[0])}`)
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

// --- v0.6 T4：契约自检（dsh ≥0.2.1）——缺 agentPresets 服务必须 fail-loud 但不抛 ---
await okAsync('v0.6 契约自检：无 agentPresets 服务 → warn + 角色全 failed + 报告仍写出（v0.6/A12/A17）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-contract-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5, presetsReadyTimeoutMs: 20 })
  try {
    // 注意用 null（不是 undefined）：makeComposeCtx 的参数默认值只在 undefined 时生效，
    // 传 null 才能表达「服务缺席」。服务缺席用 inject 通道回传（不用超时路径：超时定时器是
    // unref 的，测试进程没有其它句柄时会直接退出，生产宿主则不存在该问题）。
    const fake = makeComposeCtx({
      agentPresets: null,
      loader: makeContractLoader(),
      injectImpl: (deps, cb) => { setTimeout(() => cb({ agentPresets: undefined }), 5) },
    })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5, presetsReadyTimeoutMs: 20 })
    const report = await waitForReport(reportPathOf(tmp), 8000)
    assert.equal(fake.calls.plugin.length, 0, '无 agentPresets 服务时不得注册任何角色')
    assert.deepEqual(report.registered, [], 'registered 必须为空')
    assert.deepEqual(report.failed, Object.keys(DEFAULT_ROLES), '角色必须全部进 failed[]（fail-loud，不静默）')
    assert.ok(
      fake.logs.warn.some((m) => m.includes('0.2.1') && m.includes('agentPresets')),
      `必须有一条明确的 0.2.1 契约警告，实为：${JSON.stringify(fake.logs.warn)}`,
    )
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

// --- v0.6 T5：注册链（preset→fiber）、原子回滚、early effect 回收、重载幂等 ---
await okAsync('v0.6 注册链：预设先于 fiber 注册、cfg 携带正确 presetId（v0.6/A3/A4）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-register-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const trace = []
    const presets = makeFakeAgentPresets({ trace })
    const fake = makeComposeCtx({ agentPresets: presets.service, loader: makeContractLoader(), trace })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report = await waitForReport(reportPathOf(tmp), 8000)
    assert.equal(report.registered.length, BUILTIN_COUNT)
    // ① 顺序：每个角色都必须「先 register preset，再 ctx.plugin」
    const events = trace.filter((e) => e[0] === 'register' || e[0] === 'fiber-register')
    assert.deepEqual(events.map((e) => e[0]), Array.from({ length: BUILTIN_COUNT }, () => ['register', 'fiber-register']).flat())
    // ② preset id 按生效表顺序，一角色一个
    assert.deepEqual(
      trace.filter((e) => e[0] === 'register').map((e) => e[1]),
      Object.keys(DEFAULT_ROLES).map((n) => `rolegroup-${n}`),
    )
    // ③ cfg 里 presetId 成对且正确
    for (const cfg of fake.calls.plugin) {
      assert.equal(cfg.agentPreset, `rolegroup-${cfg.toolName}`)
      assert.deepEqual(cfg.allowedAgentPresets, [`rolegroup-${cfg.toolName}`])
    }
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('v0.6 原子回滚：fiber 注册抛 → 该 preset 被 dispose，其余角色不受影响（v0.6/A5）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-rollback-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const presets = makeFakeAgentPresets()
    const fake = makeComposeCtx({ agentPresets: presets.service, loader: makeContractLoader() })
    const realPlugin = fake.ctx.plugin
    let thrown = false
    fake.ctx.plugin = async (mod, cfg) => {
      if (cfg.toolName === 'planner' && !thrown) { thrown = true; throw new Error('模拟 fiber 失败') }
      return realPlugin(mod, cfg)
    }
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report = await waitForReport(reportPathOf(tmp), 8000)
    assert.deepEqual(report.failed, ['planner'])
    assert.equal(report.registered.length, BUILTIN_COUNT - 1)
    assert.deepEqual(
      presets.calls.filter((c) => c[0] === 'preset-dispose').map((c) => c[1]),
      ['rolegroup-planner'],
      '失败角色的 preset 必须被回滚回收',
    )
    assert.equal(presets.definitions.has('rolegroup-planner'), false)
    assert.equal(presets.definitions.size, BUILTIN_COUNT - 1, '其余 preset 仍在')
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('v0.6 回收顺序：重组装时先 fiber 后 preset，一一对应（v0.6/A8）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-recycle-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  const timers = makeFakeTimers()
  __setTestOverrides({
    debounceMs: 3000, maxWaitMs: 10000,
    setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn, watchDebounceMs: 300,
  })
  try {
    const trace = []
    const presets = makeFakeAgentPresets({ trace })
    const entry = makeEntryConfig([], false)
    const fake = makeComposeCtx({ agentPresets: presets.service, loader: makeContractLoader(), trace })
    await apply(fake.ctx, entry.config)
    timers.advance(3000)
    await waitForReport(reportPathOf(tmp), 8000)
    // 触发重组装（面板保存 → volatile → recompose）
    entry.setEnabled(true)
    entry.setRoles([{ toolName: 'coder', provider: 'kimi-coding', model: 'k3' }])
    fake.fireVolatile()
    timers.advance(300)
    // mergeRoles 恒以内置表为底：面板新增一行也只覆盖，生效表仍是全部内置角色 → 重组装是 N→N
    await waitForCond(() => presets.calls.filter((c) => c[0] === 'register').length === BUILTIN_COUNT * 2, '重组装完成（N+N）', 8000)
    const idxOf = (event, id) => trace.findIndex((e) => e[0] === event && e[1] === id)
    for (const name of Object.keys(DEFAULT_ROLES)) {
      const fiberIdx = idxOf('fiber-dispose', name)
      const presetIdx = idxOf('preset-dispose', `rolegroup-${name}`)
      assert.ok(fiberIdx >= 0, `${name} 的 fiber 必须被 dispose`)
      assert.ok(presetIdx >= 0, `${name} 的 preset 必须被 dispose`)
      assert.ok(fiberIdx < presetIdx, `${name} 必须先 fiber 后 preset（实际 ${fiberIdx} vs ${presetIdx}）`)
    }
    // A18（泄漏检测）：重组装后 registry 里必须恰是当前角色集的 preset，无残留旧定义
    assert.deepEqual(
      [...presets.definitions.keys()].sort(),
      Object.keys(DEFAULT_ROLES).map((n) => `rolegroup-${n}`).sort(),
    )
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('v0.6 early effect：apply 开头注册回收 effect，清理时 dispose 全部 fiber+preset（v0.6/A10）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-teardown-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const presets = makeFakeAgentPresets()
    const fake = makeComposeCtx({ agentPresets: presets.service, loader: makeContractLoader() })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    await waitForReport(reportPathOf(tmp), 8000)
    assert.equal(presets.definitions.size, BUILTIN_COUNT)
    const disposers = fake.calls.effectCleanups.filter((fn) => typeof fn === 'function')
    assert.ok(disposers.length >= 1, 'early effect 必须提供清理函数')
    await Promise.all(disposers.map((fn) => fn()))
    assert.equal(presets.definitions.size, 0, '卸载后不得有孤儿 preset')
    assert.equal(fake.calls.disposes.length, BUILTIN_COUNT, '全部 fiber 都必须 dispose')
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('v0.6 重载幂等：同一 registry 上二次 apply 不撞重复 id（v0.6/A19）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-reload-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const presets = makeFakeAgentPresets()
    const fake = makeComposeCtx({ agentPresets: presets.service, loader: makeContractLoader() })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    await waitForReport(reportPathOf(tmp), 8000)
    // 模拟插件卸载：调用全部清理函数
    await Promise.all(fake.calls.effectCleanups.filter((fn) => typeof fn === 'function').map((fn) => fn()))
    assert.equal(presets.definitions.size, 0)
    // 二次 apply（同 registry 实例）
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    await waitForCond(
      () => presets.calls.filter((c) => c[0] === 'register').length === BUILTIN_COUNT * 2,
      '二次 apply 注册 7 个 preset',
      8000,
    )
    assert.ok(
      !fake.logs.error.some((m) => m.includes('Duplicate agent preset')),
      `不得出现重复 id 错误：${JSON.stringify(fake.logs.error)}`,
    )
    assert.equal(presets.definitions.size, BUILTIN_COUNT)
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

// --- v0.6 T6：preset 健康审计（finalize 内）+ 报告/公告一致性 + 剪枝回收 ---
await okAsync('v0.6 审计时机：apply 期间不得调 list()，finalize 恰 1 次（死锁 oracle，v0.6/A6a）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-oracle-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 10 })
  try {
    const presets = makeFakeAgentPresets()
    const release = presets.holdList() // list() 在 finalize 前被调用会挂住 → 死锁 oracle
    const fake = makeComposeCtx({ agentPresets: presets.service, loader: makeContractLoader() })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 10 })
    assert.equal(
      presets.calls.filter((c) => c[0] === 'list').length, 0,
      'apply 返回时不得调用 list()（在宿主 row activation 内调会自等 loader.await）',
    )
    release()
    await waitForReport(reportPathOf(tmp), 8000)
    await waitForCond(
      () => presets.calls.filter((c) => c[0] === 'list').length === 1,
      'finalize 调 list 恰 1 次',
      8000,
    )
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('v0.6 审计一致性：preset broken → 移出 registered/公告、进 invalid、回收 preset+fiber（v0.6/A6b）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-broken-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const presets = makeFakeAgentPresets({ brokenIds: new Set(['rolegroup-analyst']) })
    const fake = makeComposeCtx({ agentPresets: presets.service, loader: makeContractLoader() })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report = await waitForReport(reportPathOf(tmp), 8000)
    assert.deepEqual(report.registered.map((r) => r.toolName).includes('analyst'), false, 'broken 角色不得进 registered')
    assert.deepEqual(report.invalid.map((i) => i.toolName), ['analyst'], 'broken 角色必须进 invalid')
    assert.ok(report.invalid[0].reason.includes('agent preset'), report.invalid[0].reason)
    assert.equal(presets.definitions.has('rolegroup-analyst'), false, 'broken preset 必须回收')
    assert.deepEqual(fake.calls.disposes.map((c) => c.toolName), ['analyst'], 'broken 角色的 fiber 必须 dispose')
    const lastAnnouncement = fake.calls.announcements.at(-1) ?? ''
    assert.ok(!lastAnnouncement.includes('`analyst`'), '公告不得含被审计剔除的角色')
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})



// --- 模型链：内置备用档 + 启动期解析（决策 1：显式配置不自动降级）---
ok('roles: parseRouteRef 只认 "provider/model"，首个斜杠切分', () => {
  assert.deepEqual(parseRouteRef('deepseek-official/deepseek-flash'), { provider: 'deepseek-official', model: 'deepseek-flash' })
  assert.deepEqual(parseRouteRef(' a / b '), { provider: 'a', model: 'b' })
  assert.equal(parseRouteRef(''), undefined)
  assert.equal(parseRouteRef('a'), undefined)
  assert.equal(parseRouteRef('/b'), undefined)
  assert.equal(parseRouteRef('a/'), undefined)
  assert.equal(parseRouteRef(42), undefined)
})

ok('roles: resolveRoleRoute —— 主路由可用不降级 / provider 缺失沿链降级 / 全不可用给 tried / 模型未广告仍用主路由', () => {
  const role = { toolName: 'analyst', provider: 'qwen-token-plan-cn', model: 'qwen3.8-max', fallbackModels: ['deepseek-official/deepseek-v4-pro', 'deepseek-official/deepseek-flash'] }
  let out = resolveRoleRoute(role, { providers: ['qwen-token-plan-cn'], modelsOf: () => ['qwen3.8-max'] })
  assert.equal(out.ok, true)
  assert.equal(out.degraded, false)
  assert.deepEqual([out.role.provider, out.role.model], ['qwen-token-plan-cn', 'qwen3.8-max'])
  out = resolveRoleRoute(role, { providers: ['deepseek-official'], modelsOf: () => ['deepseek-flash'] })
  assert.equal(out.ok, true)
  assert.equal(out.degraded, true)
  assert.equal(out.primary, 'qwen-token-plan-cn/qwen3.8-max', '必须保留原路由供报告标注')
  assert.deepEqual([out.role.provider, out.role.model], ['deepseek-official', 'deepseek-flash'])
  assert.equal(out.tried.length, 2, '第一个备用档模型未广告 → 进 tried，继续试下一个')
  // v0.11.4：provider 已注册但广告列表为空（凭据缺失 / 列表拉取失败）时，链与主路由同等宽容——
  // 记下第一个「provider 在册、模型未广告」的候选，降级过去，而不是把角色剪枝。
  out = resolveRoleRoute(role, { providers: ['deepseek-official'], modelsOf: () => [] })
  assert.equal(out.ok, true, '干净环境（provider 在册、无模型列表）不得整条链不可用')
  assert.equal(out.degraded, true)
  assert.equal(out.warning, 'model-unadvertised')
  assert.deepEqual([out.role.provider, out.role.model], ['deepseek-official', 'deepseek-v4-pro'])
  // 所有 provider 都未注册 → 仍然 fail-loud，不许假装成功
  out = resolveRoleRoute(role, { providers: [], modelsOf: () => [] })
  assert.equal(out.ok, false)
  assert.deepEqual(out.tried.map((t) => t.reason), ['provider', 'provider', 'provider'])
  out = resolveRoleRoute({ toolName: 'x', provider: 'p', model: 'm' }, { providers: ['p'], modelsOf: () => ['other'] })
  assert.equal(out.ok, true)
  assert.equal(out.warning, 'model-unadvertised')
  assert.equal(out.degraded, false)
  out = resolveRoleRoute(role, { providers: ['qwen-token-plan-cn'], modelsOf: () => undefined })
  assert.equal(out.ok, true)
  assert.equal(out.degraded, false)
})

ok('roles: 只有账号登录（没有 API Key）时也能沿链降级到 deepseek-account（v0.11/AC-5）', () => {
  const { roles } = mergeRoles(undefined)
  const analyst = roles.find((r) => r.toolName === 'analyst')
  // 机器上只注册了 deepseek-account（登录态），没有 deepseek-official（API Key）
  const resolved = resolveRoleRoute(analyst, {
    providers: new Set(['deepseek-account']),
    modelsOf: (provider) => (provider === 'deepseek-account' ? ['deepseek-flash', 'deepseek-v4-pro'] : undefined),
  })
  assert.equal(resolved.ok, true, '账号 provider 必须能接住内置角色的降级')
  assert.equal(resolved.degraded, true)
  assert.equal(resolved.role.provider, 'deepseek-account')
  assert.equal(resolved.role.model, 'deepseek-flash', '链首是账号的 flash')
  // 完全不认识的 provider → 仍然 fail-loud
  const dead = resolveRoleRoute(analyst, { providers: new Set(['other']), modelsOf: () => undefined })
  assert.equal(dead.ok, false, '链上没有任何可用 provider 时必须失败（不许假装成功）')
})

ok('roles: 内置表提供跨 provider 备用链；用户覆盖但未写链则不继承（决策 1）', () => {
  const { roles } = mergeRoles(undefined)
  for (const role of roles) {
    if (role.provider === 'deepseek-official') continue
    assert.ok(Array.isArray(role.fallbackModels) && role.fallbackModels.length > 0, `${role.toolName} 必须带备用链`)
    // v0.11：dsh-base 自带两个 DeepSeek provider（账号登录 deepseek-account / API Key deepseek-official），
    // 链只能指向它们——第三方网关/订阅不一定注册。顺序上账号优先（普通用户更可能是登录态）。
    const deepseekProviders = new Set(['deepseek-account', 'deepseek-official'])
    assert.ok(role.fallbackModels.every((ref) => deepseekProviders.has(parseRouteRef(ref)?.provider)),
      `${role.toolName} 的备用链必须兜到 dsh 自带的 DeepSeek provider：${role.fallbackModels}`)
    assert.equal(parseRouteRef(role.fallbackModels[0])?.provider, 'deepseek-account',
      `${role.toolName} 的备用链应当账号优先（登录态更常见）：${role.fallbackModels}`)
  }
  const overridden = mergeRoles({ roles: { analyst: { persona: '自定义' } } }).roles.find((r) => r.toolName === 'analyst')
  assert.equal(overridden.strict, true)
  assert.equal(overridden.fallbackModels, undefined, '显式配置的角色不得自动继承内置备用链')
  const explicit = mergeRoles({ roles: { analyst: { fallbackModels: ['x/y'] } } }).roles.find((r) => r.toolName === 'analyst')
  assert.deepEqual(explicit.fallbackModels, ['x/y'])
  const bad = mergeRoles({ roles: { analyst: { fallbackModels: ['no-slash'] } } })
  assert.equal(bad.roles.some((r) => r.toolName === 'analyst'), false)
  assert.ok(bad.problems.some((p) => p.includes('fallbackModels')), JSON.stringify(bad.problems))
})

await okAsync('v0.6 剪枝路径：只有 deepseek-official 时 5 个角色按内置链降级而非剪枝（chains/A9）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-prune-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const llm = {
      listProviders: () => [{ id: 'deepseek-official' }],
      listModels: async () => [{ id: 'deepseek-flash' }],
    }
    const presets = makeFakeAgentPresets()
    const fake = makeComposeCtx({ llm, agentPresets: presets.service, loader: makeContractLoader() })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report = await waitForReport(reportPathOf(tmp), 8000)
    assert.deepEqual(report.invalid, [], '内置链应消化 provider 缺失，不剪枝')
    assert.equal(report.registered.length, BUILTIN_COUNT, '所有角色都应注册（不可用主路由走备用档）')
    for (const name of ['analyst', 'planner', 'coder', 'reviewer', 'scribe', 'vision']) {
      const row = report.registered.find((r) => r.toolName === name)
      assert.equal(row.degraded, true, `${name} 必须标记为降级`)
      assert.equal(row.provider, 'deepseek-official', `${name} 必须落到 deepseek-official`)
      assert.ok(typeof row.primary === 'string' && row.primary.includes('/'), `${name} 必须记录原路由`)
    }
    assert.equal(report.registered.find((r) => r.toolName === 'scout').degraded, undefined, '主路由可用的角色不得标降级')
    assert.equal(presets.definitions.size, BUILTIN_COUNT, 'preset 全部保留（模型不属于 preset）')
    assert.deepEqual(fake.calls.disposes.map((c) => c.toolName).sort(), ['analyst', 'coder', 'planner', 'reviewer', 'scribe', 'vision'],
      '降级角色重挂 fiber：旧 fiber 必须 dispose')
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

// --- v0.6 T9：补齐 A7/A15/A16（重复 id 隔离 / 服务超时后到达 / 基底取数失败）---
await okAsync('v0.6 重复 id：该角色 failed、其余照常注册（v0.6/A7）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-dup-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const presets = makeFakeAgentPresets()
    await presets.service.register({ id: 'rolegroup-planner', plugins: [] }) // 预置同 id 冲突
    const fake = makeComposeCtx({ agentPresets: presets.service, loader: makeContractLoader() })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report = await waitForReport(reportPathOf(tmp), 8000)
    assert.deepEqual(report.failed, ['planner'], '只有冲突角色失败，其余不受影响')
    assert.equal(report.registered.length, BUILTIN_COUNT - 1)
    assert.ok(
      fake.logs.error.some((m) => m.includes('planner') && m.includes('Duplicate agent preset')),
      `日志须带 actionable 的重复 id 错误：${JSON.stringify(fake.logs.error)}`,
    )
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('v0.6 服务超时后才到达：不补注册 + 一条"超时后到达"warn（v0.6/A15）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-late-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  try {
    const fake = makeComposeCtx({
      agentPresets: null,
      loader: makeContractLoader(),
      // 服务在超时（20ms）之后才到达：apply 必须已按“缺席”降级，只补 warn 不补注册
      injectImpl: (deps, cb) => { setTimeout(() => cb({ agentPresets: makeFakeAgentPresets().service }), 60) },
    })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5, presetsReadyTimeoutMs: 20 })
    const report = await waitForReport(reportPathOf(tmp), 8000)
    assert.equal(fake.calls.plugin.length, 0, '超时后到达不得补注册角色')
    assert.deepEqual(report.failed, Object.keys(DEFAULT_ROLES))
    await waitForCond(
      () => fake.logs.warn.some((m) => m.includes('超时后到达')),
      '超时后到达的 warn',
      3000,
    )
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('v0.6 基底取数失败：全 failed + actionable error、不抛（v0.6/A16）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-nobase-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    // persona/tool-subagent 可解析，但 loader 里没有任何 preset 声明 → 基底取数失败
    const loader = {
      import: async (specifier) => (
        specifier === '@deepseek-ai/dsh-tool-subagent' || specifier === '@deepseek-ai/dsh-persona' ? {} : undefined
      ),
      entries: () => [],
    }
    const fake = makeComposeCtx({ loader })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report = await waitForReport(reportPathOf(tmp), 8000)
    assert.equal(fake.calls.plugin.length, 0, '基底取数失败时不得注册角色')
    assert.deepEqual(report.failed, Object.keys(DEFAULT_ROLES))
    assert.ok(
      fake.logs.error.some((m) => m.includes('无法读取') && m.includes('agent preset')),
      `必须有 actionable error：${JSON.stringify(fake.logs.error)}`,
    )
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

// --- v0.6 收口自审加固：契约缺席 + 热重组装时 fail-loud 不得丢失 ---
await okAsync('v0.6 契约缺席时重组装：failed[] 仍须全量（fail-loud 不被清空）（v0.6/A12 补充）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v6-fail-loud-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  const timers = makeFakeTimers()
  __setTestOverrides({
    debounceMs: 3000, maxWaitMs: 10000,
    setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn,
    watchDebounceMs: 300, presetsReadyTimeoutMs: 20,
  })
  try {
    const fake = makeComposeCtx({
      agentPresets: null, // 契约缺席（0.2.0 场景）
      loader: makeContractLoader(),
      injectImpl: (deps, cb) => { setTimeout(() => cb({ agentPresets: undefined }), 5) },
    })
    const entry = makeEntryConfig([], true)
    await apply(fake.ctx, entry.config)
    timers.advance(3000) // 首次终验
    await readReportWhen(tmp, (r) => Array.isArray(r.failed) && r.failed.length === BUILTIN_COUNT)
    // 面板保存 → volatile 热重组装（此时契约仍缺席）
    entry.setRoles([{ toolName: 'coder', provider: 'kimi-coding', model: 'k3' }])
    fake.fireVolatile()
    timers.advance(300)
    // 等到第二次 finalize 的摘要日志（第 2 条「N 个角色…」）
    await waitForCond(
      () => fake.logs.info.concat(fake.logs.warn).filter((m) => m.includes('个角色')).length >= 2,
      '热重组装后的 finalize 摘要',
      8000,
    )
    const report = JSON.parse(readFileSync(reportPathOf(tmp), 'utf8'))
    assert.deepEqual(report.registered, [], '契约缺席时不得注册角色')
    assert.deepEqual(report.failed, Object.keys(DEFAULT_ROLES), '重组装后 failed[] 仍须全量（fail-loud 不被清空）')
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('apply 降级可见性：preset broken → 系统提示公告含「运行时降级」与角色名（v0.7/AC-12 集成）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-v7-degraded-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const presets = makeFakeAgentPresets({ brokenIds: new Set(['rolegroup-analyst']) })
    const fake = makeComposeCtx({ agentPresets: presets.service, loader: makeContractLoader() })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    await readReportWhen(tmp, (r) => Array.isArray(r.invalid) && r.invalid.length > 0)
    const announcement = fake.calls.announcements.at(-1) ?? ''
    assert.ok(announcement.includes('运行时降级'), `公告必须让模型看见降级：${announcement.slice(0, 200)}`)
    assert.ok(announcement.includes('analyst'), '降级段必须点名具体角色')
    assert.ok(announcement.includes('/rolegroup doctor'), '必须给出排障入口')
    assert.ok(!announcement.includes('`analyst`'), '被剔除的角色不得再出现在在册列表里')
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

// --- T3：client 构建管线（plans/v0.3-gui-panel.md §4 T3，v0.3/AC-17..AC-19）---
await okAsync('build-client: 产物形状与官方 wrapper 同构——首行 load 调用 / id / 尾两行 / 全文无顶层 import/export（v0.3/AC-17）', async () => {
  const { execFileSync } = await import('node:child_process')
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  execFileSync(process.execPath, [join(repoRoot, 'scripts/build-client.mjs')], { stdio: 'pipe' })
  const bundle = readFileSync(join(repoRoot, 'lib/client.js'), 'utf8')
  const lines = bundle.trimEnd().split('\n')
  assert.ok(lines[0].startsWith('window.__ModuleLoader__.load({'), `首行须以 wrapper 开头，实为: ${lines[0]}`)
  assert.ok(/id:\s*["']dsh-rolegroup["']/.test(bundle), '产物须含 id: "dsh-rolegroup"（单引号等价形式亦可）')
  // 收尾三元组 = plan §2.6 footer 逐字形状（与官方产物尾部同构：return → 闭 factory → 闭 load）
  assert.deepEqual(lines.slice(-3).map((l) => l.trim()), ['return module.exports;', '}', '});'], `尾部三行实为: ${JSON.stringify(lines.slice(-3))}`)
  assert.ok(!/^\s*(import|export)\s/m.test(bundle), '产物不得有顶层 import/export 语句')
})

await okAsync('build-client: node 侧模拟 __ModuleLoader__ 消费产物——factory exports 含 apply/inject 且与 src 声明一致（v0.3/AC-18）', async () => {
  const { execFileSync } = await import('node:child_process')
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  execFileSync(process.execPath, [join(repoRoot, 'scripts/build-client.mjs')], { stdio: 'pipe' })
  const bundle = readFileSync(join(repoRoot, 'lib/client.js'), 'utf8')
  let captured
  const fakeWindow = { __ModuleLoader__: { load(r) { captured = r } } }
  new Function('window', bundle)(fakeWindow)
  assert.ok(captured, 'window.__ModuleLoader__.load 未被调用')
  assert.equal(captured.id, 'dsh-rolegroup')
  const stubRequire = (name) => ({ __stub: name }) // 对 'react' 等外部依赖返回桩对象，不得抛
  const exported = captured.factory(stubRequire)
  assert.equal(typeof exported.apply, 'function', 'exports.apply 须为函数')
  const srcMod = await import(new URL('../src/client/index.js', import.meta.url))
  assert.ok(Array.isArray(exported.inject), 'exports.inject 须为数组')
  assert.deepEqual(exported.inject, srcMod.inject, '产物 inject 须与 src/client/index.js 声明一致')
  assert.deepEqual(exported.inject, ['slots', 'locale', 'remote', 'remote.session', 'configForms'],
    '0.1.7 的 5 元素：settingsScope 已被 configForms 取代')
})

// --- 「配置文件」查看器：host 侧快照纯函数 + 只读路由 ---
// 背景（2026-10-21 用户需求）：设置页加「配置文件」按钮，点击显示当前配置信息。
// 数据必须来自 host（jsonc 文件内容/路径只有 host 读得到）；浏览器侧只渲染快照。
// 纯函数保证 node 可测；路由安装器在没有 webServer 的宿主上必须安静跳过（红线 1）。


// --- v0.3 GUI 面板 T4：client controller 纯逻辑（plans/v0.3-gui-panel.md §2.4/§4 T4，v0.3/AC-20..AC-27）---
// 假 scope 对齐 0.1.7 的 ConfigFormController 契约（`ctx.configForms.get(entryId)` 的返回面：
// getSnapshot() → {status,value,base,user,revision,writable,mode}；subscribe(cb)→退订；
// mutate(ops, expectedRevision)；unset 语义 = 清用户层该路径、解析值回落到 base）。
// 本桩如实模拟「unset → 回落 base」，否则重置用例会假绿。
// 假 ctx 只提供 remote.session.modelCatalog()。全部离线、零真实计时器（setImmediate 仅作微任务冲刷，沿用既有先例）。
import { RolegroupCardController } from '../src/client/controller.js'

const SECTION_ALL = () => rolesToSection(mergeRoles(undefined).roles) // 全量内置表（每个用例独立拷贝）

function makeFakeScope({ value, base, user, revision = 3, writable = true, status = 'ready' }) {
  let snapshot = { status, value, base, user, revision, writable, mode: 'host' }
  const listeners = new Set()
  const calls = { mutate: [], unset: [] }
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  const notify = () => { for (const cb of [...listeners]) cb() }
  return {
    calls,
    getSnapshot: () => snapshot,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    mutate: async (ops, expectedRevision) => {
      calls.mutate.push({ ops: clone(ops), expectedRevision })
      const next = clone(snapshot.value) ?? {}
      let nextUser = clone(snapshot.user)
      for (const op of ops) {
        const path = op.path.join('/')
        if (op.op === 'set') {
          next[path] = clone(op.value)
          nextUser = { ...(nextUser ?? {}), [path]: clone(op.value) }
        } else { // unset → 清用户层该路径，解析值回落 base
          const fallback = clone(snapshot.base?.[path])
          if (fallback === undefined) delete next[path]
          else next[path] = fallback
          if (nextUser !== undefined) delete nextUser[path]
        }
      }
      snapshot = { ...snapshot, value: next, user: nextUser, revision: snapshot.revision + 1 }
      notify()
    },
    unset: async (field) => {
      calls.unset.push(field)
      snapshot = { ...snapshot, value: clone(snapshot.base), user: undefined, revision: snapshot.revision + 1 }
      notify()
    },
    // 测试辅助：模拟他处保存——推进 revision 并换新生效值
    advanceExternal(nextValue) {
      snapshot = { ...snapshot, value: nextValue, user: clone(nextValue), revision: snapshot.revision + 1 }
      notify()
    },
  }
}

function makeFakeClientCtx(catalogResult) {
  const calls = []
  return {
    calls,
    remote: { session: { modelCatalog: async () => { calls.push(1); return catalogResult } } },
  }
}

const flushMicrotasks = () => new Promise((r) => setImmediate(r))
const IDLE_CTX = () => makeFakeClientCtx({ ok: true, value: { groups: [], failures: [] } })

ok('controller: 投影初始态——available/writable 取自 scope、rows=生效值 7 行、dirty:false、basePresent、catalog 懒加载（v0.3/AC-20）', () => {
  const section = SECTION_ALL()
  const scope = makeFakeScope({ value: section, base: SECTION_ALL(), user: undefined })
  const ctx = IDLE_CTX()
  const controller = new RolegroupCardController(scope, ctx)
  const face = controller.inject()
  const proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.available, true)
  assert.equal(proj.writable, true)
  assert.equal(proj.dirty, false)
  assert.equal(proj.saving, false)
  assert.equal(proj.failed, false)
  assert.equal(proj.conflicted, false)
  assert.equal(proj.rows.length, BUILTIN_COUNT)
  const first = proj.rows[0]
  assert.equal(first.toolName, 'analyst')
  assert.equal(first.provider, 'qwen-token-plan-cn')
  assert.equal(first.model, 'qwen3.8-max')
  assert.ok(!('readonly' in first), 'v0.5 起投影行不得再带 readonly')
  assert.ok(typeof first.persona === 'string' && first.persona.length > 0, 'persona 必须投影')
  assert.ok(typeof first.summary === 'string' && first.summary.length > 0, 'summary 必须投影')
  assert.equal(first.reasoningEffort, '')
  assert.equal(first.isCustom, false)
  assert.deepEqual(first.invalidFields, [])
  assert.equal(proj.basePresent, true)
  // v0.5+：接管位必须被投影出来——卡片据此决定是否显示「尚未接管」说明
  assert.equal(proj.takeover, false, 'snapshot.value 无 enabled → 未接管（生效表来自 jsonc/内置表）')
  assert.equal(proj.catalog.status, 'idle')
  assert.deepEqual(proj.catalog.groups, [])
  assert.equal(proj.catalog.partial, false)
  assert.equal(ctx.calls.length, 0, '未订阅（卡片未展开）前不得调用 modelCatalog')
})

ok('controller: editRole 更新该行投影并置 dirty；discard 回落生效值（v0.3/AC-21）', () => {
  const section = SECTION_ALL()
  const origModel = section.roles.find((r) => r.toolName === 'coder').model
  const scope = makeFakeScope({ value: section, base: SECTION_ALL(), user: undefined })
  const controller = new RolegroupCardController(scope, IDLE_CTX())
  const face = controller.inject()
  face.editRole('coder', 'model', 'k3-x')
  let proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.rows.find((r) => r.toolName === 'coder').model, 'k3-x')
  assert.equal(proj.dirty, true)
  face.discard()
  proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.rows.find((r) => r.toolName === 'coder').model, origModel)
  assert.equal(proj.dirty, false)
})

await okAsync('controller: save 恰好一次 mutate——ops=[set enabled, set roles 整表]、expectedRevision=起草时 revision（v0.4/AC-14）', async () => {
  const section = SECTION_ALL()
  const scope = makeFakeScope({ value: section, base: SECTION_ALL(), user: undefined, revision: 3 })
  const controller = new RolegroupCardController(scope, IDLE_CTX())
  const face = controller.inject()
  face.editRole('coder', 'model', 'k3-x')
  face.save()
  await flushMicrotasks()
  assert.equal(scope.calls.mutate.length, 1, `mutate 必须恰好一次：${JSON.stringify(scope.calls.mutate)}`)
  const { ops, expectedRevision } = scope.calls.mutate[0]
  assert.equal(expectedRevision, 3, 'expectedRevision 必须是起草时的 revision（栅栏）')
  // v0.4：保存 = enabled(true) + roles 两个 op 一次提交（enabled 是 host 的接管判据，D4）
  assert.equal(ops.length, 2, JSON.stringify(ops.map((o) => o.path)))
  assert.equal(ops[0].op, 'set')
  assert.deepEqual(ops[0].path, ['enabled'])
  assert.equal(ops[0].value, true, '保存必须同时置 enabled=true，否则 host 仍视为未接管')
  assert.equal(ops[1].op, 'set')
  assert.deepEqual(ops[1].path, ['roles'])
  assert.equal(ops[1].value.length, BUILTIN_COUNT)
  assert.deepEqual(ops[1].value.map((r) => r.toolName), section.roles.map((r) => r.toolName))
  const coder = ops[1].value.find((r) => r.toolName === 'coder')
  assert.equal(coder.model, 'k3-x')
  assert.equal(coder.provider, 'kimi-coding')
  assert.ok(!('readonly' in coder), 'v0.5 起保存的行不得再带 readonly')
  const proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.saving, false)
  assert.equal(proj.failed, false)
  assert.equal(proj.dirty, false, '落地成功后草稿应清空')
})

await okAsync('controller: 起草后外部推进 revision（模拟他人保存）→ save 不发起 mutate 且 conflicted:true（v0.3/AC-23）', async () => {
  const section = SECTION_ALL()
  const scope = makeFakeScope({ value: section, base: SECTION_ALL(), user: undefined, revision: 3 })
  const controller = new RolegroupCardController(scope, IDLE_CTX())
  const face = controller.inject()
  face.editRole('coder', 'model', 'k3-x')
  const external = SECTION_ALL()
  external.roles.find((r) => r.toolName === 'scribe').model = 'other-model'
  scope.advanceExternal(external)
  let proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.conflicted, true, 'revision 漂移必须置 conflicted')
  face.save()
  await flushMicrotasks()
  assert.equal(scope.calls.mutate.length, 0, '冲突时 save 不得发起 mutate')
  proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.conflicted, true)
  assert.equal(proj.dirty, true, '草稿必须保留，不得静默丢弃')
})


await okAsync('controller: catalog 懒加载 + 合并——ready/partial、已存路由不在目录 → 保留为 available:false 选项（v0.3/AC-25）', async () => {
  const section = SECTION_ALL()
  const scope = makeFakeScope({ value: section, base: SECTION_ALL(), user: undefined })
  const ctx = makeFakeClientCtx({ ok: true, value: {
    groups: [{ id: 'kimi-coding', name: 'Kimi Coding', models: [{ id: 'k3', name: 'K3' }] }],
    failures: ['provider x 超时'],
  } })
  const controller = new RolegroupCardController(scope, ctx)
  const face = controller.inject()
  assert.equal(face.hooks.rolegroupCard.getSnapshot().catalog.status, 'idle')
  assert.equal(ctx.calls.length, 0, '订阅前（卡片未展开）不得拉取')
  const notices = []
  const unsubscribe = face.hooks.rolegroupCard.subscribe(() => notices.push(1))
  assert.equal(typeof unsubscribe, 'function', 'subscribe 必须返回退订函数')
  await flushMicrotasks()
  assert.ok(ctx.calls.length >= 1, '卡片展开（首次订阅）后必须懒拉取一次')
  const proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.catalog.status, 'ready')
  assert.equal(proj.catalog.partial, true, 'failures 非空必须 partial 警示（不阻断）')
  const kimi = proj.catalog.groups.find((g) => g.id === 'kimi-coding')
  assert.ok(kimi.models.some((m) => m.id === 'k3' && m.available === true), '目录内路由必须标 available:true')
  const qwen = proj.catalog.groups.find((g) => g.id === 'qwen-token-plan-cn')
  assert.ok(qwen, '已存 provider 不在目录时必须保留该组（不静默丢配置）')
  assert.ok(qwen.models.some((m) => m.id === 'qwen3.8-max' && m.available === false), JSON.stringify(qwen))
  assert.ok(notices.length >= 1, '投影变化必须通知订阅者')
})

// --- v0.8：接管态面板显示**整张生效表**（未列出的内置角色补成普通行，携带内置备用链）---
ok('controller: 接管态 rows = 整张生效表（含未覆盖的内置角色，带内置路由与备用链）（v0.8/AC-1）', () => {
  const seven = SECTION_ALL().roles.filter((r) => r.toolName !== 'vision') // 模拟老用户：面板只写了 7 行
  const scope = makeFakeScope({ value: { roles: seven, enabled: true }, base: SECTION_ALL() })
  const snap = new RolegroupCardController(scope, IDLE_CTX()).inject().hooks.rolegroupCard.getSnapshot()
  assert.equal(snap.takeover, true)
  assert.equal(snap.rows.length, BUILTIN_COUNT, '接管态必须显示整张生效表（7 覆盖 + 1 内置补全）')
  assert.deepEqual(snap.rows.map((r) => r.toolName), Object.keys(DEFAULT_ROLES), '顺序按内置表')
  const vision = snap.rows.find((r) => r.toolName === 'vision')
  assert.equal(vision.provider, 'qwen-token-plan-cn')
  assert.equal(vision.model, 'qwen3.8-flash')
  assert.deepEqual(vision.fallbackModels, DEFAULT_ROLES.vision.fallbackModels, '补全的行必须带上内置备用链')
  assert.equal(vision.isCustom, false, 'vision 是内置角色，不是自定义行（因此没有删除按钮）')
  assert.equal(snap.dirty, false, '补全不得把自己算成「有改动」')
})

ok('controller: 历史遗留的「显式无链」内置行会被补回内置链（v0.8/AC-5）', () => {
  // 真实场景：0.7.0 之前面板保存的 7 行没有 fallbackModels（面板层当时不携带链）→ 一直是"显式无链"。
  const legacy = SECTION_ALL().roles
    .filter((r) => r.toolName !== 'vision')
    .map((r) => { const { fallbackModels: _dropped, ...rest } = r; return rest })
  assert.equal(legacy.some((r) => r.fallbackModels !== undefined), false, '前置：这批行确实没有链')
  const snap = new RolegroupCardController(
    makeFakeScope({ value: { roles: legacy, enabled: true }, base: SECTION_ALL() }), IDLE_CTX(),
  ).inject().hooks.rolegroupCard.getSnapshot()
  assert.equal(snap.rows.length, BUILTIN_COUNT)
  for (const row of snap.rows) {
    assert.ok(Array.isArray(row.fallbackModels) && row.fallbackModels.length > 0,
      `${row.toolName} 必须补回内置链（否则主路由不可用即剪枝）`)
  }
  // 期望值直接引用内置表：链顺序/内容调整时不用再改测试
  assert.deepEqual(snap.rows.find((r) => r.toolName === 'vision').fallbackModels,
    DEFAULT_ROLES.vision.fallbackModels)
  assert.deepEqual(snap.rows.find((r) => r.toolName === 'analyst').fallbackModels,
    DEFAULT_ROLES.analyst.fallbackModels)
  assert.equal(snap.dirty, false, '补链不得把投影算成「有改动」')
})

ok('controller: 保存整表时**每行都带 fallbackModels**（显式配置不再丢链）（v0.8/AC-2）', async () => {
  const seven = SECTION_ALL().roles.filter((r) => r.toolName !== 'vision')
  const calls = []
  const scope = makeFakeScope({ value: { roles: seven, enabled: true }, base: SECTION_ALL() })
  scope.mutate = async (ops, revision) => { calls.push({ ops, revision }); return revision + 1 }
  const controller = new RolegroupCardController(scope, IDLE_CTX())
  const face = controller.inject()
  face.editRole('coder', 'model', 'k3-edited')
  await face.save()
  assert.equal(calls.length, 1)
  const roles = calls[0].ops.find((op) => op.path.join('.') === 'roles').value
  assert.equal(roles.length, BUILTIN_COUNT, '整表保存')
  for (const row of roles) {
    assert.ok(Array.isArray(row.fallbackModels) && row.fallbackModels.length > 0,
      `${row.toolName} 必须随行带回备用链（否则保存即丢降级）`)
  }
  assert.deepEqual(roles.find((r) => r.toolName === 'vision').fallbackModels,
    DEFAULT_ROLES.vision.fallbackModels)
})

ok('controller: 自定义角色追加在内置之后；未接管时不做补全（v0.8/AC-1 边界）', () => {
  const withCustom = [
    ...SECTION_ALL().roles,
    { toolName: 'my_role', provider: 'kimi-coding', model: 'k3', persona: 'p', summary: 's' },
  ]
  const taken = new RolegroupCardController(
    makeFakeScope({ value: { roles: withCustom, enabled: true }, base: SECTION_ALL() }), IDLE_CTX(),
  )
  const rows = taken.inject().hooks.rolegroupCard.getSnapshot().rows
  assert.deepEqual(rows.map((r) => r.toolName), [...Object.keys(DEFAULT_ROLES), 'my_role'])
  assert.equal(rows.at(-1).isCustom, true)

  // 未接管：rows 来自 host 快照预填（本来就是整张表），不得再补一遍
  const plain = new RolegroupCardController(makeFakeScope({ value: SECTION_ALL(), base: SECTION_ALL() }), IDLE_CTX())
  assert.equal(plain.inject().hooks.rolegroupCard.getSnapshot().rows.length, BUILTIN_COUNT)
})

ok('client-card: 模型不可用时不得断言「不支持推理档位」（v0.11.6/AC-7）', async () => {
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  const { zh, en } = await import(new URL('../src/client/locales.js', import.meta.url))
  // 目录里没有该模型（available:false）≠ 该模型不支持推理；两者必须用不同词条
  assert.ok(/modelInfo\.available === false \? t\('modelUnavailable'\) : t\('reasoningEffortUnsupported'\)/.test(card),
    '可用性未知时必须用「模型不可用」，只有目录明确声明无档位时才说「不支持」')
  for (const [name, dict] of [['zh', zh], ['en', en]]) {
    assert.ok(dict.modelUnavailable && dict.reasoningEffortUnsupported, `${name} 两个词条都必须存在`)
    assert.notEqual(dict.modelUnavailable, dict.reasoningEffortUnsupported, `${name} 两个词条不得复用于同一含义`)
  }
})

await okAsync('client-card: 不再有特殊「继承区」——所有角色都渲染成行；文案词典同步移除（v0.8/AC-3）', async () => {
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  assert.equal(card.includes('state.inherited'), false, 'card 不得再有继承区的特殊分支')
  assert.equal(/dsh-rg-inherited/.test(card), false, '继承区样式/节点必须删除')
  const { zh, en } = await import(new URL('../src/client/locales.js', import.meta.url))
  for (const [name, dict] of [['zh', zh], ['en', en]]) {
    for (const key of ['inheritedNotice', 'inheritedShow', 'inheritedBadge']) {
      assert.equal(Object.hasOwn(dict, key), false, `${name}.${key} 必须删除（不再有特殊处理）`)
    }
  }
})

await okAsync('controller: restoreOfficial = 零覆盖接管（只写 enabled=true + roles=[]，不写模型名）（v0.10/AC-1）', async () => {
  const section = SECTION_ALL()
  const scope = makeFakeScope({ value: { ...section, enabled: true }, base: section, revision: 7 })
  const controller = new RolegroupCardController(scope, IDLE_CTX())
  const face = controller.inject()
  await face.restoreOfficial()
  await flushMicrotasks()
  assert.equal(scope.calls.mutate.length, 1, '必须恰好一次 mutate')
  assert.deepEqual(scope.calls.mutate[0].ops, [
    { op: 'set', path: ['enabled'], value: true },
    { op: 'set', path: ['roles'], value: [] },
  ], '恢复官方推荐 = 零覆盖接管；不得把 8 行模型名抄进配置（否则以后内置默认变了也不跟随）')
  const proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.mode, 'official', '零覆盖接管后投影必须是 official')
})




await okAsync('client-card: 「恢复官方推荐」只在自定义态渲染（官方态不显示灰按钮）（v0.11.4/AC-6）', async () => {
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  // 与「补齐」按钮同一条规则：没活干就不渲染，而不是灰着让人问"为什么点不了"
  assert.ok(/state\.mode === 'custom' \? \([\s\S]*?restoreOfficial[\s\S]*?\) : null/.test(card),
    '恢复官方推荐必须只在 mode==="custom" 时渲染')
  assert.equal(/disabled=\{disabled \|\| state\.mode === 'official'\}/.test(card), false,
    '不得再用「官方态禁用」的灰按钮形式')
})

ok('controller: projection.mode 两态（official / custom）+ overrides 计数（v0.11/AC-3）', () => {
  const section = SECTION_ALL()
  const modeOf = (value) => new RolegroupCardController(
    makeFakeScope({ value, base: section }), IDLE_CTX(),
  ).projection()
  const official = modeOf({ ...section, enabled: true, roles: [] })
  assert.equal(official.mode, 'official', '接管 + 零覆盖 = 跟随官方推荐')
  assert.equal(official.overrides, 0)
  const custom = modeOf({ ...section, enabled: true })
  assert.equal(custom.mode, 'custom', '接管 + 有行 = 面板自定义')
  assert.equal(custom.overrides, section.roles.length)
  assert.equal(modeOf(section).mode, 'official', '未接管 = 没有任何覆盖 = 官方推荐')
})

ok('controller: 未接管时 rows 直接来自内置表（客户端自带 DEFAULT_ROLES，不发请求）（v0.11/AC-4）', () => {
  let fetched = 0
  const controller = new RolegroupCardController(
    makeFakeScope({ value: SECTION_ALL(), base: SECTION_ALL() }),
    IDLE_CTX(),
    { fetch: async () => { fetched += 1; throw new Error('不应发请求') } },
  )
  const rows = controller.inject().hooks.rolegroupCard.getSnapshot().rows
  assert.deepEqual(rows.map((r) => r.toolName), Object.keys(DEFAULT_ROLES), '未接管必须直接渲染内置表')
  assert.equal(rows.length, BUILTIN_COUNT)
  assert.equal(fetched, 0, '未接管时不得再请求宿主（配置文件层已删除）')
})

await okAsync('controller: addRole/removeRole 增删草稿行；非法行（空 provider）投影 invalidFields 且 save 本地拦截（v0.3/AC-26）', async () => {
  const section = SECTION_ALL()
  const scope = makeFakeScope({ value: section, base: SECTION_ALL(), user: undefined })
  const controller = new RolegroupCardController(scope, IDLE_CTX())
  const face = controller.inject()
  face.addRole()
  let proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.rows.length, BUILTIN_COUNT + 1)
  const added = proj.rows[BUILTIN_COUNT]
  assert.ok(TOOL_NAME_RE.test(added.toolName), `生成的工具名必须合法：${added.toolName}`)
  assert.equal(added.isCustom, true)
  assert.ok(added.invalidFields.includes('provider'), JSON.stringify(added.invalidFields))
  assert.ok(added.invalidFields.includes('model'), JSON.stringify(added.invalidFields))
  assert.equal(proj.dirty, true)
  face.save()
  await flushMicrotasks()
  assert.equal(scope.calls.mutate.length, 0, '非法行必须本地拦截，不得发起 mutate')
  assert.equal(face.hooks.rolegroupCard.getSnapshot().failed, true)
  face.editRole(added.toolName, 'provider', 'kimi-coding')
  face.editRole(added.toolName, 'model', 'k3')
  proj = face.hooks.rolegroupCard.getSnapshot()
  assert.deepEqual(proj.rows[7].invalidFields, [])
  face.removeRole(added.toolName)
  proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.rows.length, BUILTIN_COUNT)
  assert.equal(proj.dirty, false, '增后又删回必须与生效值一致')
})





await okAsync('controller: 推理档位按模型目录校验——非法值标红并拦截保存；切模型清掉不支持的旧档位（reasoning-effort/AC-1）', async () => {
  const section = SECTION_ALL()
  const scope = makeFakeScope({ value: section, base: SECTION_ALL(), user: undefined })
  const ctx = makeFakeClientCtx({
    ok: true,
    value: {
      groups: [{
        id: 'kimi-coding',
        name: 'Kimi Coding',
        models: [
          { id: 'k3', name: 'K3', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }], defaultEffort: 'high' } },
          { id: 'k3.1-pro', name: 'K3.1 Pro', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }], defaultEffort: 'high' } },
          { id: 'k3-256k', name: 'K3-256K', reasoning: { efforts: [{ id: 'high', name: 'High' }] } },
          { id: 'kimi-for-coding', name: 'Kimi For Coding' },
        ],
      }],
      failures: [],
    },
  })
  const controller = new RolegroupCardController(scope, ctx)
  const face = controller.inject()
  const unsubscribe = face.hooks.rolegroupCard.subscribe(() => {})
  await flushMicrotasks()
  assert.equal(face.hooks.rolegroupCard.getSnapshot().catalog.status, 'ready')

  // 非法档位：行级 invalid + 保存拦截
  face.editRole('coder', 'reasoningEffort', 'bogus')
  let proj = face.hooks.rolegroupCard.getSnapshot()
  let row = proj.rows.find((candidate) => candidate.toolName === 'coder')
  assert.ok(row.invalidFields.includes('reasoningEffort'), JSON.stringify(row))
  face.save()
  await flushMicrotasks()
  assert.equal(scope.calls.mutate.length, 0, '非法推理档位必须拦截保存')

  // 合法档位 → invalid 清掉
  face.editRole('coder', 'reasoningEffort', 'max')
  proj = face.hooks.rolegroupCard.getSnapshot()
  row = proj.rows.find((candidate) => candidate.toolName === 'coder')
  assert.ok(!row.invalidFields.includes('reasoningEffort'))

  // 切到只支持 high 的模型：旧档位 max 必须被清掉
  face.editRole('coder', 'model', 'k3-256k')
  proj = face.hooks.rolegroupCard.getSnapshot()
  row = proj.rows.find((candidate) => candidate.toolName === 'coder')
  assert.equal(row.reasoningEffort, '', '新模型不支持的旧档位必须在切模型时清空')

  // 切到明确不支持推理的模型：档位同样清空
  face.editRole('coder', 'reasoningEffort', 'high')
  face.editRole('coder', 'model', 'kimi-for-coding')
  proj = face.hooks.rolegroupCard.getSnapshot()
  row = proj.rows.find((candidate) => candidate.toolName === 'coder')
  assert.equal(row.reasoningEffort, '', '不支持推理的模型必须清空档位')
  unsubscribe()
})

await okAsync('controller: provider 未注册 → routeGaps + 一键补齐到默认/首个可用模型；无缺口时按钮不渲染（fill/AC-1）', async () => {
  // v0.11：接管态显示整张表（内置补全），所以缺口 = 所有 provider 不在目录里的内置角色。
  // 目录里给 deepseek + kimi，缺的只有 qwen → 缺口应恰好是 4 个 qwen 角色。
  const mkCatalog = (withDefault) => ({
    groups: [
      { id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-flash', name: 'deepseek-flash' }, { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro' }] },
      { id: 'kimi-coding', name: 'Kimi', models: [{ id: 'k3.1-pro', name: 'k3.1-pro' }] },
    ],
    failures: [],
    ...(withDefault ? { default: { provider: 'deepseek-official', model: 'deepseek-v4-pro' } } : {}),
  })
  const makeController = (catalog) => {
    const scope = makeFakeScope({ value: { enabled: true, roles: [] }, base: SECTION_ALL(), user: undefined })
    return new RolegroupCardController(scope, makeFakeClientCtx({ ok: true, value: catalog }))
  }

  // ① 有部署默认路由 → 补到默认
  const controller = makeController(mkCatalog(true))
  const face = controller.inject()
  const unsubscribe = face.hooks.rolegroupCard.subscribe(() => {})
  await flushMicrotasks()
  let proj = face.hooks.rolegroupCard.getSnapshot()
  assert.deepEqual(proj.routeGaps.map((g) => g.toolName), ['analyst', 'reviewer', 'scribe', 'vision'],
    '只标 provider 未注册的行（qwen 系 4 个）')
  face.fillUnavailableRoutes()
  proj = face.hooks.rolegroupCard.getSnapshot()
  for (const name of ['analyst', 'reviewer', 'scribe', 'vision']) {
    const row = proj.rows.find((r) => r.toolName === name)
    assert.equal(row.provider, 'deepseek-official', `${name} 必须补到已注册 provider`)
    assert.equal(row.model, 'deepseek-v4-pro', `${name} 必须优先用部署默认路由`)
    assert.equal(row.reasoningEffort, '', '换模型后清掉旧推理档位')
  }
  assert.equal(proj.dirty, true, '补齐只改草稿，不自动保存')
  assert.deepEqual(proj.routeGaps, [], '补齐后不再有缺口')
  assert.equal(proj.rows.find((r) => r.toolName === 'scout').provider, 'deepseek-official', '可用行不得被改动')
  unsubscribe()

  // ② 没有默认路由 → 取第一个可用 provider 的第一个模型
  const noDefault = makeController(mkCatalog(false)).inject()
  noDefault.hooks.rolegroupCard.subscribe(() => {})
  await flushMicrotasks()
  noDefault.fillUnavailableRoutes()
  const proj2 = noDefault.hooks.rolegroupCard.getSnapshot()
  const row = proj2.rows.find((r) => r.toolName === 'analyst')
  assert.deepEqual([row.provider, row.model], ['deepseek-official', 'deepseek-flash'])
})

ok('settings-nav-icon: 按 label 标记带 svg 的导航按钮；CSS 走 mask；无 document 安全 no-op', () => {
  const svg = { tagName: 'svg' }
  const target = { textContent: '角色配置', dataset: {}, firstElementChild: svg }
  const other = { textContent: '通用设置', dataset: {}, firstElementChild: svg }
  assert.equal(markSettingsNavButton([other, target], '角色配置'), target)
  assert.equal(target.dataset.dshRgNav, '')
  assert.equal(markSettingsNavButton([other], '角色配置'), undefined)
  assert.ok(NAV_ICON_CSS.includes('button[data-dsh-rg-nav]'))
  assert.ok(NAV_ICON_CSS.includes('mask'))
  const dispose = installSettingsNavIcon(() => '角色配置', { document: undefined })
  dispose()
})

await okAsync('settings-nav-icon: 注入样式并标记设置导航按钮，dispose 清理（DOM 装饰回归）', async () => {
  const appended = []
  const style = { setAttribute() {}, textContent: '', remove() { this.removed = true } }
  const button = { textContent: '角色配置', dataset: {}, firstElementChild: { tagName: 'svg' } }
  const doc = {
    body: {},
    head: { append(child) { appended.push(child) } },
    createElement() { return style },
    querySelectorAll(selector) { return selector === 'button' ? [button] : [button] },
  }
  const dispose = installSettingsNavIcon(() => '角色配置', {
    document: doc,
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => fn(),
  })
  assert.deepEqual(appended, [style])
  assert.equal(button.dataset.dshRgNav, '')
  dispose()
  assert.equal(style.removed, true)
})




ok('controller: 零浏览器依赖——controller.js 全文无 document/window/react 字样（v0.3/AC-27）', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/client/controller.js', import.meta.url)), 'utf8')
  assert.ok(!/document|window|react/.test(src), 'controller.js 不得出现 document/window/react')
})

// --- v0.4 settings 迁移 T5：client 组件 + 槽位注册（plans/v0.4-settings-migration.md D7/T5）---
// AC-27/28/29 为实测类（需重启 dsh web + 人工操作），本文件只落源码文本级断言。
// 纪律：node 解析不了 JSX——src/client/card.jsx 一律 readFileSync 原文断言，不得 import。

await okAsync('client-index: 槽位注册参数与 v0.4 契约一致——5 元素 inject / settings.section / id / whileServed 门控（v0.4/AC-17、AC-18）', async () => {
  const src = readFileSync(fileURLToPath(new URL('../src/client/index.js', import.meta.url)), 'utf8')
  const srcMod = await import(new URL('../src/client/index.js', import.meta.url))
  assert.deepEqual(srcMod.inject, ['slots', 'locale', 'remote', 'remote.session', 'configForms'],
    'inject 服务清单须为 0.1.7 的 5 元素：settingsScope 已被 configForms 取代')
  for (const needle of [
    "ctx.locale.register('rolegroup', { zh, en })",
    "'dsh-rolegroup: dictionaries'",
    "ctx.configForms.get(ROLEGROUP_CLIENT_NS)",
    "ctx.configForms.whileServed([ROLEGROUP_CLIENT_NS]",
    "ctx.slots.inject('settings.section'",
    "name: 'settings.section'",
    "id: 'rolegroup'",
    "locale: 'rolegroup'",
    'inject: () => controller.inject()',
    'RolegroupCard',
  ]) {
    assert.ok(src.includes(needle), `src/client/index.js 缺少 v0.4 契约片段：${needle}`)
  }
  // 旧契约必须彻底消失（否则是半迁移状态）
  for (const dead of ['settingsScope', 'settings.plugin.item', "key: 'rolegroup'"]) {
    assert.ok(!src.includes(dead), `src/client/index.js 仍残留已失效的旧契约：${dead}`)
  }
  assert.equal(srcMod.inject.includes('settingsScope'), false)
})

await okAsync('docs: MODELS 表 = 内置默认（单一事实源）+ 中英一致 + README 各链各版（models-doc/AC-1..4）', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const parse = (file) => {
    const md = readFileSync(join(root, file), 'utf8')
    const rows = [...md.matchAll(/^\| `([a-z][a-z0-9_]*)` \| `([^`]+)` \|/gm)]
      .map((m) => ({ toolName: m[1], model: m[2] }))
    return { md, rows }
  }
  const zh = parse('MODELS.md')
  const en = parse('MODELS.en.md')
  for (const [file, doc] of [['MODELS.md', zh], ['MODELS.en.md', en]]) {
    // AC-1：角色集合必须与 DEFAULT_ROLES 完全一致（新增角色忘了写文档 → 红）
    assert.deepEqual(doc.rows.map((r) => r.toolName).sort(), Object.keys(DEFAULT_ROLES).sort(),
      `${file} 的角色集合必须与 DEFAULT_ROLES 一致`)
    // AC-2：推荐模型必须逐字等于代码里的内置默认（用户 2026-11-13 决定：两者不该是两个值）
    for (const row of doc.rows) {
      assert.equal(row.model, DEFAULT_ROLES[row.toolName].model,
        `${file} 中 ${row.toolName} 的推荐模型与 lib/roles.js 不一致（文档 ${row.model} vs 代码 ${DEFAULT_ROLES[row.toolName].model}）`)
      assert.equal(row.model.includes('/'), false, `${file} 不得写 provider（如 kimi-coding/k3）：用户的使用方式不同，provider 由配置决定`)
    }
  }
  // AC-2b：两版必须一致
  assert.deepEqual(zh.rows.map((r) => [r.toolName, r.model]).sort(), en.rows.map((r) => [r.toolName, r.model]).sort(),
    'MODELS.md 与 MODELS.en.md 的推荐值必须一致')
  // AC-3：中文 README 链中文表，英文 README 链英文表
  assert.ok(readFileSync(join(root, 'README.md'), 'utf8').includes('MODELS.md'), 'README.md 必须链接 MODELS.md')
  assert.ok(readFileSync(join(root, 'README.en.md'), 'utf8').includes('MODELS.en.md'), 'README.en.md 必须链接 MODELS.en.md')
  // AC-4：文档自身不得链接私有目录，且保持一屏内
  for (const [file, doc] of [['MODELS.md', zh], ['MODELS.en.md', en]]) {
    const leaked = [...doc.md.matchAll(/\]\(((?:docs|plans|evals|\.handoff|\.dsh)\/[^)]*)\)/g)].map((m) => m[1])
    assert.deepEqual(leaked, [], `${file} 不得链接未公开目录：${leaked.join(', ')}`)
    // 不锁行数（用户 2026-11-13：行数不是问题，废话才是）。改为锁「别写死内部实现」：
    // 文档会公开，出现源码路径 / 内部术语就说明写错了对象。
    for (const banned of ['lib/', 'src/client/', 'mergeRoles', 'fillBuiltinRows', 'projection.']) {
      assert.equal(doc.md.includes(banned), false, `${file} 面向用户，不得出现内部实现细节「${banned}」`)
    }
  }
  // AC-6：README 里的角色数/测试数必须跟着代码走
  const zhReadme = readFileSync(join(root, 'README.md'), 'utf8')
  assert.ok(zhReadme.includes(`${BUILTIN_COUNT} 个在册角色`), `README 的 doctor 示例必须写 ${BUILTIN_COUNT} 个在册角色`)
  assert.ok(!/7 个(在册角色|「角色)/.test(zhReadme), 'README 不得残留「7 个角色」的旧数字')
  assert.ok(!zhReadme.includes('156 项'), 'README 不得残留 156 项测试的旧数字')
  const enReadme = readFileSync(join(root, 'README.en.md'), 'utf8')
  assert.ok(!/156 cases/.test(enReadme), 'README.en.md 不得残留 156 cases')
  // AC-7：写作风格笔记是本机文件，不得入库
  assert.equal(existsSync(join(root, 'STYLE.md')), false, 'STYLE.md 不得出现在仓库里（应放 AGENTS.local.md）')
})

await okAsync('docs: README.md 与 README.en.md 章节编号 parity（双语防漂移）', async () => {
  // 双语 README 最大的风险是"只改一份"。用**语言无关的章节编号**做锚：
  // 两份必须节数相同、编号逐项相同、且每节都有实质正文（防占位空节漂移）。
  const read = (f) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8')
  const sectionsOf = (md) => [...md.matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]))
  const zhMd = read('README.md')
  const enMd = read('README.en.md')
  const zh = sectionsOf(zhMd)
  const en = sectionsOf(enMd)
  assert.ok(zh.length >= 8, `README.md 的编号章节只有 ${zh.length} 个——是否漏了 "## N. " 编号格式？`)
  assert.deepEqual(zh, zh.map((_, i) => i + 1), 'README.md 章节编号必须从 1 起连续')
  assert.deepEqual(en, zh, 'README.en.md 的章节编号必须与 README.md 逐项一致（数量与顺序）')
  // 每节都要有实质正文（防"一边写了、另一边留空"）。License 这类天然短节按标题豁免。
  const SHORT_OK = /^\s*(?:\d+\.\s*)?(?:License|许可)/i
  for (const [file, md] of [['README.md', zhMd], ['README.en.md', enMd]]) {
    for (const m of md.matchAll(/^## (\d+)\.\s*(.*)$/gm)) {
      const [, num, title] = m
      const body = md.slice(m.index + m[0].length).split(/^## \d+\./m)[0]
      assert.ok(body.trim().length > 0, `${file} §${num} 是空节`)
      if (!SHORT_OK.test(title)) {
        assert.ok(body.trim().length > 40, `${file} §${num}（${title.trim()}）正文过短（疑似占位漂移）`)
      }
    }
  }
  // 公开面纪律（2026-09-30 定）：README 必须**自包含**——docs/ plans/ evals/ 不随仓库公开，
  // 所以两份 README 都不得出现指向它们的链接（否则公开后是死链）。这条锁防止以后又加回去。
  for (const [file, md] of [['README.md', zhMd], ['README.en.md', enMd]]) {
    const leaked = [...md.matchAll(/\]\(((?:docs|plans|evals|\.dsh)\/[^)]*)\)/g)].map((m) => m[1])
    assert.deepEqual(leaked, [], `${file} 不得链接未公开目录（docs/ plans/ evals/ .dsh/）：${leaked.join(', ')}`)
  }
})

await okAsync('公开面卫生：追踪文件不得来自过程档案目录、不得含个人绝对路径（公开面纪律）', async () => {
  // 2026-09-30 起开发主场在本仓库；过程档案是**本机未跟踪**的 .handoff/（见 AGENTS.local.md）。
  // 这条锁防止档案内容漏进版本库 —— 它替代了原先的「导出公开子集」流程（那个方向已不存在）。
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  let tracked
  try {
    tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((f) => f.trim()).filter(Boolean)
  } catch {
    return // 非 git 工作树（如 tarball）跳过，不误报
  }
  // 判别式：本机存在 .handoff/ ⇒ 这是**公开仓的开发工作区**（档案以本机目录形式并存）。
  // 此时 docs/ plans/ evals/ .dsh/ 一律不得入库；否则只需保证 .handoff/ 本身不被跟踪。
  // 这样同一条断言在两种上下文里都成立，不必分叉测试文件。
  const publicDevHome = existsSync(join(repoRoot, '.handoff'))
  const PRIVATE_DIR = publicDevHome
    ? /^(\.handoff|docs|plans|evals|\.dsh)\//
    : /^\.handoff\//
  const fromArchive = tracked.filter((f) => PRIVATE_DIR.test(f))
  assert.deepEqual(fromArchive, [], `以下追踪文件来自过程档案目录，不应入库：${fromArchive.join(', ')}`)

  const persons = []
  for (const f of tracked) {
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf)$/i.test(f)) continue
    let text
    try { text = readFileSync(join(repoRoot, f), 'utf8') } catch { continue }
    for (const m of text.matchAll(/\/Users\/[A-Za-z0-9_.-]+\//g)) persons.push(`${f}: ${m[0]}`)
  }
  assert.deepEqual(persons, [], `追踪文件含个人绝对路径：${persons.slice(0, 5).join(' | ')}`)
})

await okAsync('client-locales: 词典 zh/en key 集 parity 且 card.jsx 每个 t() key 均在词典中（v0.3/AC-28）', async () => {
  const { zh, en } = await import(new URL('../src/client/locales.js', import.meta.url))
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), 'zh/en 词典 key 集必须 parity')
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  const keys = [...card.matchAll(/(?:^|[^\w.])t\(\s*'([A-Za-z][\w]*)'/g)].map((m) => m[1])
  assert.ok(keys.length > 0, 'card.jsx 必须经 t() 读取文案')
  for (const key of new Set(keys)) {
    assert.ok(Object.hasOwn(zh, key), `card.jsx 的 t('${key}') 缺 zh 词条`)
    assert.ok(Object.hasOwn(en, key), `card.jsx 的 t('${key}') 缺 en 词条`)
  }
})

ok('plugin-meta: 插件市场/插件页的说明来自 locale/{en,zh}.json 的 meta 块，exports/files 必须放行（market-meta/AC-1）', () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  // dsh 的 readPluginMeta 用 `<pkg>/locale/<lang>.json` 解析本地化标题与说明；exports 不放行则解析失败
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json', 'exports 必须导出 locale/*.json')
  assert.ok(pkg.files.includes('locale'), 'files 必须包含 locale（否则打包漏掉）')
  assert.ok(typeof pkg.description === 'string' && pkg.description.trim() !== '', 'package.json 必须有回退 description')

  const zh = JSON.parse(readFileSync(join(repoRoot, 'locale/zh.json'), 'utf8'))
  const en = JSON.parse(readFileSync(join(repoRoot, 'locale/en.json'), 'utf8'))
  for (const [lang, doc] of [['zh', zh], ['en', en]]) {
    assert.equal(typeof doc?.meta?.title, 'string', `${lang}.json 必须有 meta.title`)
    assert.equal(typeof doc?.meta?.description, 'string', `${lang}.json 必须有 meta.description`)
    assert.ok(doc.meta.title.trim() !== '' && doc.meta.description.trim() !== '', `${lang}.json 的 meta 字段不得为空`)
  }
  // 语言不得写串：中文版含 CJK、英文版不含
  assert.ok(/[\u4e00-\u9fff]/.test(zh.meta.description), 'zh.json 说明必须是中文')
  assert.equal(/[\u4e00-\u9fff]/.test(en.meta.description), false, 'en.json 说明不得含中文')
})

// --- 设置页头部：插件名 + 版本号 + GitHub 入口 ---
// 参考设置页惯例（同生态插件截图）：标题旁标版本号、右上角 GitHub 入口。
// 版本号的唯一真源是 package.json —— 浏览器 bundle 读不到包文件，只能构建期注入；
// 这里锁两端：源码直跑时安全回落 + 产物真的内联了真版本。
await okAsync('client-meta: 版本号唯一真源 = package.json，仓库地址与 package.json 一致，头部三要素进 card（settings-header/AC-1）', async () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  const meta = await import(new URL('../src/client/meta.js', import.meta.url))
  // ① 仓库地址与 package.json 的 repository 同源（同一个地址写两处必然漂移——本断言在防这个）
  assert.equal(meta.PLUGIN_REPO_URL, pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''),
    'PLUGIN_REPO_URL 必须与 package.json 的 repository 一致')
  // ② node 直跑源码没有构建期注入 → 必须安全回落 'dev'（裸引用会 ReferenceError，整条 suite 直接挂）
  assert.equal(meta.PLUGIN_VERSION, 'dev', '源码直跑必须回落 dev（构建产物的真值由下一条 bundle 断言锁）')

  // ③ 头部三要素：插件名沿用既有 title 词条；版本号/仓库地址不得在 card 里写死
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  assert.ok(/import \{\s*PLUGIN_REPO_URL,\s*PLUGIN_VERSION\s*\} from '\.\/meta\.js'/.test(card),
    "card.jsx 必须从 './meta.js' 取版本号与仓库地址")
  assert.ok(card.includes('`v${PLUGIN_VERSION}`'), '头部必须渲染 v<version>（版本号来自构建注入）')
  assert.ok(/<h2 className="dsh-rg-title">\{t\('title'\)\}<\/h2>/.test(card),
    '头部标题必须是插件名（t(title)），不得写死')
  assert.ok(card.includes('href={PLUGIN_REPO_URL}'), 'GitHub 入口必须链接到仓库地址')
  assert.ok(/target="_blank"/.test(card) && /rel="noreferrer"/.test(card),
    'GitHub 入口必须新窗口打开且带 rel="noreferrer"')
  assert.ok(/t\('githubAria'\)/.test(card), 'GitHub 入口须有可访问名（t(githubAria)）')
})

ok('controller: takeover 投影随 host 的 enabled 位变化（v0.5/AC-14）', () => {
  const section = SECTION_ALL()
  const off = new RolegroupCardController(makeFakeScope({ value: section, base: section }), IDLE_CTX())
  assert.equal(off.inject().hooks.rolegroupCard.getSnapshot().takeover, false)
  const on = new RolegroupCardController(makeFakeScope({ value: { ...section, enabled: true }, base: section }), IDLE_CTX())
  assert.equal(on.inject().hooks.rolegroupCard.getSnapshot().takeover, true)
  const explicitFalse = new RolegroupCardController(makeFakeScope({ value: { ...section, enabled: false }, base: section }), IDLE_CTX())
  assert.equal(explicitFalse.inject().hooks.rolegroupCard.getSnapshot().takeover, false)
})

ok('client-card: 必须按 props.view 分流——summary 只渲染一行，page 才渲染表单（重复卡片 bug 回归锁）', () => {
  // 2026-09-30 实测 bug：0.2.0 的插件页对同一卡片渲染三次（list/summary、detail-desc/summary、
  // detail-section/page）。卡片原先不区分 view → 详情页叠出两张完整卡片（用户截图）。
  // 契约见 $NM/dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts：
  //   "`summary` renders the one-liner alone ... `page` renders the form with its save control."
  // 官方卡片同款写法：if (props.view === "summary") return t("...")
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  assert.ok(/props\.view\s*===\s*'summary'/.test(card), 'card.jsx 必须在 props.view === "summary" 时提前返回一行文案')
  assert.ok(/props\.view\s*===\s*'summary'\s*\)\s*return\s+t\(/.test(card), 'summary 分支必须 return t(...)（不得渲染表单）')
})

await okAsync('client-card: 未接管 → 一行状态 + 空态引导；长层级说明收进折叠块（信息密度回归锁）', async () => {
  // 2026-10-21 用户反馈：面板里整段「优先级 / 空白≠没有角色 / 整层让位」太长，直接用户不会看。
  // 新结构：可见文案只留一行状态 + 空态引导；层级语义放进默认收起的 <details>，完整版在 README §5。
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  const { zh, en } = await import(new URL('../src/client/locales.js', import.meta.url))
  for (const [name, dict] of [['zh', zh], ['en', en]]) {
    for (const key of ['statusOfficial', 'statusCustom', 'emptyNotTakeover', 'emptyTakeover', 'layerSummary', 'layerNote']) {
      assert.ok(typeof dict[key] === 'string' && dict[key] !== '', `${name}.${key} 必须存在且非空`)
    }
    // 旧的整段说明词条必须删除——防止以后又把长段落加回页面
    assert.ok(!Object.hasOwn(dict, 'notTakeover') && !Object.hasOwn(dict, 'takeoverNote'),
      `${name} 词典不得保留整段说明词条（notTakeover / takeoverNote）`)
  }
  // 一行状态挂在 takeover 分支上；空态也分两种模式
  assert.ok(/state\.mode === 'custom'/.test(card) && card.includes("t('statusOfficial')"),
    '状态行必须按两态渲染（official / custom），且只渲染一行')
  assert.ok(card.includes("t('emptyTakeover')") && card.includes("t('emptyNotTakeover')"),
    '空表必须给出空态引导（两种模式各一句）')
  // 常驻描述行不得再塞优先级链（2026-10-21 用户：描述太长；优先级属于折叠说明/README）
  assert.ok(!zh.description.includes('优先级') && !/Precedence/i.test(en.description),
    `常驻描述行不得再含优先级链：zh=${zh.description} / en=${en.description}`)
  // 长层级说明只在 <details> 折叠块内，默认不占版面
  assert.ok(/<details className="dsh-rg-layer">/.test(card), '层级说明必须是 <details> 折叠块')
  assert.ok(card.includes("t('layerNote')"), '折叠块内必须承载完整层级说明')
  // 信息没有丢：优先级链 / 整层让位 / doctor 仍在折叠说明里
  assert.ok(zh.layerNote.includes('内置表') && zh.layerNote.includes('面板') && zh.layerNote.includes('/rolegroup doctor'),
    `中文折叠说明须保留两层模型与 doctor 入口：${zh.layerNote}`)
  assert.ok(/built-in/i.test(en.layerNote) && /panel/i.test(en.layerNote) && en.layerNote.includes('/rolegroup doctor'),
    `英文折叠说明须保留优先级/整层/doctor：${en.layerNote}`)
})

await okAsync('client-card: 已接管 → 状态行与空态都切到接管语义（"以为 jsonc 还在生效" 回归锁）', async () => {
  // 2026-10-15：接管后必须明确「生效表 = 本表 + 内置表补底、jsonc 整层让位」，
  // 否则用户会以为只写在 jsonc 里的角色还在沿用。现在该语义由状态行 + 折叠说明共同承载。
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  const { zh, en } = await import(new URL('../src/client/locales.js', import.meta.url))
  assert.ok(zh.statusCustom.includes('面板自定义'), zh.statusCustom)
  assert.ok(/panel overrides/i.test(en.statusCustom), en.statusCustom)
  assert.ok(zh.emptyTakeover.includes('内置表'), zh.emptyTakeover)
  assert.ok(/built-in table/i.test(en.emptyTakeover), en.emptyTakeover)
  // 只有「面板自定义」态点亮状态点；官方推荐/文件配置是跟随状态，不该显得像需要处理
  assert.ok(/state\.mode === 'custom' \? ' dsh-rg-statusOn' : ''/.test(card), '状态点必须只在自定义覆盖态点亮')
})

ok('client-card: 内置角色行不渲染删除按钮（与既有自定义行规则一致，无特殊处理）（v0.8/AC-3）', () => {
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  // 删除按钮只在 row.isCustom 时渲染：内置角色（含 vision）走同一分支，天然没有删除按钮。
  assert.ok(/row\.isCustom \? \(/.test(card), '必须保留 isCustom 分流')
  const removeGuard = card.indexOf('className="dsh-rg-remove"') // 跳过 CSS 里同名类
  assert.ok(removeGuard > 0, '必须存在删除按钮节点')
  const before = card.slice(Math.max(0, removeGuard - 600), removeGuard)
  assert.ok(before.includes('row.isCustom ? ('), '删除按钮必须被 isCustom 守卫（内置行没有删除入口）')
})

ok('client-card: card.jsx 全文无硬编码 CJK——所有文案走 t()（v0.3/AC-28）', () => {
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  const hits = card.match(/[一-鿿]/g)
  assert.equal(hits, null, `card.jsx 不得出现 CJK 字符（命中 ${hits?.length} 处，如 ${hits?.slice(0, 5)?.join('')}）——文案一律走 t()`)
})

ok('client-card: 头部与状态行固定，列表在独立容器里滚动（layout/AC-1，v0.11.1 反转旧决策）', () => {
  // 2026-10-21 曾把滚动交给设置页；2026-11-13 用户截图反馈：角色一多，状态行被整页滚走。
  // 现在照官方设置页的形态（agent-preset）：根容器 flex 列 + height:100%，内容区 flex:1 自己滚。
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  assert.ok(!/\.dsh-rg-card\{[^}]*border/.test(card), 'dsh-rg-card 不得再有外框')
  assert.ok(!/\.dsh-rg-card\{[^}]*padding/.test(card), 'dsh-rg-card 不得再留外框内边距')
  assert.ok(/\.dsh-rg-card\{[^}]*display:flex[^}]*flex-direction:column/.test(card), '根容器必须是 flex 列，才能让内层占满剩余高度')
  assert.ok(/\.dsh-rg-card\{[^}]*height:100%/.test(card), '根容器必须撑满设置页给的高度')
  assert.ok(/\.dsh-rg-scroll\{[^}]*overflow-y:auto/.test(card), '内容区必须有独立纵向滚动')
  assert.ok(/\.dsh-rg-scroll\{[^}]*min-height:0/.test(card), 'flex 子项必须 min-height:0，否则滚动不生效')
  assert.ok(!/\.dsh-rg-scroll\{[^}]*max-height:\s*\d/.test(card), '不得用固定像素高度（换屏幕/字号就坏）')
  assert.ok(card.includes('className="dsh-rg-scroll"'), '列表区必须真的包在滚动容器里')
  assert.ok(card.includes('className="dsh-rg-footer"'), '动作区必须在滚动容器外（否则会被一起滚走）')
})

await okAsync('client-bundle: 重建产物仍满足 wrapper 形状且内联 v0.4 注册痕迹（v0.4/AC-17）', async () => {
  const { execFileSync } = await import('node:child_process')
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  execFileSync(process.execPath, [join(repoRoot, 'scripts/build-client.mjs')], { stdio: 'pipe' })
  const bundle = readFileSync(join(repoRoot, 'lib/client.js'), 'utf8')
  const lines = bundle.trimEnd().split('\n')
  assert.ok(lines[0].startsWith('window.__ModuleLoader__.load({'), `首行须以 wrapper 开头，实为: ${lines[0]}`)
  assert.ok(/id:\s*["']dsh-rolegroup["']/.test(bundle), '产物须含 id: "dsh-rolegroup"（单引号等价形式亦可）')
  assert.deepEqual(lines.slice(-3).map((l) => l.trim()), ['return module.exports;', '}', '});'], `尾部三行实为: ${JSON.stringify(lines.slice(-3))}`)
  assert.ok(!/^\s*(import|export)\s/m.test(bundle), '产物不得有顶层 import/export 语句')
  // v0.4 注册痕迹：新槽位/新服务/门控必须真的进产物
  assert.ok(/name:\s*["']settings\.section["']/.test(bundle), '产物须内联 settings.section 槽位名')
  assert.ok(bundle.includes('whileServed'), '产物须含 configForms.whileServed 门控')
  assert.ok(bundle.includes('configForms'), '产物须含 configForms 服务用法')
  assert.ok(bundle.includes('remote.session'), '产物须含 5 元素 inject 清单（remote.session）')
  assert.ok(bundle.includes('dsh-rolegroup: dictionaries'), '产物须含词典注册 effect 标签')
  // 旧契约必须彻底消失（0.1.7 全树已不存在这些名字）
  for (const dead of ['settings.plugin.item', 'settingsScope']) {
    assert.ok(!bundle.includes(dead), `产物仍残留已失效的旧契约：${dead}`)
  }
})

// --- 设置页头部：构建产物的版本号必须来自 package.json ---
// 上一条用例刚重建过产物。若忘了在 scripts/build-client.mjs 里接 esbuild define，
// 产物只会含 `typeof __ROLEGROUP_VERSION__` / 'dev'，设置页头部就会显示 vdev。
ok('client-bundle: 头部版本号由构建期 define 注入（package.json 唯一真源，产物不得回落 dev）', () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  const bundle = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
  assert.ok(bundle.includes(JSON.stringify(pkg.version)),
    `产物必须内联 package.json 的版本号 ${pkg.version}——否则设置页头部会显示 vdev`)
  assert.ok(bundle.includes('https://github.com/zhouxnsz/dsh-rolegroup'), '产物必须内联 GitHub 仓库地址')
  assert.ok(bundle.includes('dsh-rg-action'), '产物必须内联头部动作按钮样式（GitHub 入口共用）')
  // v0.11：配置文件查看器整条链路（右侧栏 / 只读路由）已删除，产物里不得再出现
  assert.equal(bundle.includes('dsh-resource://file/'), false, '配置文件查看器已删除，产物不得再内联右侧栏前缀')
  assert.equal(bundle.includes('sidebarRight'), false, '配置文件查看器已删除，产物不得再内联右侧栏接线')
  assert.equal(bundle.includes('/api/dsh-rolegroup/config'), false, '只读路由已删除，产物不得再引用')
})

// --- 设置页头部：真实产物的渲染文本 ---
// 字符串断言只能证明「产物里出现了版本号」，不能证明「组件把它渲染到了头部」。
// 这里模拟 __ModuleLoader__ 消费真实产物（同 v0.3/AC-18 的加载方式）+ 最小 jsx-runtime，
// 直接调用注册出来的组件并遍历渲染树，钉死标题/版本号/GitHub 入口的**渲染文本与属性**。
await okAsync('client-bundle: 真实产物的头部渲染出「角色配置 v<版本> + GitHub 入口」（settings-header/AC-2）', async () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  const bundle = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
  let captured
  new Function('window', bundle)({ __ModuleLoader__: { load(r) { captured = r } } })
  assert.ok(captured, 'window.__ModuleLoader__.load 未被调用')
  // 最小 jsx-runtime 桩：把 JSX 调用变成可遍历的 { type, props } 树。
  const jsx = (type, props) => ({ type, props: props ?? {} })
  // 组件只用到 useEffect（Escape 关闭弹窗）；node 里 window 不存在 → 回调安全返回。
  const stubRequire = (name) => name === 'react/jsx-runtime'
    ? { jsx, jsxs: jsx, Fragment: 'Fragment' }
    : { __stub: name }
  const client = captured.factory(stubRequire)

  // 假 ctx：让 apply 走完 whileServed → slots.inject → 动态加载 card → slots.register 的完整链。
  const section = rolesToSection(mergeRoles(undefined).roles)
  const scope = {
    getSnapshot: () => ({ status: 'ready', value: section, base: section, user: undefined, revision: 1, writable: true, mode: 'host' }),
    subscribe: () => () => {},
  }
  const { zh } = await import(new URL('../src/client/locales.js', import.meta.url))
  let registered
  let injectCb
  client.apply({
    locale: { register() {}, bind: () => (key) => zh[key] },
    effect: (fn) => { const disposer = fn(); return typeof disposer === 'function' ? disposer : () => {} },
    configForms: {
      get: () => scope,
      whileServed: (namespaces, register) => { register(new Set(namespaces)); return () => {} },
    },
    slots: {
      inject: (name, cb) => { injectCb = cb },
      register: (options, component) => { registered = { options, component } },
    },
    remote: { session: { modelCatalog: async () => ({ ok: true, value: { groups: [], failures: [] } }) } },
  })
  await injectCb()
  assert.ok(registered, 'inject 回调必须注册设置页组件')

  // 渲染一次卡片：投影桩只提供组件读取的字段；返回可遍历的 { type, props } 节点表。
  const cardActions = { openConfig() {}, closeConfig() {}, refreshConfig() {} }
  const renderCard = (projection) => {
    const tree = registered.component({
      t: (key) => zh[key],
      view: 'page',
      useRolegroupCard: (selector) => selector(projection),
      editRole() {}, addRole() {}, removeRole() {}, save() {}, discard() {}, restoreOfficial() {}, retryCatalog() {},
      openConfig: cardActions.openConfig, closeConfig: cardActions.closeConfig, refreshConfig: cardActions.refreshConfig,
    })
    const nodes = []
    const walk = (node) => {
      if (node === null || typeof node !== 'object') return
      // 嵌套数组（条件 + map 的常见形状）必须逐项展开，否则深层 option 不在节点表里。
      if (Array.isArray(node)) { for (const child of node) walk(child); return }
      // 函数组件（GitHubMark / FileMark）按 React 语义展开。
      if (typeof node.type === 'function') {
        walk(node.type(node.props))
        return
      }
      nodes.push(node)
      const children = node.props?.children
      if (Array.isArray(children)) for (const child of children) walk(child)
      else walk(children)
    }
    walk(tree)
    return nodes
  }
  const baseProjection = {
    available: true, writable: true, takeover: false, dirty: true, saving: false,
    mode: 'official', overrides: 0,
    failed: false, conflicted: false, rows: [],
    catalog: { status: 'idle', groups: [], partial: false }, routeGaps: [], basePresent: true,
    config: { status: 'idle', error: undefined, notice: undefined },
  }
  const nodes = renderCard(baseProjection)
  const textOf = (node) => node?.props?.children
  const collectTexts = (node, out = []) => {
    if (node === null || node === undefined || typeof node === 'boolean') return out
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
    if (typeof node !== 'object') return out
    const children = node.props?.children
    if (Array.isArray(children)) for (const child of children) collectTexts(child, out)
    else collectTexts(children, out)
    return out
  }
  /** 收集一整份渲染节点表的文本（节点表是数组，collectTexts 不能直接吃数组）。 */
  const textsOfNodes = (nodeList) => nodeList.flatMap((node) => collectTexts(node))

  const title = nodes.find((node) => node.type === 'h2')
  assert.equal(title?.props?.children, zh.title, '头部标题必须渲染词典 title（角色配置）')
  const version = nodes.find((node) => node.type === 'span' && typeof node.props?.children === 'string'
    && node.props.children.startsWith('v'))
  assert.equal(version?.props?.children, `v${pkg.version}`, '头部必须渲染 v<package.json version>')
  const repo = nodes.find((node) => node.type === 'a')
  assert.ok(repo, '头部必须渲染 GitHub 链接')
  assert.equal(repo.props.href, pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''),
    'GitHub 链接必须指向 package.json 的仓库')
  assert.equal(repo.props.target, '_blank')
  assert.equal(repo.props.rel, 'noreferrer')
  assert.equal(repo.props['aria-label'], zh.githubAria, 'GitHub 链接的可访问名必须走词典')
  assert.ok(nodes.some((node) => node.type === 'span' && node.props?.children === zh.github),
    'GitHub 链接必须渲染 GitHub 文案')
  assert.ok(nodes.some((node) => node.props?.className === 'dsh-rg-dirty'),
    '脏标记必须与 GitHub 入口同处头部动作区（dirty=true 时渲染）')
  // 头部动作区：只剩 GitHub 链接（配置文件查看器已于 v0.11 删除）
  const actions = nodes.find((node) => node.props?.className === 'dsh-rg-headActions')
  const actionTexts = collectTexts(actions)
  assert.ok(actionTexts.includes(zh.github), '头部必须保留 GitHub 链接')
  assert.equal(actionTexts.some((text) => text === '配置文件'), false, '头部不得再有「配置文件」按钮')
  assert.equal(nodes.some((node) => node.type === 'button' && collectTexts(node).includes('配置文件')), false,
    '配置文件查看器已删除，不得再渲染该按钮')

  // 未接管：可见文案只有一行状态 + 空态引导；长层级说明必须在默认收起的 <details> 里。
  assert.ok(nodes.some((node) => collectTexts(node).join('').includes(zh.statusOfficial)), '未接管（官方推荐态）必须渲染一行状态')
  assert.ok(nodes.some((node) => textOf(node) === zh.emptyNotTakeover), '空表必须渲染未接管空态引导')
  const layer = nodes.find((node) => node.type === 'details' && node.props?.className === 'dsh-rg-layer')
  assert.ok(layer, '层级说明必须是 <details> 折叠块')
  assert.equal(layer.props.open, undefined, '层级说明默认必须收起（不得默认展开长文）')
  const layerTexts = collectTexts(layer)
  assert.ok(layerTexts.includes(zh.layerSummary), '折叠块必须有摘要文案')
  assert.ok(layerTexts.includes(zh.layerNote), '完整层级说明必须在折叠块内')

  // 已接管：同一组件换投影后，状态行与空态都切到接管语义。
  const takeoverNodes = renderCard({
    ...baseProjection,
    takeover: true,
    mode: 'custom',
    overrides: 8,
  })
  assert.ok(takeoverNodes.some((node) => collectTexts(node).join('').includes(zh.statusCustom)), '自定义态必须渲染自定义状态行')
  assert.ok(takeoverNodes.some((node) => textOf(node) === zh.emptyTakeover), '接管态空表必须渲染接管空态')
  assert.ok(!takeoverNodes.some((node) => collectTexts(node).join('').includes(zh.statusOfficial)), '自定义态不得残留官方推荐文案')
  assert.ok(takeoverNodes.some((node) => node.props?.className === 'dsh-rg-status dsh-rg-statusOn'),
    '接管态状态行必须带点亮类')


})

// --- v0.4 settings 迁移 T5：client apply 时序与门控（plans/v0.4-settings-migration.md D7/T5）---
// 官方范式（$NM/dsh-client-ui-settings-subagent/lib/client.js:839-846）：卡片注册包在
// `configForms.whileServed([ns], register)` 里——**host 未 serve 该命名空间时不留痕迹**。
// 本条用例用**源码模块**（不是产物）直接调 apply，钉死「未 serve 不注册 / serve 后恰好注册一次」
// 的门控语义；因此**绝不触发** slots.inject 回调——源码 card.jsx 是 JSX，node 直接 import 会撞
// 解析错误（产物里它已被编译成 JS，上一条渲染用例走的就是产物）。

await okAsync('client-index 门控时序：未 serve 不注册、serve 后 slots.inject 恰 1 次、use 参数为 id（v0.4/AC-19）', async () => {
  const srcMod = await import(new URL('../src/client/index.js', import.meta.url))
  const calls = { localeRegister: [], effect: [], formGet: [], whileServed: [], slotsInject: [], slotsRegister: [] }
  const fakeCtx = {
    locale: {
      bind: () => () => '',
      register: (...a) => { calls.localeRegister.push(a) },
    },
    effect: (fn) => { calls.effect.push(fn); return fn() },
    configForms: {
      // controller 构造即建快照 store（需 getSnapshot）并订阅 scope（需 subscribe 退订函数）
      get: (...a) => { calls.formGet.push(a); return { getSnapshot: () => ({ status: 'ready', value: undefined, revision: 0, writable: true }), subscribe: () => () => {} } },
      whileServed: (...a) => { calls.whileServed.push(a); return () => {} },
    },
    slots: {
      inject: (...a) => { calls.slotsInject.push(a) },
      register: (...a) => { calls.slotsRegister.push(a) },
    },
  }
  srcMod.apply(fakeCtx)
  // ① configForms.get 恰好 1 次，参数是命名空间（=== host 条目 id）
  assert.equal(calls.formGet.length, 1, 'configForms.get 须被调用恰好 1 次（controller 构造）')
  assert.deepEqual(calls.formGet[0], ['dsh-rolegroup'], '命名空间须为 host 条目 id')
  // ② whileServed 恰好 1 次，监听的命名空间正确；register 回调尚未触发前不得注册
  assert.equal(calls.whileServed.length, 1, 'configForms.whileServed 须被调用恰好 1 次')
  assert.deepEqual(calls.whileServed[0][0], ['dsh-rolegroup'])
  assert.equal(calls.slotsInject.length, 0, 'host 未 serve 命名空间时不得注册卡片（whileServed 门控）')
  assert.equal(calls.slotsRegister.length, 0)
  // ③ 模拟 host 开始 serve → 触发 register 回调 → slots.inject 恰 1 次，参数为 settings.section + AsyncFunction
  const registerFn = calls.whileServed[0][1]
  registerFn(new Set(['dsh-rolegroup']))
  assert.equal(calls.slotsInject.length, 1, 'serve 后 slots.inject 须恰好调用 1 次')
  assert.equal(calls.slotsInject[0][0], 'settings.section', '槽位名须为 settings.section（设置页导航一节）')
  const injectCb = calls.slotsInject[0][1]
  assert.equal(typeof injectCb, 'function', 'slots.inject 第二参数须为函数')
  assert.equal(injectCb.constructor.name, 'AsyncFunction', 'inject 回调须为 async 函数')
  // ④ 组件注册延迟到回调内：未触发回调时 slots.register 为 0
  assert.equal(calls.slotsRegister.length, 0, '组件注册须延迟到 inject 回调内')
  // ⑤ ctx.effect 恰 3 次（词典 + 导航图标装饰 + whileServed 门控），标签可辨
  assert.equal(calls.effect.length, 3, 'ctx.effect 须被调用恰好 3 次（词典 + 导航图标装饰 + whileServed 门控）')
  assert.ok(calls.localeRegister.length >= 1, '词典必须注册')
})

await okAsync('client-index: 卡片注册必须带 label（否则 Plugins 页列表行无标题）', async () => {
  // 2026-10-15 实测缺陷：Plugins 页「官方」组里本插件那一行只有图标+描述、没有标题。
  // 根因：注册项漏了 `label`，而列表行渲染 CardHead({ title: item.label }) → 标题为空。
  // 官方同款：{ id:"subagent", label: () => t("subagentTitle"), ... }。
  // 注意：**不能**在此触发 slots.inject 回调（回调内 await import('./card.jsx') 会撞 JSX 解析），
  // 故用源码级断言锁形状。
  const src = readFileSync(fileURLToPath(new URL('../src/client/index.js', import.meta.url)), 'utf8')
  assert.ok(/label:\s*\(\)\s*=>/.test(src), 'slots.register 必须传 label（函数形式）')
  assert.ok(/label:\s*\(\)\s*=>\s*t\(/.test(src), 'label 必须走词典 t(...)，不得写死文案')
  assert.ok(/ctx\.locale\.bind\(/.test(src), 'label 的 t 须来自 ctx.locale.bind(...)（官方同款）')
  assert.ok(/t\('title'\)/.test(src), 'label 应取词典的 title 键（与卡片标题一致）')
  // ② 槽位纪律（2026-10-15 用户拍板）：注册进 `settings.section`，**不得**再回到 `plugins.item`。
  // 原因：Plugins 页会把所有 plugins.item 卡片无条件追加进「官方」组，而本插件不是官方插件
  //（host 侧 installed 看 profile dependencies、optional 看硬编码 OPTIONAL_BUNDLES，两者我们都不满足），
  // 于是那一行会被错误地标成"官方"。撤掉卡片后我们不再出现在该组，与装法无关。
  assert.ok(/name:\s*'settings\.section'/.test(src), "必须注册进 settings.section")
  assert.ok(!/'plugins\.item'/.test(src), "不得再注册进 plugins.item（会被误归入「官方」组）")
  assert.ok(/order:\s*\d+/.test(src), 'settings.section 应给 order（决定导航位置）')
})

// --- v0.7/AC-11：engines.dsh 必须覆盖当前部署版本 ---
// 教训（真实事故）：engines.dsh 曾写 `>=0.2.1`，而部署的是 `0.2.1-rc.2`——semver 的 prerelease
// 被排除，插件市场/插件管理器按 engines.dsh 判兼容 → 卡片直接显示「异常」且跳过 meta（连图标都不读）。
// 这里把「区间必须覆盖部署版本」变成可执行断言，防止再写回裸 `>=x.y.z`。
function parseSemver(text) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(text).trim())
  if (m === null) return undefined
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] === undefined ? [] : m[4].split('.') }
}
function compareSemver(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a.nums[i] !== b.nums[i]) return a.nums[i] < b.nums[i] ? -1 : 1
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1 // 正式版 > 同号 prerelease
  if (b.pre.length === 0) return -1
  const len = Math.max(a.pre.length, b.pre.length)
  for (let i = 0; i < len; i += 1) {
    const x = a.pre[i]
    const y = b.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn && Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    if (xn !== yn) return xn ? -1 : 1 // 数字标识符 < 字母标识符
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}
/** 只支持单条下界 `>=x.y.z[-pre]`（本仓库 engines.dsh 的既定形态）；其它写法返回 undefined 交人判断。 */
function satisfiesLowerBound(range, version) {
  const m = /^\s*>=\s*(\S+)\s*$/.exec(String(range ?? ''))
  if (m === null) return undefined
  const min = parseSemver(m[1])
  const target = parseSemver(version)
  if (min === undefined || target === undefined) return undefined
  return compareSemver(target, min) >= 0
}

await okAsync('engines.dsh 必须覆盖当前部署树版本（含 prerelease 语义；v0.7/AC-11）', async () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  let deployed
  try {
    deployed = execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim()
  } catch {
    return // 没有 dsh 可执行文件的环境（tarball/CI）跳过，不误报
  }
  assert.ok(parseSemver(deployed), `无法解析 \`dsh --version\` 输出：${deployed}`)
  const satisfied = satisfiesLowerBound(pkg.engines?.dsh, deployed)
  assert.notEqual(
    satisfied, undefined,
    `engines.dsh 只支持单条下界形式 ">=x.y.z[-pre]"，实为 ${JSON.stringify(pkg.engines?.dsh)}`,
  )
  assert.equal(
    satisfied, true,
    `engines.dsh=${pkg.engines?.dsh} 不覆盖当前部署版本 ${deployed}——`
    + '插件市场/管理器按它判兼容，写错会让插件卡片显示「异常」并跳过 meta',
  )
  // prerelease 部署时，下界必须显式含 prerelease 标识：`>=0.2.1` 满足不了 `0.2.1-rc.2`
  if (deployed.includes('-')) {
    assert.ok(
      /-/.test(String(pkg.engines.dsh).replace(/^>=/, '')),
      `部署版本是 prerelease（${deployed}），engines.dsh 下界也必须写成 prerelease（如 >=0.2.1-rc.1），`
      + '否则 semver 规则下永远不满足',
    )
  }
})

// --- v0.3 GUI 面板 T5c：源码卫生——client 源与 lib 产物均不含字面 NUL 字节（plans/v0.3-gui-panel.md §4 T5，v0.3/AC-28c）---
// 背景：controller.js 的 keyOf 曾写入一个字面 NUL 字节（offset 10998），使 file/grep 把源码当二进制，
// 让基于 grep 的断言（如 AC-27 零浏览器依赖检查）失去可见性。运行时语义不受影响（JS 字符串可含 NUL），
// 故修复为用转义序列 \u0000 表达同一分隔符；此断言防回归。

await okAsync('源码卫生：src/client/*.{js,jsx} 与 lib/*.js 均不含 NUL 字节（v0.3/AC-28c）', async () => {
  const { readdirSync } = await import('node:fs')
  const dirs = [
    { dir: new URL('../src/client/', import.meta.url), exts: ['.js', '.jsx'] },
    { dir: new URL('../lib/', import.meta.url), exts: ['.js'] },
  ]
  for (const { dir, exts } of dirs) {
    for (const name of readdirSync(fileURLToPath(dir))) {
      if (!exts.some((ext) => name.endsWith(ext))) continue
      const filePath = fileURLToPath(new URL(name, dir))
      const buf = readFileSync(filePath)
      const offset = buf.indexOf(0)
      assert.equal(offset, -1, `${filePath} 含字面 NUL 字节，偏移 ${offset}——须用转义序列（如 \\u0000）表达`)
    }
  }
  // 产物单独点名：重建后的 lib/client.js 也不得有 NUL（esbuild 会把 \u0000 输出为 \0 转义）
  const bundle = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)))
  assert.equal(bundle.indexOf(0), -1, 'lib/client.js 含字面 NUL 字节')
})

globalThis.fetch = realFetch
console.log(`\n${passed} passed`)
