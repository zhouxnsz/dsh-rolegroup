// dsh-rolegroup client —— 「配置文件」按钮用到的纯函数：
// 把 host 给出的绝对路径拼成右侧栏文档预览可识别的 Session 文件地址。
//
// 地址语法与上游 `@deepseek-ai/dsh-util-workspace-path` 保持一致：
//   dsh-resource://file/session/<sessionId>/<encoded path>
// 绝对路径保留前导 `/`（空段），这样 Session 地址可以指向工作区外的文件
// （上游 `fileAddressFor` 对工作区外绝对路径就是这条路径）。node 可测，不触 DOM。
// @module dsh-rolegroup/client-config-file

const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

/** 组件编码一段路径；保留 Windows 盘符的冒号（与上游一致）。 */
function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

/**
 * 构造指向绝对配置文件的 Session 文件地址。
 * @param {string} sessionId 当前屏上 Session id
 * @param {string} path host 给出的绝对路径（也接受工作区相对路径）
 * @returns {string} `dsh-resource://file/session/<id>/<path>`
 */
export function configFileAddress(sessionId, path) {
  const normalized = String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(String(sessionId))}/${normalized.split('/').map(encodeSegment).join('/')}`
}

/**
 * 把路径交给右侧栏文档预览打开。
 * 失败（服务缺席 / 没有屏上 Session / 地址无人认领）返回 false，调用方据此显示内联提示。
 * @param {object | undefined} sidebarRight `ctx.sidebarRight`（可选服务）
 * @param {string} path host 给出的配置文件绝对路径
 * @returns {boolean} 是否已发出打开请求
 */
export function openConfigFileInSidebar(sidebarRight, path) {
  if (sidebarRight === undefined || sidebarRight === null || typeof sidebarRight.openResource !== 'function') return false
  const sessionId = sidebarRight.mounted?.getSnapshot?.()
  if (sessionId === undefined || sessionId === null || sessionId === '') return false
  try {
    sidebarRight.openResource(configFileAddress(sessionId, path))
    return true
  } catch {
    return false
  }
}
