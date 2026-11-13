// dsh-rolegroup client —— RolegroupCardController（plans/v0.3-gui-panel.md §2.4，纯 JS，node 可测）。
// 对齐官方 SubagentModelSelectionCard controller 先例（§0.2 C8）：
//   草稿 Map<toolName, SectionRole> + draftRevision 栅栏 + scope.mutate([{op:'set',...}], draftRevision)
//   整段写回；revision 漂移（他处保存）→ conflicted:true 且拒发 mutate。
// scope 契约 = 0.1.7 的 ConfigFormController（`ctx.configForms.get(entryId)` 的返回面）：
//   getSnapshot() → {status, value, base, user, revision, writable, mode}；subscribe(cb) → 退订函数；
//   mutate(ops, expectedRevision)；unset(field) = 清字段回落组合层（客户端无 clear，resetToBase 走 unset）。
// 零浏览器依赖：不触 DOM、不引 UI 框架；文案一律走 locales.js 的 key，本文件不含用户可见文案。
// @module dsh-rolegroup/client-controller

import { DEFAULT_ROLES, TOOL_NAME_RE } from '../../lib/roles.js'

/**
 * 「当前配置」只读接口：host 侧 lib/config-info.js 注册同一路径
 * （smoke suite 有断言锁两端一致）。客户端只读，不写任何东西。
 */

/** 可经 editRole 文本编辑的字段（toolName 走专门的重命名路径）。v0.5：readonly 已移除。 */
const TEXT_FIELDS = ['provider', 'model', 'reasoningEffort', 'persona', 'summary']

/** 序列化一行为 settings section 形状：必填恒写，可选字段（reasoningEffort/persona/summary）有值才写。 */
function normalizeRow(row) {
  const out = {
    toolName: row.toolName,
    provider: String(row.provider ?? '').trim(),
    model: String(row.model ?? '').trim(),
  }
  for (const field of ['reasoningEffort', 'persona', 'summary']) {
    const value = row[field]
    if (typeof value === 'string' && value.trim() !== '') out[field] = value.trim()
  }
  // 备用链：原样随行写回（面板保存 = 显式配置，丢链就再也降不了级）
  if (Array.isArray(row.fallbackModels) && row.fallbackModels.length > 0) {
    out.fallbackModels = [...row.fallbackModels]
  }
  return out
}

/** 接管态补全：按内置顺序返回整张表（覆盖行优先，缺的用内置默认值补，自定义行追加在后）。 */
function fillBuiltinRows(panelRows) {
  const remaining = new Map(panelRows.map((row) => [row.toolName, row]))
  const out = []
  for (const [toolName, role] of Object.entries(DEFAULT_ROLES)) {
    const existing = remaining.get(toolName)
    if (existing !== undefined) {
      remaining.delete(toolName)
      // 老数据补链：早期面板表里的内置角色行没有 `fallbackModels`（面板保存=显式配置→丢降级）。
      // 面板层从来不提供链的编辑入口，所以「缺失」只可能是历史遗留，补回内置链是安全的；
      // 若不补，这 7 行会一直是"显式无链"状态，主路由挂了就被剪枝。
      const hasChain = Array.isArray(existing.fallbackModels) && existing.fallbackModels.length > 0
      const builtinChain = Array.isArray(role.fallbackModels) ? role.fallbackModels : []
      out.push(!hasChain && builtinChain.length > 0
        ? { ...existing, fallbackModels: [...builtinChain] }
        : existing)
      continue
    }
    out.push({
      toolName,
      provider: role.provider,
      model: role.model,
      ...(Array.isArray(role.fallbackModels) && role.fallbackModels.length > 0
        ? { fallbackModels: [...role.fallbackModels] }
        : {}),
      persona: role.persona,
      summary: role.summary,
    })
  }
  for (const extra of remaining.values()) out.push(extra)
  return out
}

const serializeRows = (rows) => JSON.stringify(rows.map(normalizeRow))

/**
 * 行级非法字段清单（投影 invalidFields；空 = 合法）。
 * @param {object} row 角色行
 * @param {string[] | undefined} allowedEfforts 该模型声明的推理档位；
 *   `undefined` = 目录未就绪/模型未知（不校验），`[]` = 模型明确不支持推理档位。
 */
