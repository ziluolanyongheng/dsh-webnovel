// 查重脚本共用的文本处理。零依赖，Node 22+。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PUNCT = new Set('，。！？、；：“”‘’「」『』（）《》〈〉…—·,.!?;:\'"()[]-*#> \n\r\t　'.split(''))

/** 一章不许出现的 AI 套话。书里自己的词用 --banned 加。 */
export const BANNED = [
  '嘴角勾起', '勾起一抹', '一抹弧度', '眸中闪过', '眼中闪过一丝', '闪过一丝',
  '倒吸一口凉气', '倒吸了一口凉气', '空气仿佛凝固', '空气都凝固', '时间仿佛静止',
  '心中一凛', '心头一震', '不由得', '不禁', '仿佛在诉说', '眼底深处',
  '一字一顿', '似笑非笑', '意味深长', '嘴角微微上扬', '微微一笑',
  '声音不大，却', '不容置疑', '毋庸置疑', '缓缓开口', '淡淡开口', '淡淡道',
  '这一刻', '那一刻', '下一秒', '与此同时', '某种意义上',
  '不是……而是', '不是因为', '没有说话', '沉默了片刻', '沉默片刻',
]

/** 万能句：一章最多一次。 */
export const LIMITED = [
  '看了很久', '亮得吓人', '脸红得要滴血', '一点表情都没有', '一个字都说不出来',
  '心跳漏了一拍', '小鹿乱撞', '耳根红透', '白得发光', '如玉雕成', '呼吸一滞',
  '眸色一深', '喉结滚动', '哑着嗓子', '磁性的嗓音', '一阵酥麻', '电流窜过',
  '嘤咛', '浑身发软', '口干舌燥', '受惊的小兔子',
]

/** 自然序比较：第2章排在第10章前面。 */
export const naturalCompare = (a, b) => a.localeCompare(b, 'zh', { numeric: true })

/** 文件夹里带数字的 .md，按自然序。 */
export function listChapters(folder) {
  return readdirSync(folder)
    .filter((f) => f.endsWith('.md') && /\d/.test(f) && statSync(join(folder, f)).isFile())
    .sort(naturalCompare)
}

export function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '')
}

/** 正文行：去掉空行、标题和插图。 */
export function bodyLines(raw) {
  return raw.split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#') && !s.startsWith('!['))
}

export const compact = (s) => [...s].filter((ch) => !PUNCT.has(ch)).join('')

export const countChars = (lines) => lines.reduce((sum, ln) => sum + compact(ln).length, 0)

/** 引号里的话，每句一项。 */
export function quotes(lines) {
  const out = []
  for (const ln of lines) {
    for (const m of ln.matchAll(/[“「『]([^”」』]*)[”」』]|"([^"]*)"/g)) out.push(m[1] ?? m[2])
  }
  return out
}

export const grams = (s, n) => {
  const out = []
  for (let i = 0; i + n <= s.length; i++) out.push(s.slice(i, i + n))
  return out
}

/** 把连续命中的 n-gram 合成一段，返回 [起点, 长度]。 */
export function spans(hit, n) {
  const out = []
  for (let i = 0; i < hit.length; i++) {
    if (!hit[i]) continue
    let j = i
    while (j + 1 < hit.length && hit[j + 1]) j++
    out.push([i, j - i + n])
    i = j
  }
  return out
}

/** 按长度从长到短去掉被长段包含的短段。 */
export function dropContained(items, key = (x) => x) {
  const kept = []
  for (const item of [...items].sort((a, b) => key(b).length - key(a).length)) {
    if (!kept.some((k) => key(k).includes(key(item)))) kept.push(item)
  }
  return kept
}

/** 套话命中：tier='ban' 出现就算，tier='limit' 超过一次才算。 */
export function clicheHits(lines, extra = []) {
  const text = lines.join('')
  const hits = []
  for (const word of [...BANNED, ...extra]) {
    const parts = word.split('……')
    const count = parts.length > 1
      ? lines.reduce((sum, ln) => sum + (ln.match(new RegExp(parts.map(escapeRegExp).join('.{0,30}?'), 'g')) ?? []).length, 0)
      : text.split(word).length - 1
    if (count) hits.push({ word, count, tier: 'ban' })
  }
  for (const word of LIMITED) {
    const count = text.split(word).length - 1
    if (count > 1) hits.push({ word, count, tier: 'limit' })
  }
  return hits.sort((a, b) => b.count - a.count)
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 极短台词（可能是哑谜命令）：不含标点只有一两个字。 */
export const shortQuotes = (lines, min = 3) => quotes(lines).filter((q) => {
  const len = compact(q).length
  return len > 0 && len < min
})

/** 解析 --key value 形式的参数。 */
export function parseArgs(argv, spec) {
  const opts = { ...spec }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { rest.push(arg); continue }
    const key = arg.slice(2)
    if (!(key in spec)) throw new Error(`未知参数 ${arg}`)
    if (typeof spec[key] === 'boolean') { opts[key] = true; continue }
    const value = argv[++i]
    if (value === undefined) throw new Error(`${arg} 后面要跟一个值`)
    opts[key] = typeof spec[key] === 'number' ? Number(value) : value
  }
  return { opts, rest }
}
