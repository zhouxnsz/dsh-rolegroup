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
const CONFIG_ENDPOINT = '/api/dsh-rolegroup/config'

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
    this.catalogPartial = false
    this.catalogStatus = 'idle'
    // 「配置文件」按钮：status = idle|loading|error；notice = undefined|'noFile'。
    this.config = { status: 'idle', error: undefined, notice: undefined }
    // 未接管时的预填数据：来自 host 快照的当前生效表（jsonc / 内置表）。
    this.effective = { status: 'idle', roles: [], error: undefined }
    this.lastTakeover = this.scope.getSnapshot().value?.enabled === true
    this.saveGeneration = 0
    this.catalogGeneration = 0
    this.configGeneration = 0
    this.effectiveGeneration = 0
    this.disposed = false
    this.store = createSnapshotStore(() => this.projection(), () => {
      // catalog 懒加载：卡片展开（组件首次订阅）且 idle 时才拉取
      if (this.catalogStatus === 'idle') this.loadCatalog()
      // 当前生效表预填：未接管且还没拉过时懒加载（卡片展开才请求）
      if (!this.isTakeover() && this.effective.status === 'idle') void this.loadEffective()
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
      resetToBase: () => { this.resetToBase() },
      retryCatalog: () => this.retryCatalog(),
      retryEffective: () => this.retryEffective(),
      openConfig: () => this.openConfig(),
    }
  }

  /** 停止观察 scope 并压制迟到的写/目录/配置结算。 */
  dispose() {
    this.disposed = true
    this.saveGeneration += 1
    this.catalogGeneration += 1
    this.configGeneration += 1
    this.effectiveGeneration += 1
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
    if (snapshot.value?.enabled === true || panelRows.length > 0) return panelRows
    return this.effective.status === 'ready' ? this.effective.roles : []
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
    // 预填尚未就绪（idle/loading）时禁止编辑：避免用户先加了行、预填随后到达把草稿基准换掉。
    // error 仍允许手动新增（旧行为兜底），卡片会给出保存警示；面板层已有行时不需要预填。
    const panelRows = Array.isArray(snapshot.value?.roles) ? snapshot.value.roles : []
    const needsPrefill = !this.isTakeover() && panelRows.length === 0
    if (needsPrefill && this.effective.status !== 'ready' && this.effective.status !== 'error') return false
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
    // 接管状态变化：退出接管（重置/他处清空）后必须重新读取文件/内置生效表。
    const takeover = this.isTakeover()
    if (takeover !== this.lastTakeover) {
      this.lastTakeover = takeover
      if (!takeover && this.effective.status !== 'loading') void this.loadEffective()
    }
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
  async resetToBase() {
    if (this.disposed || this.saving) return
    if (this.scope.getSnapshot().writable !== true) return
    this.clearDraft()
    this.publish()
    await this.scope.mutate([
      { op: 'unset', path: ['enabled'] },
      { op: 'unset', path: ['roles'] },
    ])
    if (this.disposed) return
    // 退出接管后基准回到 jsonc / 内置表：预填数据必须重新按文件读一次。
    if (!this.isTakeover() && this.effective.status !== 'loading') void this.loadEffective()
    this.publish()
  }

  // --- 配置文件按钮 ---
  /**
   * 拉取当前配置快照，取 host 给出的配置文件绝对路径，交给右侧栏文档预览打开。
   * 成功返回 true（卡片随后关闭设置弹窗以露出右侧栏）；无文件/右侧栏不可用/接口失败返回 false，
   * 并把可显示的 notice/error 留在投影里。渲染全部在设置页内联，不弹窗。
   */
  async openConfig() {
    if (this.disposed || this.config.status === 'loading') return false
    const generation = ++this.configGeneration
    this.config.status = 'loading'
    this.config.error = undefined
    this.config.notice = undefined
    this.publish()
    try {
      const payload = await this.fetchConfigInfo()
      if (generation !== this.configGeneration || this.disposed) return false
      if (payload?.ok !== true) throw new Error(payload?.error?.message ?? 'config info unavailable')
      const path = payload?.file?.path
      if (typeof path !== 'string' || path === '') {
        this.config.status = 'idle'
        this.config.notice = 'noFile'
        this.publish()
        return false
      }
      const opened = this.options?.openConfigFile?.(path) === true
      if (!opened) throw new Error('sidebar unavailable')
      this.config.status = 'idle'
      this.publish()
      return true
    } catch (error) {
      if (generation !== this.configGeneration || this.disposed) return false
      this.config.status = 'error'
      this.config.error = String(error?.message ?? error)
      this.publish()
      return false
    }
  }

  /**
   * 同源 fetch；测试可经 options.fetch 注入。
   * 注意：绝不能读 `ctx.fetch`——cordis 对未 inject 的服务属性会抛
   * “cannot get property \"fetch\" without inject”（真机实测）。fetch 不是 cordis 服务。
   */
  async fetchConfigInfo() {
    const fetchImpl = this.options?.fetch ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable')
    const response = await fetchImpl(CONFIG_ENDPOINT, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? '?'}`)
    return await response.json()
  }

  // --- 当前生效表预填 ---
  /** 拉取 host 快照里的当前生效表（未接管时预填编辑表）；迟到响应按 generation 丢弃。 */
  async loadEffective() {
    if (this.disposed || this.effective.status === 'loading') return
    const generation = ++this.effectiveGeneration
    this.effective.status = 'loading'
    this.effective.error = undefined
    this.publish()
    try {
      const payload = await this.fetchConfigInfo()
      if (generation !== this.effectiveGeneration || this.disposed) return
      if (payload?.ok !== true) throw new Error(payload?.error?.message ?? 'config info unavailable')
      const roles = payload?.effective?.roles
      this.effective.roles = Array.isArray(roles) ? roles : []
      this.effective.status = 'ready'
    } catch (error) {
      if (generation !== this.effectiveGeneration || this.disposed) return
      this.effective.status = 'error'
      this.effective.error = String(error?.message ?? error)
    }
    this.publish()
  }

  retryEffective() {
    if (this.disposed || this.effective.status === 'loading') return
    void this.loadEffective()
  }

  // --- catalog ---
  retryCatalog() {
    if (this.disposed || this.catalogStatus === 'loading') return
    this.loadCatalog()
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
      isCustom: !Object.hasOwn(DEFAULT_ROLES, row.toolName),
      invalidFields: invalidFieldsOf(row, this.effortsOf(row.provider, row.model)),
    }))
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable === true,
      /** 面板是否已接管生效表（host 侧 Config.enabled）。未接管时 rows 来自 host 快照预填，
       *  不是空表；saving 后由本面板接管。 */
      takeover,
      dirty: this.isDirty(),
      saving: this.saving,
      failed: this.failed,
      conflicted: this.conflicted,
      rows,
      catalog: { status: this.catalogStatus, groups: this.mergedGroups(rows), partial: this.catalogPartial },
      /** 预填状态：未接管时由 host 快照提供 jsonc / 内置生效表。 */
      effective: {
        /** 未接管且面板层还没有行：编辑必须先等 host 生效表预填到达（否则草稿基准是空表）。 */
        required: !takeover && (snapshot.value?.roles ?? []).length === 0,
        status: takeover ? 'ready' : this.effective.status,
        error: takeover ? undefined : this.effective.error,
        prefilled: !takeover && this.effective.status === 'ready',
      },
      /** 「配置文件」按钮的瞬时状态：loading / error / noFile notice。 */
      config: { ...this.config },
      basePresent: Array.isArray(snapshot.base?.roles),
    }
  }
}
