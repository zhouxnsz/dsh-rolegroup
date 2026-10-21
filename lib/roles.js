// dsh-rolegroup: 内置默认角色表 + 配置合并 + 实例配置构建（纯函数，无 cordis 依赖）。
//
// 角色表依据 docs/proposal.md §3（2026-09-22 评审修订 D-Rev1..D-Rev4）：
//   - 所有角色统一 maxDepth: 1（主会话可委派、角色子代理不可再委派，D-Rev2；0 会把顶层调用也挡掉）
//   - 绑定模型为初值，待 v0.2 评测数据驱动调整（只改配置不改代码）
//
// ⚠️ v0.5 移除 `readonly`（用户拍板，方案 B）：
//   原设计「只读角色用工具面白名单硬限制」**未兑现**：白名单只能收窄工具面，**表达不了权限边界**，
//   在配置面提供它反而容易被误读成「安全开关」。**只读改由 persona 软约束 + 会话级
//   permission preset（read-only）承担**；因此本文件不再构建该白名单。
//   老配置里的 `readonly` 字段会被 mergeRoles 识别为**已废弃**并给出迁移提示（绝不静默忽略）。
// @module dsh-rolegroup/roles

/** 工具名合法性格式（同时也是 cordis patch 里可用的 id 字符集）。 */
export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,31}$/

/**
 * v0.5：残留 `readonly` 字段的迁移提示——**唯一权威文案**。
 * `lib/roles.js`（jsonc 入口）与 `lib/settings-table.js`（section 入口）共用同一函数，
 * 避免出现多份措辞各说各话的副本（收口审查 v0.5 复审 ③.3）。
 * @param {string} toolName 角色工具名（未知时给占位符）。
 * @returns {string} 人话迁移提示。
 */
export function readonlyDeprecationProblem(toolName) {
  return `角色 "${toolName}" 的 readonly 字段自 v0.5 起已移除、不再收窄工具面——`
    + '工具面白名单表达不了权限边界。请删除该字段；'
    + '需要只读请改用会话级 permission preset（read-only），它会被委派继承。'
}

/** 委派承载的 subagent 提供方（dsh-base 注册的进程内 spawn 后端）。 */
export const SUBAGENT_PROVIDER = 'spawn'

/**
 * 内置默认角色表。字段即 `.dsh/rolegroup.jsonc` 每角色的可覆盖项。
 * reasoningEffort 缺省省略（让提供方用模型默认档位，避免预检不支持而失败）。
 */
