// dsh-rolegroup smoke test: 离线校验纯逻辑（jsonc 解析、角色合并、实例配置构建）。
// 不依赖 cordis / dsh host 环境。
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { parseJsonc } from '../lib/jsonc.js'
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

let passed = 0
function ok(label, fn) {
  fn()
  passed += 1
  console.log(`ok - ${label}`)
}

// --- jsonc ---
ok('jsonc: 行注释 + 块注释 + 尾逗号', () => {
  const parsed = parseJsonc(`{
    // 行注释
    "a": 1, /* 块注释 */
    "b": "含 // 与 /* 的字符串",
    "c": [1, 2,],
  }`)
  assert.deepEqual(parsed, { a: 1, b: '含 // 与 /* 的字符串', c: [1, 2] })
})

ok('jsonc: 非法输入抛错', () => {
  assert.throws(() => parseJsonc('{ bad'), SyntaxError)
})

// --- mergeRoles ---
ok('mergeRoles: 无配置 → 7 个内置角色', () => {
  const { roles, problems } = mergeRoles(undefined)
  assert.equal(problems.length, 0)
  assert.equal(roles.length, 7)
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
const PRESET_ROLE = { toolName: 'analyst', persona: '你是 analyst。', summary: '需求澄清' }

ok('presets: 命名口径（v0.6/A1）', () => {
  assert.equal(PRESET_ID_PREFIX, 'rolegroup-')
  assert.equal(PERSONA_PLUGIN, '@deepseek-ai/dsh-persona')
  assert.equal(DELEGATION_GROUP_ID, 'delegation')
  assert.equal(presetIdOf('analyst'), 'rolegroup-analyst')
  assert.equal(presetDisplayName('analyst'), '角色：analyst')
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
  assert.equal(def.name, '角色：analyst')
  assert.equal(def.description, '需求澄清')
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
  assert.deepEqual(config.agentOptions, { provider: 'kimi-coding', model: 'k3', reasoningEffort: 'high' })
  assert.deepEqual(config.agentPreset, 'rolegroup-coder')
  assert.deepEqual(config.allowedAgentPresets, ['rolegroup-coder'])
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
  assert.equal(captured.input?.hint, '[doctor]')
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
  const { roles } = mergeRoles(undefined) // 7 个内置角色
  // 负向构造：删掉 scout 的快照
  const withoutScout = normalizeReport({
    registered: roles.filter((r) => r.toolName !== 'scout').map((r) => ({
      toolName: r.toolName, provider: r.provider, model: r.model, readonly: r.readonly,
    })),
  })
  assert.equal(withoutScout.registered.length, 6)
  const providers = ['qwen-token-plan-cn', 'kimi-coding', 'deepseek-official', 'example-provider']
  const modelsByProvider = {
    'qwen-token-plan-cn': ['qwen3.8-max', 'qwen3.8-flash'],
    'kimi-coding': ['k3'],
    'deepseek-official': ['deepseek-flash'],
    "example-provider": ['example-model'],
  }
  const modelsOf = (p) => modelsByProvider[p] ?? null
  const audit = auditRoles(withoutScout, { providers, modelsOf })
  // 在册 6 角色全绿，缺席提示不影响计数（提示级，同 T4 anomalies 口径）
  assert.equal(audit.healthy, 6)
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
  // 完整 7 角色快照 → 无缺席提示
  const full = normalizeReport({
    registered: roles.map((r) => ({ toolName: r.toolName, provider: r.provider, model: r.model, readonly: r.readonly })),
  })
  const fullAudit = auditRoles(full, { providers, modelsOf })
  assert.deepEqual(fullAudit.missingDefaults, [])
  assert.equal(fullAudit.healthy, 7)
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
    thrown.calls.effectCleanups.forEach((fn) => fn()) // 取消 pending 定时器，防串用例

    const normal = makeFakeCtx()
    await assert.doesNotReject(apply(normal.ctx))
    assert.ok(normal.calls.on.some((c) => c.event === 'llm/adapters-updated'), '必须订阅 llm/adapters-updated 回调')
    assert.equal(normal.calls.effectCleanups.length, 1, 'ctx.effect 必须注册一个清理函数')
    assert.doesNotThrow(() => normal.calls.effectCleanups[0]()) // 触发清理（scheduler.cancel）不抛、无 unhandled rejection
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
        // 「全量在册」断言被空集平凡满足。现提供桩 loader 让 7 个角色真实走完注册
        // （bare import 在本仓库必 ERR_MODULE_NOT_FOUND，已实证，故桩 loader 必定被走到）。
        // 缓存串扰说明：resolveToolSubagent 的 toolSubagent 是模块级变量，本用例成功后
        // 桩模块会被缓存并泄漏给后续用例（AC-31）——AC-31 自带同款桩 loader 且只断言
        // 本次快照字段，缓存串扰不影响其结论；本用例位于所有 apply 用例之尾，无前向污染。
        loader: makeContractLoader(),
      },
    })
    await apply(fake.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report = await waitForReport(join(tmp, 'plugins', 'dsh-rolegroup', 'last-startup.json'))
    assert.equal(fake.calls.plugin.length, 7, '桩 loader 下 7 个角色必须真实走完 ctx.plugin 注册（杜绝空集平凡满足）')
    assert.equal(report.registered.length, 7, '无论校验成败，registered 必须全量在册（未被剪枝/吞没）')
    assert.deepEqual(report.registered.map((r) => r.toolName), Object.keys(DEFAULT_ROLES), 'registered 的 toolName 集合必须 == 7 个内置角色名')
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

await okAsync('apply 快照 configMtimeMs：utimes 钉死 mtime → 原样入快照；无配置文件 → null（AC-31）', async () => {
  // URL '..' 解析结果带尾部斜杠，cwd 补一个斜杠后逐字比对（不新增 import）
  assert.equal(`${process.cwd()}/`, fileURLToPath(new URL('..', import.meta.url)), '用例开始时 cwd 必须为仓库根（chdir 隔离的前提）')
  // 与 AC-30 同款注入（T5）：apply(ctx, { debounceMs: 1, maxWaitMs: 5 }) + 轮询落盘，无真实等待。
  // 与 AC-30 同款桩 loader（bare import 必失败已实证）；注意 resolveToolSubagent 的模块级
  // 缓存此时已被 AC-30 置为桩模块，本用例的 loader 实际不会被再调用——结论只依赖本次
  // 快照字段（configMtimeMs/configSource），与注册是否走缓存无关，故串扰无害。
  const loaderStub = makeContractLoader() // v0.6：需能解析 persona 模块 + 默认 preset 声明
  const prevHome = process.env.DSH_HOME
  const prevCwd = process.cwd()
  try {
    // 场景一：DSH_HOME 放一份 rolegroup.jsonc 并用 utimes 钉死 mtime（整秒值，规避
    // 文件系统亚秒精度截断，不依赖真实当前时间）
    const tmpCwd = await mkdtemp(join(tmpdir(), 'dsh-rg-mtime-cwd-'))
    const tmpHome = await mkdtemp(join(tmpdir(), 'dsh-rg-mtime-home-'))
    const configFile = join(tmpHome, 'rolegroup.jsonc')
    await writeFile(configFile, '{ "roles": {} }')
    const pinned = new Date('2026-09-01T00:00:00.000Z')
    await utimes(configFile, pinned, pinned)
    process.env.DSH_HOME = tmpHome
    process.chdir(tmpCwd) // 隔离项目级候选 <cwd>/.dsh/rolegroup.jsonc（防仓库根未来误命中）
    const fake1 = makeFakeCtx({ services: { loader: loaderStub } })
    await apply(fake1.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report1 = await waitForReport(join(tmpHome, 'plugins', 'dsh-rolegroup', 'last-startup.json'))
    assert.equal(report1.configMtimeMs, pinned.getTime(), 'configMtimeMs 必须等于 utimes 钉死的毫秒值')
    assert.equal(report1.configSource, configFile)
    // 回归断言：同一快照中既有字段形状不变（H13）
    assert.ok(typeof report1.time === 'string', 'time 仍为 ISO 字符串')
    assert.ok(Array.isArray(report1.registered) && Array.isArray(report1.failed), 'registered/failed 仍为数组')
    assert.ok(Array.isArray(report1.invalid) && Array.isArray(report1.problems), 'invalid/problems 仍为数组')
    console.log(`    场景一 last-startup.json 关键内容: ${JSON.stringify({ time: report1.time, configSource: report1.configSource, configMtimeMs: report1.configMtimeMs, registered: report1.registered.length, failed: report1.failed, invalid: report1.invalid, problems: report1.problems })}`)

    // 场景二：无任何配置文件 → configMtimeMs === null
    const emptyCwd = await mkdtemp(join(tmpdir(), 'dsh-rg-nocfg-cwd-'))
    const emptyHome = await mkdtemp(join(tmpdir(), 'dsh-rg-nocfg-home-'))
    process.env.DSH_HOME = emptyHome
    process.chdir(emptyCwd)
    const fake2 = makeFakeCtx({ services: { loader: loaderStub } })
    await apply(fake2.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const report2 = await waitForReport(join(emptyHome, 'plugins', 'dsh-rolegroup', 'last-startup.json'))
    assert.equal(report2.configMtimeMs, null, '无任何配置文件时 configMtimeMs 必须为 null')
    assert.equal(report2.configSource, null)
    console.log(`    场景二 last-startup.json 关键内容: ${JSON.stringify({ time: report2.time, configSource: report2.configSource, configMtimeMs: report2.configMtimeMs })}`)
  } finally {
    process.chdir(prevCwd) // 必须恢复 cwd（RK2：泄漏会影响同进程后续用例）
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

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
  assert.equal(section.roles.length, 7)
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
function makeFakeAgentPresets({ brokenIds = new Set(), listGate } = {}) {
  const calls = []
  const definitions = new Map()
  let gate = listGate
  const service = {
    defaultId: 'standard',
    async register(definition) {
      calls.push(['register', definition.id])
      if (definitions.has(definition.id)) throw new Error(`Duplicate agent preset: ${definition.id}`)
      definitions.set(definition.id, {
        id: definition.id,
        ...(brokenIds.has(definition.id) ? { broken: '模拟的 preset 激活失败' } : {}),
      })
      return async () => { calls.push(['dispose', definition.id]); definitions.delete(definition.id) }
    },
    async list() {
      calls.push(['list'])
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
  assert.deepEqual(fake.calls.filter((c) => c[0] === 'dispose').map((c) => c[1]), ['rolegroup-good'])
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
} = {}) {
  const logs = { info: [], warn: [], error: [] }
  const calls = { plugin: [], disposes: [], announcements: [] }
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
      return { dispose: async () => { calls.disposes.push(cfg) } }
    },
    systemPrompt: { section: (opts) => { calls.announcements.push(opts.text); return () => {} } },
    on: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
    },
    effect: (fn) => fn(),
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
    assert.equal(fake.calls.plugin.length, 7, '启动路径必须立即注册 7 角色（不等 settings/prune）')
    assert.deepEqual(Object.keys(report).sort(),
      ['configError', 'configMtimeMs', 'configSource', 'failed', 'invalid', 'problems', 'registered', 'time'],
      '快照字段集合必须与重构前逐字一致（锁死重构未改变产物）')
    assert.equal(report.configSource, null)
    assert.equal(report.configError, null)
    assert.equal(report.configMtimeMs, null)
    assert.ok(typeof report.time === 'string')
    assert.equal(report.registered.length, 7)
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

await okAsync('compose D4 接管判据 + configSource 三态：未接管→jsonc / 接管→settings / 无文件→null（v0.4/AC-14、AC-15）', async () => {
  const prevHome = process.env.DSH_HOME
  const makeHome = async (withJsonc = true) => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-rg-t2-tristate-'))
    // 用户级 jsonc 覆盖：把 coder 的 model 改成 k3-jsonc，用来区分「走 jsonc」与「走内置表」
    if (withJsonc) await writeFile(join(dir, 'rolegroup.jsonc'), JSON.stringify({ roles: { coder: { model: 'k3-jsonc' } } }))
    return dir
  }
  try {
    // ① enabled 缺省 → 未接管 → 文件表生效（coder.model === k3-jsonc）；configSource = jsonc 路径
    const homeA = await makeHome()
    process.env.DSH_HOME = homeA
    const untouched = makeComposeCtx()
    await apply(untouched.ctx, { debounceMs: 1, maxWaitMs: 5 }) // 无 roles 键 → 照旧走「注入项」分支
    assert.equal(untouched.calls.plugin.find((c) => c.toolName === 'coder').agentOptions.model, 'k3-jsonc',
      '未接管时必须走 jsonc 覆盖')
    const untouchedReport = await waitForReport(reportPathOf(homeA))
    assert.ok(untouchedReport.configSource.includes('rolegroup.jsonc'), untouchedReport.configSource)

    // ② enabled=true + 显式空表 → 面板已接管 → 忽略 jsonc，回落**内置表**（coder.model === k3）
    //    注意：不是「零角色」——mergeRoles 恒以内置表为底（v0.1 既有语义），空表 = 无覆盖。
    const homeB = await makeHome()
    process.env.DSH_HOME = homeB
    const takeover = makeComposeCtx()
    __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
    await apply(takeover.ctx, makeEntryConfig([], true).config)
    const takeoverCoder = takeover.calls.plugin.find((c) => c.toolName === 'coder')
    assert.equal(takeoverCoder.agentOptions.model, 'k3', '接管后空表 = 无覆盖 → 内置表（不得回落 jsonc）')
    const takeoverReport = await waitForReport(reportPathOf(homeB))
    assert.ok(takeoverReport.configSource.includes('settings'), takeoverReport.configSource)

    // ③ enabled 缺省 + 无任何 jsonc → 未接管且文件缺失 → configSource = null（= 内置默认表）
    const homeC = await makeHome(false)
    process.env.DSH_HOME = homeC
    const builtinOnly = makeComposeCtx()
    await apply(builtinOnly.ctx, { debounceMs: 1, maxWaitMs: 5 })
    const builtinReport = await waitForReport(reportPathOf(homeC))
    assert.equal(builtinReport.configSource, null, '既未接管也无文件 → configSource 必须是 null（三态之三）')
    console.log(`    configSource 三态：${untouchedReport.configSource} ｜ ${takeoverReport.configSource} ｜ ${builtinReport.configSource}`)
  } finally {
    __setTestOverrides(undefined)
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
    assert.equal(fake.calls.plugin.length, 7, '启动路径立即注册 7 角色（文件表）')
    f.advance(3000) // 终验跑完（首次校验）
    await waitForReport(reportPathOf(tmp))
    assert.equal(fake.calls.plugin.length, 7, '终验不得重复注册')
    assert.ok(!JSON.parse(readFileSync(reportPathOf(tmp), 'utf8')).configSource?.includes?.('settings'), '未接管时 configSource 不得标 settings')
    // 面板保存一张把 coder.model 改掉的表 → cordis 提交 volatile
    const base = rolesToSection(mergeRoles(undefined).roles)
    const changed = { roles: base.roles.map((r) => (r.toolName === 'coder' ? { ...r, model: 'k3-recomposed' } : r)) }
    entry.setEnabled(true); entry.setRoles(changed.roles) // 面板保存 = enabled + roles 一起写
    fake.fireVolatile()
    assert.equal(fake.calls.plugin.length, 7, 'volatile 防抖窗（300ms）内不得立即重组装')
    f.advance(300) // 满防抖 → onTable → recompose
    await waitForCond(() => fake.calls.plugin.length === 14, '重组装后第二轮 7 角色注册（7+7）')
    assert.equal(fake.calls.disposes.length, 7, '旧 7 条 fiber 必须全部 dispose')
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
    assert.equal(fake.calls.plugin.length, 7, 'pruned===false 期间表变更只许置 pendingTable，不得重组装')
    assert.equal(fake.calls.disposes.length, 0, 'pruned===false 期间不得 dispose 任何 fiber')
    f.advance(3000) // 终验跑完 → 须补做一次 recompose
    await waitForCond(() => fake.calls.plugin.length === 14, 'prune 完成后补做的 recompose（7+7）')
    assert.equal(fake.calls.disposes.length, 7)
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
    assert.equal(fake.calls.plugin.length, 7, '同值连发必须被 sameSection 短路（0 次重组装触发）')
    // ② 异值连发（v1 → v2 → v1）→ 防抖后恰好 1 次尾随执行，值为最后一发
    entry.setRoles(v1.roles); fake.fireVolatile(); f.advance(100)
    entry.setRoles(v2.roles); fake.fireVolatile(); f.advance(100)
    entry.setRoles(v1.roles); fake.fireVolatile()
    f.advance(299)
    assert.equal(fake.calls.plugin.length, 7, '防抖窗未满（299ms）不得重组装')
    f.advance(1) // 满 300ms
    await waitForCond(() => fake.calls.plugin.length === 14, '异值连发必须恰好 1 次尾随执行')
    f.advance(1000)
    assert.equal(fake.calls.plugin.length, 14, '尾随之后不得重复重组装')
    const coderCfg = fake.calls.plugin.filter((c) => c.toolName === 'coder').at(-1)
    assert.equal(coderCfg.agentOptions.model, 'k3-v1', '尾随执行的值必须是最后一发')
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
    const ghost = base.roles.map((r) => (r.toolName === 'scribe' ? { ...r, provider: 'ghost-provider' } : r))
    entry.setEnabled(true); entry.setRoles(ghost) // 面板保存一张把 scribe.provider 改成未注册值的表
    fake.fireVolatile()
    f.advance(300) // 防抖满 → recompose
    await waitForCond(() => fake.calls.plugin.length === 14, '重组装第二轮注册')
    await readReportWhen(tmp, (r) => typeof r.configSource === 'string' && r.configSource.includes('settings'))
    const report = JSON.parse(readFileSync(reportPathOf(tmp), 'utf8'))
    assert.equal(report.invalid.length, 1, JSON.stringify(report.invalid))
    assert.equal(report.invalid[0].toolName, 'scribe')
    assert.ok(report.invalid[0].reason.includes('ghost-provider'), report.invalid[0].reason)
    assert.equal(report.registered.length, 6, 'scribe 被剪枝后剩 6 角色在册')
    assert.ok(!report.registered.some((r) => r.toolName === 'scribe'))
    // 记账正确性：7 条旧 fiber + scribe 在重组装中新建又判 invalid 的 1 条 = 8 次 dispose
    assert.equal(fake.calls.disposes.length, 8, JSON.stringify(fake.calls.disposes.map((c) => c.toolName)))
    assert.equal(fake.calls.disposes.filter((c) => c.toolName === 'scribe').length, 2, 'scribe 新旧两条 fiber 均须 dispose')
    assert.ok(!fake.calls.announcements.at(-1).includes('`scribe`'), '末次公告不得再含被剪枝的 scribe')
    console.log(`    invalid[0]: ${JSON.stringify(report.invalid[0])}`)
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

// --- 2026-10-15：层语义（整层择一）的**可见性**锁定 + configMtimeMs 来源归因 ---
// 背景（实测复现，两条都是"文档/诊断与实现错位"）：
//   ① README §4 原写"未列出的角色照旧沿用下层"，读者会以为面板接管后 jsonc 覆盖仍在生效；
//      实现是**整层择一**（接管 ⇒ jsonc 整层让位 ⇒ 未列出的角色回落内置表）。行为不改（既有断言
//      已锁 v0.1 语义），改的是**把后果说出来**：日志必须点名被让位的文件与回落目标。
//   ② 快照的 configMtimeMs 原先恒取 jsonc 文件 mtime，接管时也一样 → doctor 的「配置年龄提示」
//      会把一个已被让位的文件的年龄算到 settings 面板头上。现按「生效来源就是该文件」把关。

await okAsync('层语义可见性：接管时日志须点名被让位的 jsonc 与后果（"以为 jsonc 还在生效" 回归锁）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-layer-msg-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const configFile = join(tmp, 'rolegroup.jsonc')
    await writeFile(configFile, JSON.stringify({ roles: { coder: { model: 'k3-jsonc' } } }))
    const fake = makeComposeCtx()
    await apply(fake.ctx, makeEntryConfig([
      { toolName: 'scout', provider: 'deepseek-official', model: 'deepseek-flash' },
    ], true).config)
    // ① 行为判据：jsonc 的 coder 覆盖**不生效**（整层让位 → 回落内置 k3）
    assert.equal(fake.calls.plugin.find((c) => c.toolName === 'coder').agentOptions.model, 'k3',
      '接管后 jsonc 整层让位：未列进面板的 coder 必须回落内置表')
    // ② 可见性判据：日志必须说全后果（只说"被覆盖"会让用户以为 jsonc 覆盖还在生效）
    const line = fake.logs.info.find((m) => m.includes('整层让位'))
    assert.ok(line, `必须有一条说明 jsonc 整层让位的 info 日志，实为：${JSON.stringify(fake.logs.info)}`)
    assert.ok(line.includes(configFile), `日志须点名被让位的文件路径：${line}`)
    assert.ok(line.includes('回落内置表'), `日志须点明未列出角色的去处：${line}`)
    // ③ 隔离判据：必须等自己的终验落盘再走——否则 1ms 防抖的剪枝会拖到下一个用例
    //    切了 DSH_HOME 之后才写报告，把别人的临时目录写脏（跨用例竞态，曾真实发生）。
    await readReportWhen(tmp, (r) => typeof r.configSource === 'string' && r.configSource.includes('settings'))
  } finally {
    __setTestOverrides(undefined)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
})

await okAsync('configMtimeMs 归因：生效来源是 jsonc → 透出 mtime（年龄提示照出）；面板接管 → null（提示不出现）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-rg-mtime-src-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  const DAY = 24 * 60 * 60 * 1000
  const pinned = new Date('2026-01-05T00:00:00.000Z') // 远超 14 天阈值：若被透出必触发年龄提示
  __setTestOverrides({ debounceMs: 1, maxWaitMs: 5 })
  try {
    const configFile = join(tmp, 'rolegroup.jsonc')
    await writeFile(configFile, JSON.stringify({ roles: { coder: { model: 'k3-jsonc' } } }))
    await utimes(configFile, pinned, pinned)

    // ① 未接管（enabled=false）→ 生效来源就是该文件 → mtime 原样入快照，doctor 出 ⚠️ 年龄提示
    // 超时参数只作「防挂死兜底」，不是固定等待：机器满载时 2000ms 曾偶发超时（2026-10-20 实测），故放宽。
    const a = makeComposeCtx()
    await apply(a.ctx, makeEntryConfig([], false).config)
    const reportA = await waitForReport(reportPathOf(tmp), 8000)
    assert.equal(reportA.configSource, configFile)
    assert.equal(reportA.configMtimeMs, pinned.getTime(), '生效来源是 jsonc 时必须透出该文件 mtime')
    const stateA = await readStartupReport({ env: { DSH_HOME: tmp }, now: new Date(pinned.getTime() + 30 * DAY) })
    assert.equal(stateA.kind, 'ok')
    assert.equal(stateA.anomalies.length, 1, JSON.stringify(stateA.anomalies))
    assert.ok(stateA.anomalies[0].includes('30 天') && stateA.anomalies[0].includes(configFile),
      `年龄提示须同源（source 与日期都来自该文件）：${stateA.anomalies[0]}`)

    // ② 接管（enabled=true）→ jsonc 整层让位 → mtime 必须为 null，且年龄提示不得出现
    const b = makeComposeCtx()
    await apply(b.ctx, makeEntryConfig([], true).config)
    // 同 ①：8000ms 只是防挂死兜底（readReportWhen 的缺省 2000ms 在满载时会偶发超时）
    await waitForCond(() => {
      try {
        return JSON.parse(readFileSync(reportPathOf(tmp), 'utf8')).configSource?.includes?.('settings') === true
      } catch { return false }
    }, 'last-startup.json 标记 settings 来源', 8000)
    const reportB = JSON.parse(readFileSync(reportPathOf(tmp), 'utf8'))
    assert.ok(reportB.configSource.includes('settings'), reportB.configSource)
    assert.equal(reportB.configMtimeMs, null, '接管后生效来源不是 jsonc 文件 → configMtimeMs 必须为 null')
    const stateB = await readStartupReport({ env: { DSH_HOME: tmp }, now: new Date(pinned.getTime() + 30 * DAY) })
    assert.deepEqual(stateB.anomalies, [],
      `接管后不得出现「配置超龄」⚠️（不许把被让位文件的年龄算到面板头上）：${JSON.stringify(stateB.anomalies)}`)
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

// --- v0.3 GUI 面板 T4：client controller 纯逻辑（plans/v0.3-gui-panel.md §2.4/§4 T4，v0.3/AC-20..AC-27）---
// 假 scope 对齐 0.1.7 的 ConfigFormController 契约（`ctx.configForms.get(entryId)` 的返回面：
// getSnapshot() → {status,value,base,user,revision,writable,mode}；subscribe(cb)→退订；
// mutate(ops, expectedRevision)；unset 语义 = 清用户层该路径、解析值回落到 base）。
// 本桩如实模拟「unset → 回落 base」，否则重置用例会假绿。
// 假 ctx 只提供 remote.session.modelCatalog()。全部离线、零真实计时器（setImmediate 仅作微任务冲刷，沿用既有先例）。
import { RolegroupCardController } from '../src/client/controller.js'

const SECTION7 = () => rolesToSection(mergeRoles(undefined).roles) // 7 行内置表（每个用例独立拷贝）

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
  return { calls, remote: { session: { modelCatalog: async () => { calls.push(1); return catalogResult } } } }
}

const flushMicrotasks = () => new Promise((r) => setImmediate(r))
const IDLE_CTX = () => makeFakeClientCtx({ ok: true, value: { groups: [], failures: [] } })

ok('controller: 投影初始态——available/writable 取自 scope、rows=生效值 7 行、dirty:false、basePresent、catalog 懒加载（v0.3/AC-20）', () => {
  const section = SECTION7()
  const scope = makeFakeScope({ value: section, base: SECTION7(), user: undefined })
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
  assert.equal(proj.rows.length, 7)
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
  const section = SECTION7()
  const origModel = section.roles.find((r) => r.toolName === 'coder').model
  const scope = makeFakeScope({ value: section, base: SECTION7(), user: undefined })
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
  const section = SECTION7()
  const scope = makeFakeScope({ value: section, base: SECTION7(), user: undefined, revision: 3 })
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
  assert.equal(ops[1].value.length, 7)
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
  const section = SECTION7()
  const scope = makeFakeScope({ value: section, base: SECTION7(), user: undefined, revision: 3 })
  const controller = new RolegroupCardController(scope, IDLE_CTX())
  const face = controller.inject()
  face.editRole('coder', 'model', 'k3-x')
  const external = SECTION7()
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

await okAsync('controller: resetToBase 清用户层（enabled + roles 两个 unset）→ 真正退出接管、rows 回落 base 层值（v0.4/AC-14）', async () => {
  const base = SECTION7()
  const userTable = SECTION7()
  userTable.roles.find((r) => r.toolName === 'coder').model = 'user-x'
  const scope = makeFakeScope({ value: userTable, base, user: userTable, revision: 5 })
  const controller = new RolegroupCardController(scope, IDLE_CTX())
  const face = controller.inject()
  assert.equal(face.hooks.rolegroupCard.getSnapshot().rows.find((r) => r.toolName === 'coder').model, 'user-x')
  face.resetToBase()
  await flushMicrotasks()
  // v0.4：重置 = enabled + roles 一起 unset，否则 host 仍把 enabled=true 视为「已接管」
  assert.equal(scope.calls.mutate.length, 1, '重置应走一次 mutate（两个 unset）')
  assert.deepEqual(scope.calls.mutate[0].ops, [
    { op: 'unset', path: ['enabled'] },
    { op: 'unset', path: ['roles'] },
  ], '重置必须同时清 enabled，才算真正退出接管')
  assert.equal(scope.calls.unset.length, 0, '不该再走单字段 unset 通道')
  const proj = face.hooks.rolegroupCard.getSnapshot()
  const baseCoder = base.roles.find((r) => r.toolName === 'coder').model
  assert.equal(proj.rows.find((r) => r.toolName === 'coder').model, baseCoder, '重置后 rows 必须 = base 层值')
  assert.equal(proj.dirty, false)
})

await okAsync('controller: catalog 懒加载 + 合并——ready/partial、已存路由不在目录 → 保留为 available:false 选项（v0.3/AC-25）', async () => {
  const section = SECTION7()
  const scope = makeFakeScope({ value: section, base: SECTION7(), user: undefined })
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

await okAsync('controller: addRole/removeRole 增删草稿行；非法行（空 provider）投影 invalidFields 且 save 本地拦截（v0.3/AC-26）', async () => {
  const section = SECTION7()
  const scope = makeFakeScope({ value: section, base: SECTION7(), user: undefined })
  const controller = new RolegroupCardController(scope, IDLE_CTX())
  const face = controller.inject()
  face.addRole()
  let proj = face.hooks.rolegroupCard.getSnapshot()
  assert.equal(proj.rows.length, 8)
  const added = proj.rows[7]
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
  assert.equal(proj.rows.length, 7)
  assert.equal(proj.dirty, false, '增后又删回必须与生效值一致')
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

ok('controller: takeover 投影随 host 的 enabled 位变化（v0.5/AC-14）', () => {
  const section = SECTION7()
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

await okAsync('client-card: 未接管时必须给出说明（"没有默认角色" 困惑回归锁）', async () => {
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  assert.ok(card.includes('notTakeover'), 'card.jsx 必须在未接管时渲染 notTakeover 说明')
  const { zh, en } = await import(new URL('../src/client/locales.js', import.meta.url))
  assert.ok(zh.notTakeover && en.notTakeover, 'notTakeover 词条 zh/en 必须都有')
})

await okAsync('client-card: **已**接管时也必须给出说明——jsonc 整层让位（"以为 jsonc 还在生效" 困惑回归锁）', async () => {
  // 2026-10-15：接管后原先什么都不显示，而用户很容易以为"我只改了 scout，coder 的 jsonc 覆盖还在"
  // ——实际上 jsonc 整层让位、coder 回落内置表。两个分支都必须把层语义说清。
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  assert.ok(card.includes('takeoverNote'), 'card.jsx 必须在已接管时渲染 takeoverNote 说明')
  assert.ok(/state\.takeover\s*\?/.test(card), 'takeoverNote 必须挂在 state.takeover 分支上')
  const { zh, en } = await import(new URL('../src/client/locales.js', import.meta.url))
  for (const [name, dict] of [['zh', zh], ['en', en]]) {
    assert.ok(typeof dict.takeoverNote === 'string' && dict.takeoverNote !== '', `${name}.takeoverNote 必须存在且非空`)
  }
  assert.ok(zh.takeoverNote.includes('整层让位') && zh.notTakeover.includes('整层'),
    '中文词典两个分支都必须说清「整层」语义')
  assert.ok(/yields entirely/i.test(en.takeoverNote) && /yields entirely/i.test(en.notTakeover),
    '英文词典两个分支都必须说清 all-or-nothing（yields entirely）语义')
})

ok('client-card: card.jsx 全文无硬编码 CJK——所有文案走 t()（v0.3/AC-28）', () => {
  const card = readFileSync(fileURLToPath(new URL('../src/client/card.jsx', import.meta.url)), 'utf8')
  const hits = card.match(/[一-鿿]/g)
  assert.equal(hits, null, `card.jsx 不得出现 CJK 字符（命中 ${hits?.length} 处，如 ${hits?.slice(0, 5)?.join('')}）——文案一律走 t()`)
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

// --- v0.4 settings 迁移 T5：client apply 时序与门控（plans/v0.4-settings-migration.md D7/T5）---
// 官方范式（$NM/dsh-client-ui-settings-subagent/lib/client.js:839-846）：卡片注册包在
// `configForms.whileServed([ns], register)` 里——**host 未 serve 该命名空间时不留痕迹**。
// 本用例用假 ctx 直接调 apply，钉死「未 serve 不注册 / serve 后恰好注册一次」的门控语义；
// card 组件本身仍在 inject 回调内异步解析。
// 纪律：node 里**绝不触发**那个 slots.inject 回调（回调内 await import('./card.jsx') 会撞 JSX 解析）——
// card.jsx 依旧只许 readFileSync，不得 import。

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
  // ⑤ ctx.effect 恰 2 次（词典 + whileServed 门控），标签可辨
  assert.equal(calls.effect.length, 2, 'ctx.effect 须被调用恰好 2 次（词典 + whileServed 门控）')
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

console.log(`\n${passed} passed`)
