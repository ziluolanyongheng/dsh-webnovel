#!/usr/bin/env node
// 写完一章后查：字数、对话占比、哑谜短句、跟前几章重复、本章自己重复、跟原著重合、套话、段首重复。
//
//   node check-chapter.mjs <本章.md> [--prev 5] [--n 8] [--banned 黑名单.txt]
//                          [--source 原著文件或文件夹] [--source-n 12] [--min 2800] [--max 5500]
//
// 退出码：0 通过，1 有问题，2 用法错误。
import { basename, dirname, join, resolve } from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import {
  bodyLines, clicheHits, compact, countChars, dropContained, grams, listChapters,
  naturalCompare, parseArgs, quotes, readText, shortQuotes, spans,
} from './lib.mjs'

const DEFAULTS = { prev: 5, n: 8, banned: '', source: '', 'source-n': 12, min: 2800, max: 5500, json: false }
const DIALOGUE_MAX = 0.25
const REPEAT_MAX = 5
const SHORT_MAX = 2

/** 一个文件，或文件夹下全部 .md/.txt。 */
function sourceFiles(path) {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).filter((f) => /\.(md|txt)$/.test(f)).map((f) => join(path, f))
}

export function checkChapter(chapterPath, options = {}) {
  const opts = { ...DEFAULTS, ...options }
  const path = resolve(chapterPath)
  const folder = dirname(path)
  const name = basename(path)
  const lines = bodyLines(readText(path))
  const cur = compact(lines.join(''))
  const curGrams = grams(cur, opts.n)

  const words = lines.reduce((sum, ln) => sum + ln.length, 0)
  const bare = countChars(lines)
  const dialogueRatio = bare ? quotes(lines).reduce((sum, q) => sum + compact(q).length, 0) / bare : 0

  // 跟前几章重复
  const all = listChapters(folder).filter((f) => f !== name)
  const prev = all.filter((f) => naturalCompare(f, name) < 0).slice(-opts.prev)
  const owner = new Map()
  for (const f of prev) {
    const text = compact(bodyLines(readText(join(folder, f))).join(''))
    for (const g of grams(text, opts.n)) if (!owner.has(g)) owner.set(g, f)
  }
  const repeats = spans(curGrams.map((g) => owner.has(g)), opts.n)
    .map(([start, len]) => ({ text: cur.slice(start, start + len), length: len, from: owner.get(cur.slice(start, start + opts.n)) }))
    .sort((a, b) => b.length - a.length)

  // 本章自己重复
  const counts = new Map()
  for (const g of curGrams) counts.set(g, (counts.get(g) ?? 0) + 1)
  const selfSegments = spans(curGrams.map((g) => counts.get(g) > 1), opts.n).map(([start, len]) => cur.slice(start, start + len))
  const selfRepeats = dropContained(selfSegments)
    .map((text) => ({ text, count: Math.max(cur.split(text).length - 1, 2) }))

  // 跟原著重合（同人用，门槛比查重高，抓逐字搬运）
  const sourceOverlap = []
  if (opts.source) {
    const n = opts['source-n']
    const seen = new Set()
    for (const f of sourceFiles(resolve(opts.source))) {
      const text = compact(bodyLines(readText(f)).join(''))
      for (const g of grams(text, n)) seen.add(g)
    }
    for (const [start, len] of spans(grams(cur, n).map((g) => seen.has(g)), n)) {
      sourceOverlap.push({ text: cur.slice(start, start + len), length: len })
    }
    sourceOverlap.sort((a, b) => b.length - a.length)
  }

  const extra = opts.banned ? readText(resolve(opts.banned)).split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : []
  const cliches = clicheHits(lines, extra)
  const shorts = shortQuotes(lines)

  const heads = new Map()
  for (const ln of lines) if (ln.length > 10) heads.set(ln.slice(0, 2), (heads.get(ln.slice(0, 2)) ?? 0) + 1)
  const headRepeats = [...heads].filter(([, k]) => k >= Math.max(5, Math.floor(lines.length / 8)))
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([head, count]) => ({ head, count }))

  const pass = dialogueRatio <= DIALOGUE_MAX && repeats.length <= REPEAT_MAX && selfRepeats.length <= REPEAT_MAX
    && cliches.length === 0 && sourceOverlap.length === 0
  return { name, words, bare, dialogueRatio, prev, repeats, selfRepeats, sourceOverlap, cliches, shorts, headRepeats, pass, opts }
}

function report(r) {
  const { opts } = r
  const lengthNote = r.words < opts.min ? '   ← 偏短' : r.words > opts.max ? '   ← 偏长' : ''
  console.log(`== ${r.name} ==`)
  console.log(`字数: ${r.words}（不含标点 ${r.bare}）${lengthNote}`)
  console.log(`对话占比: ${(r.dialogueRatio * 100).toFixed(0)}%${r.dialogueRatio > DIALOGUE_MAX ? '   ← 超过两成半，改成描写往前推' : ''}`)
  console.log(`\n极短台词（一两个字）: ${r.shorts.length} 句${r.shorts.length > SHORT_MAX ? '   ← 逐句看是不是哑谜命令，是就把话说全' : ''}`)
  for (const q of r.shorts.slice(0, 12)) console.log(`  “${q}”`)
  console.log(`\n跟前 ${r.prev.length} 章（${r.prev.join(', ') || '无'}）重复 ${opts.n} 字以上: ${r.repeats.length} 处`)
  for (const x of r.repeats.slice(0, 40)) console.log(`  [${x.length}字] ${x.text}   ← 见 ${x.from}`)
  console.log(`\n本章内部重复 ${opts.n} 字以上: ${r.selfRepeats.length} 处`)
  for (const x of r.selfRepeats.slice(0, 30)) console.log(`  ×${x.count} ${x.text}`)
  if (opts.source) {
    console.log(`\n跟原著逐字重合 ${opts['source-n']} 字以上: ${r.sourceOverlap.length} 处${r.sourceOverlap.length ? '   ← 全部改写' : ''}`)
    for (const x of r.sourceOverlap.slice(0, 30)) console.log(`  [${x.length}字] ${x.text}`)
  }
  console.log(`\n套话命中: ${r.cliches.reduce((sum, x) => sum + x.count, 0)} 处`)
  for (const x of r.cliches) console.log(`  ×${x.count} ${x.word}${x.tier === 'limit' ? '（一章最多一次）' : ''}`)
  if (r.headRepeats.length) {
    console.log('\n段首重复（换着起）:')
    for (const x of r.headRepeats) console.log(`  ×${x.count} 「${x.head}…」`)
  }
  console.log(`\n结论: ${r.pass ? '通过' : '有问题，按上面逐条改完再跑一遍'}`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const { opts, rest } = parseArgs(process.argv.slice(2), DEFAULTS)
    if (rest.length !== 1) throw new Error('用法: check-chapter.mjs <本章.md> [选项]')
    const result = checkChapter(rest[0], opts)
    if (opts.json) console.log(JSON.stringify({ ...result, opts: undefined }, null, 2))
    else report(result)
    process.exitCode = result.pass ? 0 : 1
  } catch (err) {
    console.error(err.message)
    process.exitCode = 2
  }
}
