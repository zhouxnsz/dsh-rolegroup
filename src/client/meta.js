// dsh-rolegroup client —— 插件元信息（设置页头部展示用：名称旁的版本号 + GitHub 入口）。
// 版本号的唯一真源 = package.json：scripts/build-client.mjs 在构建时经 esbuild `define` 把
// package.json 的 version 注入为字面量 `__ROLEGROUP_VERSION__`（浏览器 bundle 读不到 package.json）。
// node 直跑源码（smoke suite 会 import 本模块）时该标识不存在——所以这里必须用 `typeof` 守卫，
// 不得直接引用裸标识，否则 node 侧会 ReferenceError（client 源必须保持 node 可导入，见 v0.4 契约）。
// @module dsh-rolegroup/client-meta

/** 当前插件版本（如 "0.6.0"）；未经构建直接跑源码时回落 "dev"。 */
export const PLUGIN_VERSION = typeof __ROLEGROUP_VERSION__ === 'string' ? __ROLEGROUP_VERSION__ : 'dev'

/** 仓库地址：与 package.json 的 repository 一致（smoke suite 有一致性断言锁着），供头部 GitHub 链接使用。 */
export const PLUGIN_REPO_URL = 'https://github.com/zhouxnsz/dsh-rolegroup'
