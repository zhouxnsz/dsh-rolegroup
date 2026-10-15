// dsh-rolegroup client —— 卡片词典（plans/v0.3-gui-panel.md §2.5；ctx.locale.register('rolegroup', {zh, en})）。
// T5 已补齐 card.jsx 用到的全部展示 key；zh/en key 集 parity 由 v0.3/AC-28 断言锁死。
// 纪律：UI 文案一律走 key，controller/组件里不得写死自然语言句子。

export const zh = {
  title: '角色配置',
  description: '可视化编辑角色 ↔ 模型路由。生效优先级：本面板 > 项目 rolegroup.jsonc > 用户 rolegroup.jsonc > 内置表。',
  dirtyBadge: '未保存',
  save: '保存',
  discard: '放弃',
  resetToBase: '重置为文件配置',
  addRole: '新增角色',
  removeRole: '删除',
  retryCatalog: '重试',
  fieldToolName: '工具名',
  fieldProvider: '提供方',
  fieldModel: '模型',
  fieldReasoningEffort: '推理档位',
  fieldPersona: '人格设定',
  fieldSummary: '职责摘要',
  liveHint: '保存后新会话生效，进行中的会话不受影响',
  conflicted: '配置已在别处被修改，草稿保留中；请放弃或重置后重试',
  saveFailed: '保存失败（本地校验未通过或宿主拒绝），请检查标红字段后重试',
  catalogLoading: '正在拉取模型目录…',
  catalogError: '模型目录拉取失败',
  catalogPartial: '部分提供方目录拉取失败，候选可能不完整',
  routeUnavailable: '当前路由不在模型目录中（保留以防丢配置）',
  selectProvider: '选择提供方',
  selectModel: '选择模型',
  scopeUnavailable: 'rolegroup 设置命名空间不可用（宿主未注册或不可写），面板暂不可编辑',
  notTakeover: '本面板尚未接管：当前生效的是 rolegroup.jsonc / 内置表，未在下面列出的角色一律沿用它们。'
    + '空白 ≠ 没有角色——点「新增角色」加一行（只需加你想改的那些）并「保存」后，由本面板接管；'
    + '「重置为文件配置」可退出接管。完整生效表见 /rolegroup doctor。',
}

export const en = {
  title: 'Role Routing',
  description: 'Edit role ↔ model routes visually. Precedence: this panel > project rolegroup.jsonc > user rolegroup.jsonc > built-in table.',
  dirtyBadge: 'Unsaved',
  save: 'Save',
  discard: 'Discard',
  resetToBase: 'Reset to file config',
  addRole: 'Add role',
  removeRole: 'Remove',
  retryCatalog: 'Retry',
  fieldToolName: 'Tool name',
  fieldProvider: 'Provider',
  fieldModel: 'Model',
  fieldReasoningEffort: 'Reasoning effort',
  fieldPersona: 'Persona',
  fieldSummary: 'Summary',
  liveHint: 'Saved routes apply to new sessions; in-flight sessions are unaffected',
  conflicted: 'Settings changed elsewhere; your draft is kept — discard or reset, then retry',
  saveFailed: 'Save failed (local validation or host rejection); fix the flagged fields and retry',
  catalogLoading: 'Loading model catalog…',
  catalogError: 'Failed to load the model catalog',
  catalogPartial: 'Some providers failed to respond; candidates may be incomplete',
  routeUnavailable: 'Current route is not in the catalog (kept to avoid silent config loss)',
  selectProvider: 'Select provider',
  selectModel: 'Select model',
  scopeUnavailable: 'The rolegroup settings namespace is unavailable (not served by the host or not writable); editing is disabled',
  notTakeover: 'This panel has not taken over yet: the effective table comes from rolegroup.jsonc / the built-in table, '
    + 'and any role not listed below keeps using them. An empty list does not mean "no roles" — add a row (only for the roles you '
    + 'want to change) and Save to take over; Reset to file config exits takeover. See /rolegroup doctor for the full table.',
}

export default { zh, en }
