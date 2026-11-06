// Best-effort decoration for the Settings sidebar entry.
//
// The settings shell renders one nav button per `settings.section` entry but
// picks its glyph from a hardcoded id map; unknown ids (ours) get the gear and
// `settings.section` exposes no icon option. To show the rolegroup mark there we
// tag only our own button and swap the glyph through scoped CSS, without
// touching React's child list. If the shell structure or mask support changes,
// the decoration does nothing and the default gear remains.

const NAV_GLYPH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.7 13.4 4.8v6.4L8 14.3 2.6 11.2V4.8Z" fill="none" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.35" fill="#000"/><path d="M8 6.4V4.7M6.7 8.7 5.3 9.5M9.3 8.7 10.7 9.5" stroke="#000" stroke-width="1.2" stroke-linecap="round"/></svg>'
const NAV_GLYPH_URI = `data:image/svg+xml,${encodeURIComponent(NAV_GLYPH)}`

export const NAV_ICON_CSS = `@supports ((mask-image: linear-gradient(#000, #000)) or (-webkit-mask-image: linear-gradient(#000, #000))) {
button[data-dsh-rg-nav] > svg { display: none !important; }
button[data-dsh-rg-nav]::before { content: ""; width: 16px; height: 16px; flex: none; display: inline-block; background-color: currentColor; -webkit-mask: url("${NAV_GLYPH_URI}") center / 16px 16px no-repeat; mask: url("${NAV_GLYPH_URI}") center / 16px 16px no-repeat; }
}`

/**
 * Tag the settings nav button whose visible label matches.
 * @param {Iterable<{ textContent?: string, dataset?: DOMStringMap, firstElementChild?: Element, setAttribute?: Function }>} buttons
 * @param {string} label
 * @returns {object | undefined} the tagged button
 */
export function markSettingsNavButton(buttons, label) {
  const wanted = String(label ?? '').trim()
  if (wanted === '') return undefined
  for (const button of buttons ?? []) {
    if (button?.dataset?.dshRgNav !== undefined) return button
    if (String(button?.textContent ?? '').trim() !== wanted) continue
    if (String(button?.firstElementChild?.tagName ?? '').toLowerCase() !== 'svg') continue
    if (button.dataset !== undefined) button.dataset.dshRgNav = ''
    else button.setAttribute?.('data-dsh-rg-nav', '')
    return button
  }
  return undefined
}

/**
 * Watch the document for the settings nav button and apply the scoped glyph.
 * @param {() => string} labelOf current localized section label
 * @param {{ document?: Document, MutationObserver?: typeof MutationObserver, requestAnimationFrame?: Function }} [options]
 * @returns {() => void} cleanup
 */
export function installSettingsNavIcon(labelOf, options = {}) {
  const doc = options.document ?? (typeof document === 'undefined' ? undefined : document)
  if (doc === undefined || doc === null || doc.body === undefined || doc.body === null) return () => {}
  const root = doc.head ?? doc.documentElement
  if (typeof root?.append !== 'function') return () => {}
  const style = doc.createElement('style')
  style.setAttribute('data-dsh-rg-nav-style', '')
  style.textContent = NAV_ICON_CSS
  try {
    root.append(style)
  } catch {
    return () => {}
  }
  const Observer = options.MutationObserver ?? globalThis.MutationObserver
  const raf = options.requestAnimationFrame ?? globalThis.requestAnimationFrame
  let scheduled = false
  let disposed = false
  const apply = () => {
    scheduled = false
    if (disposed) return
    try {
      markSettingsNavButton(doc.querySelectorAll?.('button') ?? [], labelOf?.())
    } catch {
      // Decoration only; never let it affect the settings page.
    }
  }
  const schedule = () => {
    if (scheduled || disposed) return
    scheduled = true
    if (typeof raf === 'function') raf(apply)
    else Promise.resolve().then(apply)
  }
  let observer
  if (typeof Observer === 'function') {
    try {
      observer = new Observer(schedule)
      observer.observe(doc.body, { childList: true, subtree: true })
    } catch {
      observer = undefined
    }
  }
  apply()
  return () => {
    disposed = true
    observer?.disconnect?.()
    style.remove?.()
    for (const button of doc.querySelectorAll?.('[data-dsh-rg-nav]') ?? []) button.removeAttribute?.('data-dsh-rg-nav')
  }
}