function invalidFieldsOf(row, allowedEfforts) {
  const fields = []
  if (!TOOL_NAME_RE.test(row.toolName ?? '')) fields.push('toolName')
  if (String(row.provider ?? '').trim() === '') fields.push('provider')
  if (String(row.model ?? '').trim() === '') fields.push('model')
  const effort = String(row.reasoningEffort ?? '').trim()
  if (effort !== '' && allowedEfforts !== undefined && !allowedEfforts.includes(effort)) fields.push('reasoningEffort')
  return fields
}

/** 手写最小 snapshot store 工厂（组件唯一读取面；每次投影变化通知订阅者）。 */
function createSnapshotStore(getProjection, onFirstSubscribe) {
  let snapshot = getProjection()
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    publish() {
      snapshot = getProjection()
      for (const cb of [...listeners]) cb()
    },
    subscribe(cb) {
      const wasEmpty = listeners.size === 0
      listeners.add(cb)
      if (wasEmpty) onFirstSubscribe()
      return () => listeners.delete(cb)
    },
    clear() {
      listeners.clear()
    },
  }
}

/**
 * Rolegroup 设置卡片的暂存编辑器：桥接一个 settings scope 与模型目录。
 * 投影形状（组件唯一读取面）：
 *   { available, writable, dirty, saving, failed, conflicted,
 *     rows: [{toolName, provider, model, reasoningEffort, persona, summary, isCustom, invalidFields[]}],
 *     catalog: {status:'idle'|'loading'|'ready'|'error', groups, partial}, basePresent }
 */
export class RolegroupCardController {
  /** @param scope `ctx.configForms.get('dsh-rolegroup')`（面：getSnapshot/subscribe/mutate/unset）  @param ctx 浏览器插件 ctx（remote.session） */
  constructor(scope, ctx, options = {}) {
    this.scope = scope
    this.ctx = ctx
    this.options = options
    this.drafts = undefined        // Map<toolName, SectionRole> | undefined（undefined = 无草稿）
    this.draftRevision = undefined // 起草时的 scope revision（保存栅栏）
    this.saving = false
    this.failed = false
    this.conflicted = false
    this.catalogGroups = []        // modelCatalog 原始 groups
    this.catalogDefault = undefined // modelCatalog.default（部署默认路由，用于一键补齐）
    this.catalogPartial = false
    this.catalogStatus = 'idle'
    this.lastTakeover = this.scope.getSnapshot().value?.enabled === true
    this.saveGeneration = 0
    this.catalogGeneration = 0
    this.disposed = false
    this.store = createSnapshotStore(() => this.projection(), () => {
      // catalog 懒加载：卡片展开（组件首次订阅）且 idle 时才拉取
      if (this.catalogStatus === 'idle') this.loadCatalog()
    })
    this.unsubscribeScope = scope.subscribe(() => this.onScopeChange())
  }

  /** 组件面：快照 store + 全部动作（§2.4 逐字签名）。 */
  inject() {
    return {
      hooks: { rolegroupCard: { getSnapshot: () => this.store.getSnapshot(), subscribe: (cb) => this.store.subscribe(cb) } },
      editRole: (toolName, field, text) => this.editRole(toolName, field, text),
      addRole: () => this.addRole(),
      removeRole: (toolName) => this.removeRole(toolName),
      save: () => { this.save() },
      discard: () => this.discard(),
      restoreOfficial: () => { this.restoreOfficial() },
      retryCatalog: () => this.retryCatalog(),
      fillUnavailableRoutes: () => this.fillUnavailableRoutes(),
    }
  }

  /** 停止观察 scope 并压制迟到的写/目录/配置结算。 */
  dispose() {
    this.disposed = true
    this.saveGeneration += 1
    this.catalogGeneration += 1
    this.unsubscribeScope?.()
    this.store.clear()
  }

  // --- 读取面 ---
  /** host 侧 `enabled` 位：true = 本面板接管生效表。 */
  isTakeover() {
    return this.scope.getSnapshot().value?.enabled === true
  }

