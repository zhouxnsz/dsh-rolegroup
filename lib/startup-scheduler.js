/**
 * 防抖 + 最大等待上限的剪枝调度器。零宿主框架依赖，全部时钟/定时器可注入。
 * @param {{
 *   setTimeoutFn?: typeof setTimeout,   // 缺省全局 setTimeout
 *   clearTimeoutFn?: typeof clearTimeout, // 缺省全局 clearTimeout
 *   now?: () => number,                 // 缺省取当前时刻（ms 时间戳）
 *   debounceMs?: number,                // 缺省 3000
 *   maxWaitMs?: number,                 // 缺省 10000
 *   onError?: (e: unknown) => void,     // run 同步抛错/rejected 时的兜底上报，缺省 no-op
 *   run: () => void | Promise<void>,    // 到期回调（本仓库为 prune）
 * }} opts
 * @returns {{ schedule(): void, cancel(): void, state: SchedulerState }}
 *
 * @typedef {object} SchedulerState
 * @property {boolean} scheduled   有未触发的 pending 定时器
 * @property {boolean} ran         run 已被触发过（一次性语义）
 * @property {number | null} deadlineAt  本轮最大等待截止时间戳；cancel 后归 null
 */
export function createPruneScheduler({
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  now = Date.now,
  debounceMs = 3000,
  maxWaitMs = 10000,
  onError = () => {},
  run,
}) {
  /** @type {SchedulerState} */
  const state = { scheduled: false, ran: false, deadlineAt: null }
  let handle = null

  function fire() {
    handle = null
    state.scheduled = false
    state.ran = true
    // T5 受保护执行：run 内未覆盖的抛点（同步抛错 / rejected promise）一律上报 onError，
    // 不得冒泡成 unhandled rejection（Node ≥15 默认致命退出）。不 await，state 语义不变。
    try {
      const p = run()
      if (p && typeof p.then === 'function') p.catch(onError)
    } catch (e) { onError(e) }
  }

  function schedule() {
    if (state.ran) return // 一次性：prune 只跑一轮
    if (state.deadlineAt === null) state.deadlineAt = now() + maxWaitMs
    if (handle !== null) {
      clearTimeoutFn(handle)
      handle = null
    }
    const delay = Math.max(0, Math.min(debounceMs, state.deadlineAt - now()))
    handle = setTimeoutFn(fire, delay)
    handle?.unref?.()
    state.scheduled = true
  }

  function cancel() {
    if (handle !== null) {
      clearTimeoutFn(handle)
      handle = null
    }
    state.scheduled = false
    state.deadlineAt = null // 重新 schedule 起新一轮窗口；不重置 ran
  }

  return { schedule, cancel, state }
}
