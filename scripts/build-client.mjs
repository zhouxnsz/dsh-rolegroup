#!/usr/bin/env node
// plans/v0.3-gui-panel.md §2.6 / §4 T3：esbuild 把 src/client/ 打成 lib/client.js，
// banner/footer 注入 window.__ModuleLoader__.load wrapper——形状与官方产物（§0.2 C3，
// $NM/dsh-client-ui-settings-plugins/lib/client.js 头部/尾部）逐字同构。
// react / react/jsx-runtime / @deepseek-ai/dsh-client-ui-slots 由 shell seed 解析（C3），
// 必须保持 external，不得进 bundle。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// esbuild 是 devDependency：缺了要给可执行的提示，而不是把 Node 的
// ERR_MODULE_NOT_FOUND 堆栈（含 Buffer dump）直接甩给用户。
let build
try {
  ({ build } = await import('esbuild'))
} catch (error) {
  console.error('[build-client] 缺少 esbuild（devDependency）。请先在本仓库跑 `npm install`，然后重试。')
  console.error(`[build-client] ${error?.message ?? error}`)
  process.exit(1)
}

const root = fileURLToPath(new URL('..', import.meta.url))
// 设置页头部展示的版本号：唯一真源是 package.json。浏览器侧读不到包文件，
// 故在构建期把 version 作为字面量注入（src/client/meta.js 消费 `__ROLEGROUP_VERSION__`）。
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

await build({
  entryPoints: [join(root, 'src/client/index.js')],
  outfile: join(root, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  jsx: 'automatic',
  platform: 'browser',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-slots'],
  define: {
    __ROLEGROUP_VERSION__: JSON.stringify(version),
  },
  banner: {
    js: 'window.__ModuleLoader__.load({\n\tid: "dsh-rolegroup",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;',
  },
  footer: {
    js: '\t\treturn module.exports;\n\t}\n});',
  },
  logLevel: 'info',
})

console.log('[build-client] wrote lib/client.js')