  /**
   * 当前生效行（未被草稿覆盖时的基准）。
   * 面板已接管（或面板层已存了行）时用 settings 层的 roles；否则用 host 快照预填的
   * jsonc / 内置生效表。这样未接管时页面默认就有内容，而不是一张空表。
   */
  effectiveRows() {
    const snapshot = this.scope.getSnapshot()
    const panelRows = Array.isArray(snapshot.value?.roles) ? snapshot.value.roles : []
    // 接管态：面板必须显示**整张生效表**——未出现在覆盖表里的内置角色补成普通行（携带内置路由与
    // 备用链）。否则新增内置角色对老用户彻底隐身（v0.8 vision 的真实反馈）。
    if (snapshot.value?.enabled === true) return fillBuiltinRows(panelRows)
    if (panelRows.length > 0) return panelRows
    // 未接管 = 没有任何覆盖 → 生效表就是内置表（客户端已打包 DEFAULT_ROLES，不用请求宿主）
    return fillBuiltinRows([])
  }

  draftRows() {
    return [...(this.drafts?.values() ?? [])]
  }

  isDirty() {
    return this.drafts !== undefined && serializeRows(this.draftRows()) !== serializeRows(this.effectiveRows())
  }

  beginDraft() {
    if (this.drafts === undefined) {
      const snapshot = this.scope.getSnapshot()
      this.drafts = new Map(this.effectiveRows().map((row) => [row.toolName, { ...row }]))
      this.draftRevision = snapshot.revision
    }
    return this.drafts
  }

  clearDraft() {
    this.drafts = undefined
    this.draftRevision = undefined
    this.failed = false
    this.conflicted = false
  }

  editable() {
    const snapshot = this.scope.getSnapshot()
    if (this.disposed || this.saving || snapshot.status !== 'ready' || snapshot.writable !== true) return false
    return true
  }

  publish() {
    this.store.publish()
  }

  onScopeChange() {
    if (this.disposed) return
    // 外部（他处保存/热重载）推进了 revision：草稿与新生效值一致则静默收编，否则置冲突（对齐 C8）
    if (!this.saving && this.drafts !== undefined && this.scope.getSnapshot().revision !== this.draftRevision) {
      if (serializeRows(this.effectiveRows()) === serializeRows(this.draftRows())) this.clearDraft()
      else this.conflicted = true
    }
    this.lastTakeover = this.isTakeover()
    this.publish()
  }

  /**
   * 模型目录里该路由声明的推理档位 id 列表。
   * @returns {string[] | undefined} undefined = 目录未就绪 / 模型未知（不校验）；
   *   [] = 模型明确声明不支持推理档位。
   */
  effortsOf(provider, model) {
    if (this.catalogStatus !== 'ready') return undefined
    const group = this.catalogGroups.find((candidate) => candidate.id === provider)
    const entry = group?.models?.find((candidate) => candidate.id === model)
    if (entry === undefined) return undefined
    const efforts = entry.reasoning?.efforts
    return Array.isArray(efforts) ? efforts.map((effort) => effort.id) : []
  }

  /** 目录就绪时，provider 不在已注册清单里的角色行（「按可用模型补齐」的作用对象）。 */
  routeGapsOf(rows) {
    if (this.catalogStatus !== 'ready') return []
    const registered = new Set(this.catalogGroups.map((group) => group.id))
    return rows
      .filter((row) => typeof row.provider === 'string' && row.provider.trim() !== '' && !registered.has(row.provider))
      .map((row) => ({ toolName: row.toolName, provider: row.provider }))
  }

  /**
   * 一键补齐：把 provider 未注册的行改成当前可用路由。
   * 优先用部署默认路由（modelCatalog.default），否则取第一个可用 provider 的第一个模型。
   * 只改草稿，用户仍需点「保存」才生效。
   */
  fillUnavailableRoutes() {
    if (!this.editable() || this.catalogStatus !== 'ready') return
    const gaps = this.routeGapsOf(this.drafts !== undefined ? this.draftRows() : this.effectiveRows())
    if (gaps.length === 0) return
    const registered = new Set(this.catalogGroups.map((group) => group.id))
    let target = this.catalogDefault
    if (target === undefined || !registered.has(target.provider)) {
      const group = this.catalogGroups.find((candidate) => (candidate.models ?? []).length > 0)
      const model = group?.models?.[0]
      target = group === undefined || model === undefined ? undefined : { provider: group.id, model: model.id }
    }
    if (target === undefined) return
    const drafts = this.beginDraft()
    for (const gap of gaps) {
      const row = drafts.get(gap.toolName)
      if (row === undefined) continue
      row.provider = target.provider
      row.model = target.model
      // 目标模型的推理档位与旧模型无关：清掉，避免带着新模型不支持的档位保存。
      delete row.reasoningEffort
    }
    this.failed = false
    this.publish()
  }

