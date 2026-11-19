// dsh-rolegroup: 设置页导航图标（官方 `settings.section.icon` 槽位版）。
//
// 历史：0.2.2-rc.5 之前 shell 只按 section id 硬编码 navIcon、未知 id 一律齿轮，本模块曾是
// 「给按钮打自定义 data 属性 + scoped CSS mask」的装饰 hack（旧版见 git 历史）。
// rc.5 起上游提供 `settings.section.icon` 槽位（contract/slots.d.ts:85；registration id 必须
// 等于目标 section 的 id，不匹配则永不渲染；缺席时 shell 保留默认齿轮），故改为正式注册。
//
// 纯函数约束：本文件不得触碰 DOM（document/window/observer 一类）——node 测试直接 import。

/** rolegroup 线稿（与插件 icon.svg 同款六边形+委派点），16×16 viewBox。 */
export const NAV_GLYPH_PATHS = [
  'M8 1.7 13.4 4.8v6.4L8 14.3 2.6 11.2V4.8Z',
  'M8 6.4V4.7M6.7 8.7 5.3 9.5M9.3 8.7 10.7 9.5',
]
export const NAV_GLYPH_CIRCLE = { cx: 8, cy: 8, r: 1.35 }

/**
 * 构建导航图标节点（喂给 slots.register 的组件）。
 * @param {{ size?: number }} [props] shell 传入的 owner props（size = 请求的方形边长 px）
 * @returns {{ tag: string, props: object, children: object[] }} 可序列化的图标描述（JSX-free，node 可测）
 */
export function buildNavGlyph(props = {}) {
  const size = typeof props.size === 'number' && props.size > 0 ? props.size : 16
  return {
    tag: 'svg',
    props: {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinejoin: 'round',
      strokeLinecap: 'round',
      'aria-hidden': 'true',
    },
    children: [
      { tag: 'path', props: { d: NAV_GLYPH_PATHS[0] } },
      { tag: 'circle', props: { ...NAV_GLYPH_CIRCLE, fill: 'currentColor', stroke: 'none' } },
      { tag: 'path', props: { d: NAV_GLYPH_PATHS[1] } },
    ],
  }
}

/**
 * 把图标描述渲染成真 React 节点（仅在浏览器侧调用；node 测试不触发）。
 * @param {object} React globalThis.React（client 注入环境必有）
 * @param {ReturnType<typeof buildNavGlyph>} glyph
 */
export function renderNavGlyph(React, glyph) {
  return React.createElement(glyph.tag, glyph.props,
    ...glyph.children.map((c) => React.createElement(c.tag, c.props)))
}
