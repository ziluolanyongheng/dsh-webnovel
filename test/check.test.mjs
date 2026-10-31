import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { checkChapter } from '../skills/novel-check/scripts/check-chapter.mjs'
import { checkNames } from '../skills/novel-check/scripts/check-names.mjs'
import { checkVolume } from '../skills/novel-check/scripts/check-volume.mjs'
import { bodyLines, clicheHits, naturalCompare, quotes, spans } from '../skills/novel-check/scripts/lib.mjs'

const root = mkdtempSync(join(tmpdir(), 'webnovel-'))
after(() => rmSync(root, { recursive: true, force: true }))

const folder = (name, files) => {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text)
  return dir
}

const REPEATED = '城外的河水在三更时分忽然倒着往上游流去'
const filler = (seed) => Array.from({ length: 40 }, (_, i) => `${seed}第${i}段走过的路都不一样${i * 7}号。`).join('\n')

test('naturalCompare 把第2章排在第10章前面', () => {
  assert.deepEqual(['第10章.md', '第2章.md', '第1章.md'].sort(naturalCompare), ['第1章.md', '第2章.md', '第10章.md'])
})

test('bodyLines 去掉标题、插图和空行，兼容 CRLF', () => {
  assert.deepEqual(bodyLines('# 书名\r\n\r\n![图](a.png)\r\n正文一\r\n## 第一章\r\n正文二'), ['正文一', '正文二'])
})

test('quotes 认中文引号、直角引号和英文引号', () => {
  assert.deepEqual(quotes(['他说：“走吧。”她说「好」，又说"再等等"。']), ['走吧。', '好', '再等等'])
})

test('spans 合并连续命中', () => {
  assert.deepEqual(spans([false, true, true, false, true], 3), [[1, 4], [4, 3]])
})

test('clicheHits 分禁用和限次，并支持省略号模式', () => {
  const hits = clicheHits(['他不是怕你，而是累了。', '她看了很久。', '她又看了很久。', '她嘴角勾起。'])
  assert.equal(hits.find((h) => h.word === '嘴角勾起').tier, 'ban')
  assert.equal(hits.find((h) => h.word === '看了很久').count, 2)
  assert.ok(hits.find((h) => h.word === '不是……而是'))
  assert.equal(clicheHits(['她看了很久。']).length, 0)
})

test('checkChapter 查出跟前一章的重复，并且只跟前面的章比', () => {
  const dir = folder('chapter', {
    '第1章.md': `# 第一章\n${filler('甲')}\n${REPEATED}。`,
    '第2章.md': `# 第二章\n${filler('乙')}\n${REPEATED}。`,
    '第3章.md': `# 第三章\n${filler('丙')}`,
  })
  const r = checkChapter(join(dir, '第2章.md'))
  assert.deepEqual(r.prev, ['第1章.md'])
  assert.ok(r.repeats.some((x) => x.text.includes(REPEATED)))
  assert.equal(checkChapter(join(dir, '第1章.md')).prev.length, 0)
})

test('checkChapter 算对话占比，超标不通过', () => {
  const dir = folder('dialogue', { '1.md': '他说：“今天晚上我们从北门出城去码头。”\n她点头。' })
  const r = checkChapter(join(dir, '1.md'))
  assert.ok(r.dialogueRatio > 0.25)
  assert.equal(r.pass, false)
})

test('checkChapter 报出一两个字的短句，但只提示不判失败', () => {
  const dir = folder('short', { '1.md': `${filler('丁')}\n“过来。”\n“坐。”\n“说。”\n“喝。”` })
  const r = checkChapter(join(dir, '1.md'), { n: 30 })
  assert.equal(r.shorts.length, 4)
  assert.equal(r.pass, true)
})

test('checkChapter 用 --source 查出跟原著逐字重合', () => {
  const dir = folder('source', {
    '1.md': `${filler('戊')}\n${REPEATED}。`,
    '原著.txt': `前文。${REPEATED}。后文。`,
  })
  const r = checkChapter(join(dir, '1.md'), { source: join(dir, '原著.txt') })
  assert.equal(r.sourceOverlap.length, 1)
  assert.equal(r.pass, false)
  assert.equal(checkChapter(join(dir, '1.md')).sourceOverlap.length, 0)
})

test('干净的章节通过', () => {
  const dir = folder('clean', { '1.md': filler('己') })
  const r = checkChapter(join(dir, '1.md'), { n: 30 })
  assert.equal(r.pass, true)
})

test('checkVolume 查出跨三章的句子、重复台词和开头撞车', () => {
  const dir = folder('volume', {
    '第1章.md': `清晨的雾还没散。\n${filler('庚')}\n${REPEATED}。\n“这笔账我记下了”`,
    '第2章.md': `清晨的雾更重了。\n${filler('辛')}\n${REPEATED}。\n“这笔账我记下了”`,
    '第3章.md': `午后下了一场雨。\n${filler('壬')}\n${REPEATED}。`,
  })
  const r = checkVolume(dir)
  assert.ok(r.repeatedSegments.some((x) => x.text.includes(REPEATED) && x.where.length === 3))
  assert.ok(r.repeatedLines.some((x) => x.text === '这笔账我记下了' && x.where.length === 2))
  assert.deepEqual(r.openingClashes, [['第1章.md', '第2章.md']])
  assert.equal(r.endsOnDialogue.length, 2)
  assert.equal(r.pass, false)
})

test('checkVolume 只报够章数的句子，--from --to 按位置取', () => {
  const dir = folder('range', {
    '1.md': `${REPEATED}。`, '2.md': `${REPEATED}。`, '3.md': '另一件事情完全不同的内容。',
  })
  assert.equal(checkVolume(dir).repeatedSegments.length, 0)
  assert.equal(checkVolume(dir, { chapters: 2 }).repeatedSegments.length, 1)
  assert.equal(checkVolume(dir, { from: 2, to: 3 }).chapters.length, 2)
})

test('checkVolume 里短句段和两章台词只提示，三章台词才判失败', () => {
  const scenes = [['清晨', '敲锣'], ['正午', '吹号'], ['半夜', '点火']]
  const short = folder('short-seg', Object.fromEntries(scenes.map(([when, what], i) => [`${i + 1}.md`, `${when}外关的墙头上${what}。`])))
  const shortResult = checkVolume(short)
  assert.equal(shortResult.repeatedSegments.length, 1)
  assert.equal(shortResult.seriousSegments.length, 0)
  assert.equal(shortResult.pass, true)

  const lines = folder('line-3', Object.fromEntries([1, 2, 3].map((i) => [`${i}.md`, `这是第${i}回的事情。\n“账我记下了”`])))
  const lineResult = checkVolume(lines, { n: 12 })
  assert.equal(lineResult.seriousLines.length, 1)
  assert.equal(lineResult.pass, false)
})

test('checkNames 查出用过的、烂大街的和生僻的名字', () => {
  const dir = folder('names', { 'a.md': '顾长亭推门进来。', 'b.txt': '顾长亭走了。' })
  mkdirSync(join(dir, 'node_modules'))
  writeFileSync(join(dir, 'node_modules', 'x.md'), '宋知微')
  const [used, overused, rare, free] = checkNames(dir, ['顾长亭', '叶凡', '李玦', '宋知微'])
  assert.equal(used.files.length, 2)
  assert.deepEqual(overused.problems, ['网文烂大街'])
  assert.deepEqual(rare.problems, ['生僻字'])
  assert.deepEqual(free.problems, [])
})