  // --- 编辑动作 ---
  editRole(toolName, field, text) {
    if (!this.editable()) return
    if (field === 'toolName') return this.renameRole(toolName, text)
    if (!TEXT_FIELDS.includes(field)) return
    const row = this.beginDraft().get(toolName)
    if (row === undefined) return
    row[field] = text
    // 切 provider/model 时：新模型不支持的旧档位必须清掉，否则委派预检会失败。
    if (field === 'provider' || field === 'model') {
      const efforts = this.effortsOf(row.provider, row.model)
      if (efforts !== undefined && row.reasoningEffort !== undefined
        && row.reasoningEffort !== '' && !efforts.includes(row.reasoningEffort)) {
        delete row.reasoningEffort
      }
    }
    this.failed = false
    this.publish()
  }

  renameRole(toolName, text) {
    const name = String(text ?? '').trim()
    if (name === toolName) return
    if (!TOOL_NAME_RE.test(name)) return
    const drafts = this.beginDraft()
    const row = drafts.get(toolName)
    if (row === undefined || drafts.has(name)) return
    drafts.delete(toolName)
    row.toolName = name
    drafts.set(name, row)
    this.failed = false
    this.publish()
  }

  addRole() {
    if (!this.editable()) return
    const drafts = this.beginDraft()
    let index = 1
    while (drafts.has(`role_${index}`)) index += 1
    const toolName = `role_${index}`
    drafts.set(toolName, { toolName, provider: '', model: '' })
    this.failed = false
    this.publish()
  }

  removeRole(toolName) {
    if (!this.editable()) return
    const exists = this.drafts !== undefined
      ? this.drafts.has(toolName)
      : this.effectiveRows().some((row) => row.toolName === toolName)
    if (!exists) return
    this.beginDraft().delete(toolName)
    this.failed = false
    this.publish()
  }

  discard() {
    if (this.saving || this.disposed) return
    this.clearDraft()
    this.publish()
  }

