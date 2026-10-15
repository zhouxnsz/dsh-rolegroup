// dsh-rolegroup: 极简 JSONC 解析（去注释、去尾逗号）。
// 只支持标准 JSON + `//` 行注释 + `/* */` 块注释 + 尾逗号，不支持单引号/无引号键。
// @module dsh-rolegroup/jsonc

/** Strip `//` and `/* *\/` comments, preserving string literals. */
export function stripComments(text) {
  let out = ''
  let i = 0
  let inString = false
  while (i < text.length) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (ch === '\\') { out += text[i + 1] ?? ''; i += 2; continue }
      if (ch === '"') inString = false
      i += 1
      continue
    }
    if (ch === '"') { inString = true; out += ch; i += 1; continue }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += ch
    i += 1
  }
  return out
}

/** Remove trailing commas before `}` or `]`, preserving string literals. */
export function stripTrailingCommas(text) {
  let out = ''
  let i = 0
  let inString = false
  while (i < text.length) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (ch === '\\') { out += text[i + 1] ?? ''; i += 2; continue }
      if (ch === '"') inString = false
      i += 1
      continue
    }
    if (ch === '"') { inString = true; out += ch; i += 1; continue }
    if (ch === ',') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j += 1
      if (text[j] === '}' || text[j] === ']') { i += 1; continue }
    }
    out += ch
    i += 1
  }
  return out
}

/** Parse JSONC text; throws SyntaxError with the original message on failure. */
export function parseJsonc(text) {
  return JSON.parse(stripTrailingCommas(stripComments(text)))
}
