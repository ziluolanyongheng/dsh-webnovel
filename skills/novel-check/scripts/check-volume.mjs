#!/usr/bin/env node
// 写完一卷（或跨章抽查）：逐章数字表、跨章反复出现的句子、重复台词、开头章尾撞车。
//
//   node check-volume.mjs <章节文件夹> [--from 41] [--to 80] [--n 6] [--chapters 3]
//
// --n 多少字算重复（默认 6）；--chapters 出现在几章以上才报（默认 3）。
// --from/--to 按章节在自然序里的位置取，从 1 数。
// 地名人名也会被报出来，所以只有 8 字以上或出现 5 章以上的句子、三章以上的同一句台词才算不通过。
// 退出码：0 通过，1 有问题，2 用法错误。
import { join, resolve } from 'node:path'
import {
  bodyLines, compact, countChars, dropContained, grams, listChapters, parseArgs,
  quotes, readText, shortQuotes, spans,
} from './lib.mjs'

const DEFAULTS = { from: 1, to: 0, n: 6, chapters: 3, json: false }
const DIALOGUE_MAX = 0.25
const SHORT_MAX = 2
const MIN_LINE = 4
const SERIOUS_LENGTH = 8
const SERIOUS_CHAPTERS = 5
const SERIOUS_LINE_CHAPTERS = 3

export function checkVolume(folder, options = {}) {
  const opts = { ...DEFAULTS, ...options }
  const root = resolve(folder)
  const files = listChapters(root).slice(opts.from - 1, opts.to || undefined)
  const chapters = files.map((file) => {
    const lines = bodyLines(readText(join(root, file)))
    const said = quotes(lines)
    const bare = countChars(lines)
    return {
      file, lines, said,
      words: lines.reduce((sum, ln) => sum + ln.length, 0),
      dialogueRatio: bare ? said.reduce((sum, q) => sum + compact(q).length, 0) / bare : 0,
      shorts: shortQuotes(lines).length,
      opening: (lines[0] ?? '').slice(0, 16),
      ending: (lines.at(-1) ?? '').slice(-16),
      endsOnDialogue: /[”」』"]$/.test(lines.at(-1) ?? ''),
      text: compact(lines.join('')),
    }
  })

  // 跨章重复：同一段话出现在 chapters 章以上
  const seenIn = new Map()
  chapters.forEach((ch, index) => {
    for (const g of new Set(grams(ch.text, opts.n))) {
      const list = seenIn.get(g)
      if (list) list.push(index)
      else seenIn.set(g, [index])
    }
  })
  const segments = new Map()
  for (const ch of chapters) {
    const hit = grams(ch.text, opts.n).map((g) => seenIn.get(g).length >= opts.chapters)
    for (const [start, len] of spans(hit, opts.n)) {
      const text = ch.text.slice(start, start + len)
      const where = chapters.filter((c) => c.text.includes(text)).map((c) => c.file)
      if (where.length >= opts.chapters) segments.set(text, where)
    }
  }
  const repeatedSegments = dropContained([...segments], ([text]) => text)
    .map(([text, where]) => ({ text, where }))
    .sort((a, b) => b.where.length - a.where.length || b.text.length - a.text.length)

  // 重复台词：一字不差的同一句话出现在两章以上
  const lineMap = new Map()
  for (const ch of chapters) {
    for (const q of new Set(ch.said.map(compact))) {
      if (q.length < MIN_LINE) continue
      lineMap.set(q, [...(lineMap.get(q) ?? []), ch.file])
    }
  }
  const repeatedLines = [...lineMap].filter(([, where]) => where.length >= 2)
    .map(([text, where]) => ({ text, where }))
    .sort((a, b) => b.where.length - a.where.length)

  // 开头撞车：连续两章开头前四字相同
  const openingClashes = []
  for (let i = 1; i < chapters.length; i++) {
    const [a, b] = [chapters[i - 1], chapters[i]]
    if (compact(a.opening).slice(0, 4) && compact(a.opening).slice(0, 4) === compact(b.opening).slice(0, 4)) openingClashes.push([a.file, b.file])
  }

  const dialogueOver = chapters.filter((c) => c.dialogueRatio > DIALOGUE_MAX).map((c) => c.file)
  const shortOver = chapters.filter((c) => c.shorts > SHORT_MAX).map((c) => c.file)
  const endsOnDialogue = chapters.filter((c) => c.endsOnDialogue).map((c) => c.file)
  const seriousSegments = repeatedSegments.filter((x) => x.text.length >= SERIOUS_LENGTH || x.where.length >= SERIOUS_CHAPTERS)
  const seriousLines = repeatedLines.filter((x) => x.where.length >= SERIOUS_LINE_CHAPTERS)
  const pass = seriousSegments.length === 0 && seriousLines.length === 0
    && openingClashes.length === 0 && dialogueOver.length === 0

  return {
    chapters: chapters.map(({ lines, said, text, ...row }) => row),
    repeatedSegments, seriousSegments, repeatedLines, seriousLines, openingClashes,
    dialogueOver, shortOver, endsOnDialogue, pass, opts,
  }
}

function report(r) {
  console.log('章节 | 字数 | 对话 | 短句 | 开头 | 章尾')
  for (const c of r.chapters) {
    console.log(`${c.file} | ${c.words} | ${(c.dialogueRatio * 100).toFixed(0)}% | ${c.shorts} | ${c.opening} | ${c.ending}`)
  }
  console.log(`\n出现在 ${r.opts.chapters} 章以上的 ${r.opts.n} 字以上句子: ${r.repeatedSegments.length} 处，其中要改的 ${r.seriousSegments.length} 处（排在前面）`)
  const others = r.repeatedSegments.filter((x) => !r.seriousSegments.includes(x))
  for (const x of [...r.seriousSegments, ...others].slice(0, 60)) console.log(`  ×${x.where.length} ${x.text}   ← ${x.where.join(', ')}`)
  console.log(`\n跨章一字不差的台词: ${r.repeatedLines.length} 句，其中三章以上 ${r.seriousLines.length} 句`)
  for (const x of r.repeatedLines.slice(0, 40)) console.log(`  ×${x.where.length} “${x.text}”   ← ${x.where.join(', ')}`)
  console.log(`\n连续两章开头撞车: ${r.openingClashes.length} 处`)
  for (const [a, b] of r.openingClashes) console.log(`  ${a} / ${b}`)
  console.log(`\n对话超两成半: ${r.dialogueOver.join(', ') || '无'}`)
  console.log(`极短台词偏多（逐句看是不是哑谜）: ${r.shortOver.join(', ') || '无'}`)
  console.log(`以台词收尾 ${r.endsOnDialogue.length}/${r.chapters.length} 章`)
  console.log(`\n结论: ${r.pass ? '通过' : '有问题，逐条改完再跑一遍'}`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const { opts, rest } = parseArgs(process.argv.slice(2), DEFAULTS)
    if (rest.length !== 1) throw new Error('用法: check-volume.mjs <章节文件夹> [选项]')
    const result = checkVolume(rest[0], opts)
    if (opts.json) console.log(JSON.stringify({ ...result, opts: undefined }, null, 2))
    else report(result)
    process.exitCode = result.pass ? 0 : 1
  } catch (err) {
    console.error(err.message)
    process.exitCode = 2
  }
}
