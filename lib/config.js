// dsh-rolegroup v0.4：settings 层的 Config schema（schemastery）。
//
// 契约见 plans/v0.4-settings-migration.md §0：
//   S2  dsh 0.1.7 的 settings 按「Loader 条目 id = 命名空间；条目自身 Config = 表单 schema」投影配置页；
//   S4  只有 meta.volatile 命中的字段可描述、可写；无 volatile 字段的条目**根本不进 describe 镜像**；
//   S5  .volatile() 只能标在固定对象路径上、不能嵌套 ⇒ **标整个 roles 数组，元素字段一律不标**。
//
// 解析方式刻意用 **顶层 await + try/catch**，而不是静态 import：
//   - 本仓库是 link: 形态，裸导入靠 scripts/link-deployment-deps.mjs 建的软链（T1）；
//   - 若软链缺失（没跑 link:deps、或 dsh 换了部署树），**只让 Config = undefined** ——
//     dsh-settings 跳过该条目（面板不出现），而插件的 host-only 角色能力**照常工作**（红线 1）。
//   - 改成静态 import 会把「缺 schemastery」升级成「整个插件加载失败」，直接违反红线 1（坑 #11 的同类风险）。
//
// @module dsh-rolegroup/config

/** Loader 条目 id === settings 命名空间（S2）。必须与 cordis.patch.yml / home 层 insert 的行 id 逐字一致。 */
export const ROLEGROUP_ENTRY_ID = 'dsh-rolegroup'

/** 角色行字段口径（v0.3 起与 settings schema 对齐；v0.5 移除 `readonly`——工具面白名单表达不了权限边界，
 *  见 lib/roles.js 头注；只读改由会话级 permission preset 承担）。 */
const ROLE_FIELDS = {
  toolName: 'required-string',
  provider: 'required-string',
  model: 'required-string',
  reasoningEffort: 'string',
  persona: 'string',
  summary: 'string',
}

let Config
let configUnavailableReason
try {
  const mod = await import('@deepseek-ai/schemastery')
  const z = mod?.default ?? mod
  if (typeof z?.object === 'function' && typeof z?.array === 'function') {
    const RoleSchema = z.object({
      toolName: z.string().required(),
      provider: z.string().required(),
      model: z.string().required(),
      reasoningEffort: z.string(), // 可选；空 = 提供方默认档
      persona: z.string(),         // 可选；空 = 内置/通用 persona
      summary: z.string(),         // 可选
    })
    // ⚠️ volatile 标在**数组**上（S5）；标元素里的 provider/model 会抛
    // "volatile fields require a fixed object path without an enclosing volatile field"。
    // ⚠️ **接管判据必须显式**：schemastery 会把 `z.array(...)` 的值自动补成 `[]`（实测：
    //    `C({}).roles.get() === []`），所以「字段缺省」与「显式空数组」在**解析值上不可区分**——
    //    靠 roles 的长度或缺省判断「面板是否接管」是不可能的（收口审查 B-1）。
    //    故照上游 `subagent-model-selection-settings` 同款做法加一个显式 volatile 布尔位：
    //      enabled=false（缺省）= 面板未接管 → 回落 jsonc 链；
    //      enabled=true        = 面板接管 → 生效表 = roles（**允许为空 = 零覆盖**）。
    //    客户端保存时会同时写 enabled=true + roles；「重置」则两者都 unset 从而真正退出接管。
    Config = z.object({
      enabled: z.boolean().default(false).volatile(),
      roles: z.array(RoleSchema).volatile(),
    })
  } else {
    configUnavailableReason = new Error('@deepseek-ai/schemastery 形状不符（缺 object/array）')
  }
} catch (error) {
  // 部署树不可达：Config 保持 undefined，插件退化为 host-only（面板缺席）。
  // 红线 1：绝不因可选能力缺失而让插件加载失败。但**绝不静默**——这里拿不到 ctx.logger（模块求值期），
  // 故用 console 留痕，并导出原因供 doctor/测试核对。
  configUnavailableReason = error
}

if (configUnavailableReason !== undefined) {
  console.warn(`[dsh-rolegroup] 无法使用部署树的 @deepseek-ai/schemastery（${configUnavailableReason?.message ?? configUnavailableReason}）：`
    + 'GUI 角色配置面板缺席，插件按 host-only 运行。修复：在本仓库跑 `npm run link:deps`（dsh 升级换部署树后需重跑）。')
}

export { Config }

/** Config 不可用的原因；`undefined` = 可用。模块求值期确定，供测试与排障核对。 */
export const CONFIG_UNAVAILABLE_REASON = configUnavailableReason

/** 面板字段清单（角色行元素字段；供测试断言与文档使用）。 */
export const ROLEGROUP_CONFIG_FIELDS = Object.freeze({ ...ROLE_FIELDS })

/**
 * 条目 Config 的**顶层**字段名。`lib/index.js` 用它把「cordis 传入的条目 Config」与
 * 「测试注入项」区分开——必须覆盖**全部**顶层字段：只嗅探单个键名会在字段增减时静默失效
 *（收口审查 N-1）。新增顶层字段时**务必同步这里**。
 */
export const ROLEGROUP_CONFIG_TOP_FIELDS = Object.freeze(['enabled', 'roles'])

/** 取 volatile 引用的当前值；非 volatile 值原样返回（cordis 只对 volatile 字段包引用）。 */
function unwrap(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 读出 roles 字段的**存在性三态**：
 *   - `undefined`：字段缺省 ⇒ 面板从未接管（回落 jsonc 链）
 *   - `Array`（**含 `[]`**）：面板已接管；`[]` 表示「零角色」，是合法的用户意图
 * @param {unknown} config cordis 传给 apply 的解析值。
 * @returns {Array<object> | undefined}
 */
export function rolesFieldOf(config) {
  const raw = unwrap(isPlainObject(config) ? config.roles : undefined)
  return Array.isArray(raw) ? raw.filter(isPlainObject) : undefined
}

/**
 * roles 数组（字段缺省时回落空数组）。供只需要「有哪些角色」的调用方使用。
 * @param {unknown} config
 * @returns {Array<object>}
 */
export function rolesFromConfig(config) {
  return rolesFieldOf(config) ?? []
}

/**
 * settings 层是否接管生效表（D4）：由**显式 volatile 位 `enabled`** 决定（见 Config 注释里的理由）。
 *   - `enabled !== true`（缺省 false）→ 未接管，回落 jsonc 链（v0.1 行为逐字不变）
 *   - `enabled === true` → 接管，生效表 = `roles`（**空数组 = 零覆盖**，是合法且可表达的意图）
 *
 * 「零覆盖」与 README「已知取舍②」不是一回事：后者说的是**生效结果**——
 * `mergeRoles` 恒以内置默认表为底，所以空覆盖表最终仍是内置 7 角色，「零角色」仍不可达。
 * @param {unknown} config
 * @returns {{ roles: Array<object> } | undefined}
 */
export function settingsSectionOf(config) {
  const enabled = unwrap(isPlainObject(config) ? config.enabled : undefined)
  if (enabled !== true) return undefined
  return { roles: rolesFromConfig(config) }
}