export const DEFAULT_ROLES = {
  analyst: {
    provider: 'qwen-token-plan-cn',
    model: 'qwen3.8-max',
    summary: '需求澄清、路径分类、方案评审（做不做/怎么做）、架构决策',
    persona: [
      '你是 analyst——需求澄清与方案评审角色。',
      '职责：把模糊需求先分类路径（探索/变更/修复），提出关键问题，评审「做不做、怎么做」，给出架构决策建议。',
      '铁律：你只读不写，不动手实现；输出必须是结论 + 依据（文件:行号 或官方来源）；',
      '发现需求歧义时先列分支再提问，不替用户拍板。',
    ].join('\n'),
  },
  planner: {
    provider: 'kimi-coding',
    model: 'k3',
    summary: '计划设计：文件结构、任务拆分、接口契约、plans.md 落笔',
    persona: [
      '你是 planner——计划设计角色。',
      '职责：把批准后的方案落成可执行计划：文件结构、任务拆分（每任务带验收标准、涉及文件、测试先行、证据）、接口契约。',
      '约定：你的写入范围仅限 plans/ 目录与计划文档（软约定）；不写生产代码；',
      '任务粒度以「一个 coder 一轮能闭环」为准。',
    ].join('\n'),
  },
  coder: {
    provider: 'kimi-coding',
    model: 'k3',
    summary: '编码执行：按 plans.md 步骤 TDD 红-绿-重构',
    persona: [
      '你是 coder——编码执行角色。',
      '职责：严格按 plans.md 的任务步骤执行 TDD：先写失败测试（红）→ 最小实现通过（绿）→ 重构；',
      '每步回填证据（跑了什么命令、看到什么输出）。',
      '铁律：不偏离计划擅自扩大范围；遇到计划缺陷，停下来报告，不绕道。',
    ].join('\n'),
  },
  reviewer: {
    provider: 'qwen-token-plan-cn',
    model: 'qwen3.8-max',
    summary: '收口审查：逐项核对验收标准与证据（做没做到）',
    persona: [
      '你是 reviewer——收口审查角色。',
      '职责：逐项核对验收标准与实际产物，只认证据（命令输出、测试记录、文件:行号），不接受「我觉得好了」；',
      '按严重度列出问题（阻塞/建议）。',
      '铁律：你只读不写；审查范围限于验收标准、证据真实性、计划符合度，不做风格警察；',
      '结论必须明确：通过 / 有条件通过 / 打回。',
    ].join('\n'),
  },
  scout: {
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    summary: '探索定位、批量搜索',
    persona: [
      '你是 scout——探索定位角色。',
      '职责：在代码库中快速定位（批量搜索、交叉引用），返回 文件:行号 级别的证据清单与一句话结论。',
      '铁律：你只读不写；不做长篇分析，定位即交付；',
      '找不到就明说找不到，并给出已排除的路径。',
    ].join('\n'),
  },
  scribe: {
    provider: 'qwen-token-plan-cn',
    model: 'qwen3.8-flash',
    summary: '文档回填、报告、spec 维护',
    persona: [
      '你是 scribe——文档角色。',
      '职责：文档回填、报告撰写、spec 维护，语言与既有文档风格一致。',
      '约定：写入范围仅限文档类文件（docs/、plans/、README、openspec/，软约定）；不改动代码逻辑；',
      '事实性内容必须有出处，不编造命令输出。',
    ].join('\n'),
  },
  fallback: {
    // 选它的两条理由（2026-09-30 定）：① **兜底角色的可用性优先**——`deepseek-official` 是 dsh
    // 唯一**保证注册**的 provider（连无凭据的空 DSH_HOME 都注册它），而被剪枝的 fallback 等于
    // 不存在，一条不可用的兜底路由没有意义（doctor 里的 ❌ 就是这种形态）。② **有评测数据**：
    // `docs/model-pairings.md` 结论 3 的备选 `deepseek-flash` 得 **9/10**，且与订阅限额故障域无关。
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    summary: '未分类轻量任务兜底',
    persona: [
      '你是 fallback——轻量任务兜底角色。',
      '职责：处理未分类的小任务（查一个事实、解释一段代码、做一次小搜索）。',
      '铁律：你只读不写；任务若实际需要深度分析或编码，明确建议改用对应角色（analyst/coder 等），不硬扛。',
    ].join('\n'),
  },
}

/** 自定义角色（内置表以外的名字）缺省 persona。 */
function genericPersona(toolName) {
  return `你是 ${toolName}——自定义委派角色。按调用方给定的任务简报执行，输出结论与依据。`
}

/**
 * 合并配置文件与内置默认表，产出最终角色列表。
 * @param {object|undefined} fileConfig - 解析后的 rolegroup.jsonc（可为空）
 * @returns {{ roles: Array<object>, problems: string[] }}
 *   roles 元素：{ toolName, provider, model, reasoningEffort?, persona, summary, custom }
 *   problems：配置级错误（未知字段类型、缺 provider/model、工具名非法、**已废弃字段**等），对应角色被跳过
 */
