#!/usr/bin/env node
// 起名前查：名字在全部书稿里用过没有、是不是烂大街、有没有生僻字。
//
//   node check-names.mjs <书稿根目录> <名字> [名字...]
//
// 退出码：0 都能用，1 有名字不能用，2 用法错误。
import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { readText } from './lib.mjs'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build'])
const OVERUSED = new Set([
  '叶凡', '叶辰', '叶尘', '林凡', '林风', '林动', '林逸', '陈凡', '萧凡', '楚风', '秦风', '江辰', '唐辰',
  '苏晴', '苏雪', '苏瑶', '苏清雪', '苏婉', '林婉儿', '林清雪', '柳如烟', '沈清秋', '慕容雪', '上官婉儿', '夏雪',
])
const RARE_CHARS = /[燮邛玦蕤谶彧翊珩]/

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* markdownFiles(join(dir, entry.name))
    } else if (/\.(md|txt)$/.test(entry.name)) {
      yield join(dir, entry.name)
    }
  }
}

export function checkNames(root, names) {
  const base = resolve(root)
  const used = new Map(names.map((name) => [name, new Map()]))
  for (const file of markdownFiles(base)) {
    const text = readText(file)
    for (const name of names) {
      const count = text.split(name).length - 1
      if (count) used.get(name).set(relative(base, file), count)
    }
  }
  return names.map((name) => {
    const problems = []
    if (OVERUSED.has(name)) problems.push('网文烂大街')
    if (RARE_CHARS.test(name)) problems.push('生僻字')
    const files = [...used.get(name)]
    if (files.length) problems.push(`已用过（${files.length} 个文件）`)
    return { name, problems, files }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [root, ...names] = process.argv.slice(2)
  if (!root || names.length === 0) {
    console.error('用法: check-names.mjs <书稿根目录> <名字> [名字...]')
    process.exitCode = 2
  } else {
    const results = checkNames(root, names)
    for (const r of results) {
      console.log(`${r.name}: ${r.problems.join('、') || '可用'}`)
      for (const [file, count] of r.files.slice(0, 5)) console.log(`  ×${count} ${file}`)
    }
    process.exitCode = results.some((r) => r.problems.length) ? 1 : 0
  }
}