  // --- 写路径 ---
  async save() {
    const snapshot = this.scope.getSnapshot()
    if (this.disposed || this.saving || snapshot.status !== 'ready' || snapshot.writable !== true) return
    if (this.drafts === undefined || !this.isDirty()) return
    // 本地校验拦截：任何一行带非法字段 → 不发起 mutate
    if (this.draftRows().some((row) => invalidFieldsOf(row, this.effortsOf(row.provider, row.model)).length > 0)) {
      this.failed = true
      this.publish()
      return
    }
    // revision 栅栏：起草后他处保存过 → 冲突，拒发 mutate
    if (snapshot.revision !== this.draftRevision) {
      this.conflicted = true
      this.publish()
      return
    }
    const generation = this.saveGeneration
    this.saving = true
    this.failed = false
    this.conflicted = false
    this.publish()
    // 两个 op 一次提交：enabled=true 让 host 知道「面板已接管」（缺省 false = 未接管 → 回落 jsonc）；
    // roles 是整表。顺序无关（两个独立路径）。
    await this.scope.mutate([
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['roles'], value: this.draftRows().map(normalizeRow) },
    ], this.draftRevision)
    if (generation !== this.saveGeneration || this.disposed) return
    const landed = serializeRows(this.effectiveRows()) === serializeRows(this.draftRows())
    this.saving = false
    this.failed = !landed
    if (landed) this.clearDraft()
    this.publish()
  }

  /** 重置为文件配置：清用户层的 enabled + roles → 真正退出接管，回落 jsonc 链。 */
  /**
   * 恢复官方推荐：**零覆盖**接管。
   *
   * `enabled=true` + `roles=[]` 在 `mergeRoles` 语义下等于「不做任何覆盖」→ 生效表就是内置表。
   * 不写任何模型名，所以以后内置默认变了会自动跟上，也不会因为抄写而产生过期副本。
   */
  async restoreOfficial() {
    if (this.disposed || this.saving) return
    if (this.scope.getSnapshot().writable !== true) return
    this.clearDraft()
    this.publish()
    await this.scope.mutate([
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['roles'], value: [] },
    ])
    if (this.disposed) return
    this.publish()
  }

  async loadCatalog() {
    if (this.disposed || this.catalogStatus === 'loading') return
    const generation = this.catalogGeneration
    this.catalogStatus = 'loading'
    this.catalogPartial = false
    this.publish()
    try {
      const response = await this.ctx.remote.session.modelCatalog()
      if (generation !== this.catalogGeneration || this.disposed) return
      if (response && response.ok) {
        this.catalogGroups = response.value?.groups ?? []
        this.catalogDefault = response.value?.default
        this.catalogPartial = (response.value?.failures ?? []).length > 0
        this.catalogStatus = 'ready'
      } else {
        this.catalogStatus = 'error'
      }
    } catch {
      if (generation !== this.catalogGeneration || this.disposed) return
      this.catalogStatus = 'error'
    }
    this.publish()
  }

  /**
   * 目录合并（对齐 C8 subagentModelCandidates）：目录内路由标 available:true；
   * 已存/草稿路由不在目录 → 保留为 available:false 的选项（不静默丢配置）。
   */
  mergedGroups(rows) {
    if (this.catalogStatus !== 'ready') return []
    const seen = new Set()
    const keyOf = (provider, model) => `${provider}\u0000${model}`
    const groups = this.catalogGroups.map((group) => ({
      ...group,
      models: (group.models ?? []).map((model) => {
        seen.add(keyOf(group.id, model.id))
        return { ...model, available: true }
      }),
    }))
    const byProvider = new Map(groups.map((group) => [group.id, group]))
    for (const row of rows) {
      const provider = String(row.provider ?? '').trim()
      const model = String(row.model ?? '').trim()
      if (provider === '' || model === '' || seen.has(keyOf(provider, model))) continue
      seen.add(keyOf(provider, model))
      let group = byProvider.get(provider)
      if (group === undefined) {
        group = { id: provider, name: provider, models: [] }
        byProvider.set(provider, group)
        groups.push(group)
      }
      group.models.push({ id: model, name: model, available: false })
    }
    return groups
  }

  projection() {
    const snapshot = this.scope.getSnapshot()
    const takeover = snapshot.value?.enabled === true
    const source = this.drafts !== undefined ? this.draftRows() : this.effectiveRows()
    const rows = source.map((row) => ({
      toolName: row.toolName,
      provider: row.provider ?? '',
      model: row.model ?? '',
      reasoningEffort: row.reasoningEffort ?? '',
      persona: row.persona ?? '',
      summary: row.summary ?? '',
      // 备用链随行暴露（面板不编辑它，但保存必须原样带回，见 normalizeRow）
      ...(Array.isArray(row.fallbackModels) && row.fallbackModels.length > 0
        ? { fallbackModels: [...row.fallbackModels] }
        : {}),
      isCustom: !Object.hasOwn(DEFAULT_ROLES, row.toolName),
      invalidFields: invalidFieldsOf(row, this.effortsOf(row.provider, row.model)),
    }))
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable === true,
      /** 面板是否已接管生效表（host 侧 Config.enabled）。未接管时 rows 来自 host 快照预填，
       *  不是空表；saving 后由本面板接管。 */
      takeover,
      /** 两态：official = 跟随官方推荐（零覆盖/无配置）；custom = 面板自定义覆盖。 */
      mode: takeover && (snapshot.value?.roles ?? []).length > 0 ? 'custom' : 'official',
      /** 覆盖行数（面板自定义时用于状态行显示）。 */
      overrides: (snapshot.value?.roles ?? []).length,
      dirty: this.isDirty(),
      saving: this.saving,
      failed: this.failed,
      conflicted: this.conflicted,
      rows,
      catalog: { status: this.catalogStatus, groups: this.mergedGroups(rows), partial: this.catalogPartial },
      /** provider 未注册的行（catalog 就绪才计算）。 */
      routeGaps: this.routeGapsOf(this.drafts !== undefined ? this.draftRows() : rows),
      basePresent: Array.isArray(snapshot.base?.roles),
    }
  }
}