export function mergeRoles(fileConfig) {
  const problems = []
  const overrides = fileConfig?.roles ?? {}
  if (fileConfig !== undefined && (typeof fileConfig !== 'object' || fileConfig === null || Array.isArray(fileConfig))) {
    return { roles: [], problems: ['配置根必须是对象（{"roles": {...}}）'] }
  }
  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
    return { roles: [], problems: ['配置字段 "roles" 必须是对象'] }
  }

  const roles = []
  const names = [...Object.keys(DEFAULT_ROLES), ...Object.keys(overrides).filter((n) => !(n in DEFAULT_ROLES))]
  for (const toolName of names) {
    const base = DEFAULT_ROLES[toolName]
    const over = overrides[toolName]
    if (over !== undefined && (typeof over !== 'object' || over === null || Array.isArray(over))) {
      problems.push(`角色 "${toolName}" 的配置必须是对象，已跳过`)
      continue
    }
    // v0.5：readonly 已移除。老配置里仍有该字段时报**可执行的迁移提示**，不静默忽略
    //（静默忽略最危险：用户以为角色还是只读，实际工具面已放开）。文案与 section 入口共用。
    if (over !== undefined && 'readonly' in over) {
      problems.push(readonlyDeprecationProblem(toolName))
    }
    if (!TOOL_NAME_RE.test(toolName)) {
      problems.push(`角色名 "${toolName}" 不是合法工具名（${TOOL_NAME_RE}），已跳过`)
      continue
    }
    const merged = { ...(base ?? {}), ...(over ?? {}) }
    if (typeof merged.provider !== 'string' || merged.provider.trim() === ''
      || typeof merged.model !== 'string' || merged.model.trim() === '') {
      problems.push(`角色 "${toolName}" 缺少有效的 provider/model，已跳过`)
      continue
    }
    if (merged.reasoningEffort !== undefined && typeof merged.reasoningEffort !== 'string') {
      problems.push(`角色 "${toolName}" 的 reasoningEffort 必须是字符串，已跳过`)
      continue
    }
    roles.push({
      toolName,
      provider: merged.provider.trim(),
      model: merged.model.trim(),
      ...(merged.reasoningEffort !== undefined ? { reasoningEffort: merged.reasoningEffort } : {}),
      persona: typeof merged.persona === 'string' && !merged.persona.startsWith('file://')
        ? merged.persona
        : (base?.persona ?? genericPersona(toolName)),
      // file:// 外链由调用方异步解析，这里先记录原始值
      ...(typeof merged.persona === 'string' && merged.persona.startsWith('file://') ? { personaFile: merged.persona.slice('file://'.length) } : {}),
      summary: typeof merged.summary === 'string' ? merged.summary : (base?.summary ?? '自定义角色'),
      custom: !(toolName in DEFAULT_ROLES),
    })
  }
  return { roles, problems }
}

/**
 * 构建单个 dsh-tool-subagent 实例的 Config（dsh **0.2.1+**）。
 *
 * 0.2.1 契约（plans/v0.6-dsh-0.2.1-migration.md §1.3，上游 lib/index.js:355）：
 *   - **拒绝** `persona` / `toolFilter` / `backgroundMode`（出现即 throw）→ persona 只能由 Agent Preset 承载
 *   - `agentPreset` 必须被 `allowedAgentPresets` 包含（:209 显式 throw）；显式 preset 会**替换**父组合，
 *     故调用方传入的 preset 是「克隆默认 preset 完整 rows + 替换 persona + 剔除 delegation」的产物
 *   - `modelSelectionSettings: false` → install(ctx, undefined) 站立式组合，host 平面直接可用
 *   - `maxDepth: 1` → 主会话可委派、角色子会话不可再委派（防套娃；0 会连顶层也挡掉）
 *   - 固定 `agentOptions` → 委派时 preflightChildLlmRoute 校验路由真实存在
 *   - 只读边界仍由**会话级 permission preset** 承担（随委派继承），不在工具面表达
 *
 * @param {{ toolName: string, provider: string, model: string, reasoningEffort?: string }} role
 * @param {string} presetId 该角色的 Agent Preset id（`rolegroup-<toolName>`）
 */
export function buildInstanceConfig(role, presetId) {
  return {
    provider: SUBAGENT_PROVIDER,
    toolName: role.toolName,
    modelSelectionSettings: false,
    agentOptions: {
      provider: role.provider,
      model: role.model,
      ...(role.reasoningEffort !== undefined ? { reasoningEffort: role.reasoningEffort } : {}),
    },
    agentPreset: presetId,
    allowedAgentPresets: [presetId],
    maxDepth: 1,
  }
}

/** 面向模型的角色公告（system-prompt section 文本；措辞对齐 0.2.1 委派语义）。 */
export function roleAnnouncement(roles) {
  const lines = roles.map((r) => `- \`${r.toolName}\`（${r.provider}/${r.model}）：${r.summary}`)
  return [
    '本机已安装 dsh-rolegroup 插件（角色化委派层）：以下角色是绑定了固定模型的委派工具，按任务性质选用——',
    ...lines,
    '使用约定：角色工具均为一次性委派（不可再嵌套委派）；委派会立即返回 subagent id，任务完成时你会收到完成通知（不要轮询等待）。',
    '把任务简报写完整（背景、目标、验收标准），角色不继承你的上下文；未分类的轻量任务用 `fallback`。',
    '角色↔模型搭配由 dsh-rolegroup 配置管理，改配置无需改工作流。',
  ].join('\n')
}
