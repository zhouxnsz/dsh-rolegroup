// dsh-rolegroup: 把「需要静态裸导入的部署树包」软链进本仓库的 node_modules。
//
// 背景（docs/dsh-0.1.7-upgrade-impact.md §5 / plans/v0.4-settings-migration.md T1）：
//   - 本插件以 link: 形态安装（真实路径即本仓库），Node 按 realpath 解析 ⇒ **裸导入 @deepseek-ai/* 必失败**（坑 #1）；
//   - 但 dsh 0.1.7 的 settings 范式要求 Loader 条目**静态导出**一个 schemastery `Config`
//     （`dsh-settings` 读 `entry.fiber.runtime.Config`，且要求 `"toJSON" in schema`），
//     静态导出意味着不能在 apply 里用 loader 链延迟解析。
//   - 解法：在本仓库 node_modules/@deepseek-ai/ 下建软链指向**部署树的同一份包**。
//     同一 realpath ⇒ 与 dsh-settings 拿到**同一个模块实例**（避免两份 schemastery 导致内部形状不匹配）。
//
// 幂等；失败只 warn 不抛（退出码恒 0）——本脚本不该阻断 `npm test` 或安装流程。
// dsh 升级换了部署树后重跑本脚本即可（`npm run link:deps`）。

import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 需要裸导入的部署树包名（按需增补；当前仅 schemastery）。 */
const REQUIRED_DEPLOY_DEPS = ['schemastery']

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LINK_DIR = join(REPO_ROOT, 'node_modules', '@deepseek-ai')

function warn(message) {
  console.warn(`[link:deps] ${message}`)
}

/**
 * 判定一个目录是否像 dsh 的部署树 `@deepseek-ai/`：至少含一个待链接的包。
 * 注意：不能用「是否含 dsh 包」判定——dsh 自身的依赖是与它**并列**的兄弟目录，
 * `<dsh>/node_modules/@deepseek-ai/` 里**没有** `dsh`。
 * @param {string} dir 候选目录。
 * @returns {boolean} 是否可用。
 */
function looksLikeDeploymentNodeModules(dir) {
  return REQUIRED_DEPLOY_DEPS.some((dep) => existsSync(join(dir, dep, 'package.json')))
}

/**
 * 定位部署树的 `@deepseek-ai/` 目录（dsh 及其依赖的 node_modules）。
 * 顺序：① 环境变量覆盖 → ② PATH 上的 dsh 可执行文件反推。
 * @returns {string | undefined} 绝对路径，定位失败返回 undefined。
 */
function findDeploymentNodeModules() {
  const override = process.env.DSH_DEPLOY_NODE_MODULES
  if (override !== undefined && override.trim() !== '') {
    const path = resolve(override.trim())
    if (looksLikeDeploymentNodeModules(path)) return path
    warn(`DSH_DEPLOY_NODE_MODULES=${path} 下找不到 ${REQUIRED_DEPLOY_DEPS.join('/')}，忽略该覆盖`)
  }
  try {
    const which = execFileSync('which', ['dsh'], { encoding: 'utf8' }).trim()
    if (which !== '') {
      // <...>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js → <...>/lib/node_modules/@deepseek-ai/dsh
      const pkgRoot = dirname(dirname(realpathSync(which)))
      const nodeModules = join(pkgRoot, 'node_modules', '@deepseek-ai')
      if (looksLikeDeploymentNodeModules(nodeModules)) return nodeModules
      warn(`从 ${which} 推导出的 ${nodeModules} 里找不到 ${REQUIRED_DEPLOY_DEPS.join('/')}`)
    }
  } catch { /* 继续 */ }
  return undefined
}

/** @returns {string} 已链接包的版本，读不到返回 '?'。 */
function versionOf(packageDir) {
  try {
    return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))?.version ?? '?'
  } catch {
    return '?'
  }
}

function main() {
  const deploy = findDeploymentNodeModules()
  if (deploy === undefined) {
    warn('未能定位 dsh 部署树（PATH 上没有 dsh，且未设 DSH_DEPLOY_NODE_MODULES）。')
    warn('本插件的 host-only 能力不受影响；仅 v0.4 的 settings Config 会因缺少 schemastery 而加载失败。')
    warn('修复：装好 dsh 后重跑 `npm run link:deps`，或设置 DSH_DEPLOY_NODE_MODULES=<...>/@deepseek-ai')
    return
  }

  let created = 0
  for (const dep of REQUIRED_DEPLOY_DEPS) {
    const source = join(deploy, dep)
    if (!existsSync(join(source, 'package.json'))) {
      warn(`部署树缺少 ${dep}（${source}），跳过。`)
      continue
    }
    const target = join(LINK_DIR, dep)
    try {
      mkdirSync(LINK_DIR, { recursive: true })
      // 已存在：软链指向同一处 → 幂等跳过；真实目录（非软链）→ 不覆盖，只提示。
      const existing = lstatSync(target, { throwIfNoEntry: false })
      if (existing !== undefined) {
        if (!existing.isSymbolicLink()) {
          warn(`${target} 已存在且不是软链（可能是真实安装的副本），不覆盖。`)
          warn('若两份 schemastery 版本不一致，settings 表单可能行为异常；需要时请手工删除该目录后重跑。')
          continue
        }
        if (realpathSync(target) === realpathSync(source)) continue
        // 指向了别的部署树（dsh 升级过）：改指到当前部署树。
        rmSync(target)
      }
      symlinkSync(source, target, 'dir')
      created += 1
      console.log(`[link:deps] ${dep}@${versionOf(source)} → ${source}`)
    } catch (error) {
      warn(`链接 ${dep} 失败：${error?.message ?? error}`)
    }
  }
  console.log(created === 0
    ? `[link:deps] 无需改动（部署树 ${deploy}）`
    : `[link:deps] 已更新 ${created} 个链接（部署树 ${deploy}）`)
}

main()

// 供测试断言用；`node scripts/link-deployment-deps.mjs` 直接跑时无副作用。
export { findDeploymentNodeModules, REQUIRED_DEPLOY_DEPS }

// 读回一个已建链接的目标，便于排障（`node -e` 引用时用得上）。
export function linkedTarget(dep) {
  try {
    return readlinkSync(join(LINK_DIR, dep))
  } catch {
    return undefined
  }
}
