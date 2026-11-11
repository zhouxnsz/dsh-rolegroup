// dsh-rolegroup host —— 「当前配置」只读快照 + 可选 web 路由（设置页「配置文件」按钮的数据源）。
//
// 设计边界：
//   - `buildConfigInfo` 是**纯函数**：输入当前状态，输出可直接 JSON 化的快照；node 可测。
//   - `installConfigInfoRoute` 只在宿主提供 `webServer` 时注册一条 GET 路由；headless 宿主没有它时
//     静默跳过（红线 1：可选能力缺失绝不让插件加载失败）。客户端拿不到数据时自行显示降级文案。
//   - 路由只服务本机（loopback）请求：它绕过 `/api` 的浏览器认证层，绝不向局域网暴露配置文件内容。
//   - **暴露面登记（v0.7）**：`GET|HEAD /api/dsh-rolegroup/config`，loopback-only、**无认证**、**只读**；
//     返回的是启动时读入的**内存快照**（`configSource` 固定候选：项目/用户 rolegroup.jsonc），
//     **不按请求 URL/查询串读盘**，因此不存在任意文件读取或路径穿越面（有断言锁：v0.7/AC-10）。
//     能访问本机回环的进程本来就能读 `~/.dsh`，故本路由不额外扩大信任面；多用户/不可信本机环境
//     仍建议把 dsh web 的监听面限制在回环（默认即如此）。
// @module dsh-rolegroup/config-info

/** 客户端与宿主共用的路由路径（两端各自写死；smoke suite 有一致性断言）。 */
export const CONFIG_ROUTE_PATH = '/api/dsh-rolegroup/config'

/**
 * 构造「当前配置」快照。
 * 生效层判定与 host 侧启动逻辑同源：
 *   - 面板 `enabled=true` → 面板（jsonc 整层让位）
 *   - 否则有可解析的 jsonc → 文件
 *   - 否则 → 内置默认表
 * 每个生效角色的 `from` 表示它的字段来自哪一层（panel / file / builtin），用于在弹窗里标注来源。
 *
 * @param {object} input
 * @param {boolean} input.panelEnabled 面板是否接管（settings 的 enabled 位）
 * @param {string[]} input.panelRoleNames 面板覆盖表里的角色名
 * @param {null | { path: string, mtimeMs?: number | null, text?: string | null, error?: string | null }} input.file
 *   启动时读取的 jsonc 文件快照（无文件 → null）
 * @param {string[]} input.fileRoleNames jsonc 文件里显式写到的角色名
 * @param {Array<{ toolName: string, provider: string, model: string }>} input.effectiveRoles 当前生效角色表
 * @param {string[]} input.problems 当前生效表的问题清单
 * @returns {{ active: 'panel' | 'file' | 'builtin', file: null | object, effective: { roles: object[], problems: string[] } }}
 */
export function buildConfigInfo({ panelEnabled, panelRoleNames, file, fileRoleNames, effectiveRoles, problems }) {
  const fileUsable = file !== null && file !== undefined && (file.error === undefined || file.error === null || file.error === '')
  const active = panelEnabled ? 'panel' : (fileUsable ? 'file' : 'builtin')
  const panelNames = new Set(panelRoleNames ?? [])
  const fileNames = new Set(fileRoleNames ?? [])
  const fromOf = (toolName) => {
    if (active === 'panel') return panelNames.has(toolName) ? 'panel' : 'builtin'
    if (active === 'file') return fileNames.has(toolName) ? 'file' : 'builtin'
    return 'builtin'
  }
  return {
    active,
    file: file === null || file === undefined
      ? null
      : {
          path: file.path,
          mtimeMs: file.mtimeMs ?? null,
          text: file.text ?? null,
          error: file.error ?? null,
          active: active === 'file',
        },
    effective: {
      roles: (effectiveRoles ?? []).map((role) => ({
        toolName: role.toolName,
        provider: role.provider,
        model: role.model,
        // 设置页会拿这份快照预填编辑表：可选字段必须一并带上，否则预填会丢 persona/summary。
        ...(typeof role.reasoningEffort === 'string' && role.reasoningEffort !== '' ? { reasoningEffort: role.reasoningEffort } : {}),
        ...(typeof role.persona === 'string' && role.persona !== '' ? { persona: role.persona } : {}),
        ...(typeof role.summary === 'string' && role.summary !== '' ? { summary: role.summary } : {}),
        from: fromOf(role.toolName),
      })),
      problems: [...(problems ?? [])],
    },
  }
}

/** 只允许本机回环地址访问配置快照（含 IPv4-mapped 形式）。 */
function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address === '') return false
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
    || address.startsWith('127.')
}

function sendJson(response, status, body, headOnly = false) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    // 防 MIME 嗅探：本路由返回的是配置内容（含 persona/summary 等文本），
    // 历史浏览器把 JSON 当脚本解释的经典面，加 nosniff 后无法被 <script> 引用执行。
    'x-content-type-options': 'nosniff',
  })
  response.end(headOnly ? undefined : JSON.stringify(body))
}

/**
 * 注册「当前配置」只读路由；没有 webServer 时安静跳过。
 * @param {object} ctx host ctx
 * @param {() => object} buildInfo 生成快照的闭包（调用时读取最新状态）
 * @param {{ info?: Function, warn?: Function }} [log]
 * @returns {boolean} 是否已发起注册（不代表 webServer 已就绪）
 */
export function installConfigInfoRoute(ctx, buildInfo, log) {
  if (typeof ctx?.inject !== 'function') return false
  try {
    ctx.inject(['webServer'], (webCtx) => {
      const server = webCtx?.webServer
      if (server === undefined || typeof server.register !== 'function') return
      try {
        const dispose = server.register({
          kind: 'exact',
          path: CONFIG_ROUTE_PATH,
          handler: async (request, response) => {
            if (request.method !== 'GET' && request.method !== 'HEAD') {
              response.writeHead(405, {
                allow: 'GET, HEAD',
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'no-store',
                'x-content-type-options': 'nosniff',
              })
              response.end(JSON.stringify({ ok: false, error: { message: 'method not allowed' } }))
              return
            }
            if (!isLoopbackAddress(request.socket?.remoteAddress)) {
              sendJson(response, 403, { ok: false, error: { message: 'local access only' } })
              return
            }
            try {
              sendJson(response, 200, { ok: true, generatedAt: new Date().toISOString(), ...buildInfo() }, request.method === 'HEAD')
            } catch (error) {
              log?.warn?.(`dsh-rolegroup: 生成配置快照失败（${error?.message ?? error}）`)
              sendJson(response, 500, { ok: false, error: { message: 'config info unavailable' } })
            }
          },
        })
        if (typeof webCtx.effect === 'function') webCtx.effect(() => dispose, 'dsh-rolegroup: config route')
        log?.info?.(`dsh-rolegroup: 配置查看接口已注册（${CONFIG_ROUTE_PATH}）`)
      } catch (error) {
        log?.warn?.(`dsh-rolegroup: 配置查看接口注册失败（${error?.message ?? error}）；「配置文件」按钮将不可用`)
      }
    })
    return true
  } catch (error) {
    log?.warn?.(`dsh-rolegroup: 配置查看接口安装失败（${error?.message ?? error}）；「配置文件」按钮将不可用`)
    return false
  }
}
