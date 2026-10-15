#!/usr/bin/env node
// plans/v0.3-gui-panel.md §2.6 / §4 T3：esbuild 把 src/client/ 打成 lib/client.js，
// banner/footer 注入 window.__ModuleLoader__.load wrapper——形状与官方产物（§0.2 C3，
// $NM/dsh-client-ui-settings-plugins/lib/client.js 头部/尾部）逐字同构。
// react / react/jsx-runtime / @deepseek-ai/dsh-client-ui-slots 由 shell seed 解析（C3），
// 必须保持 external，不得进 bundle。
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))

await build({
  entryPoints: [join(root, 'src/client/index.js')],
  outfile: join(root, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  jsx: 'automatic',
  platform: 'browser',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-slots'],
  banner: {
    js: 'window.__ModuleLoader__.load({\n\tid: "dsh-rolegroup",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;',
  },
  footer: {
    js: '\t\treturn module.exports;\n\t}\n});',
  },
  logLevel: 'info',
})

console.log('[build-client] wrote lib/client.js')
