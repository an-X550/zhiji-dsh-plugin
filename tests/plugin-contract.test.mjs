import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(root, '..')

async function read(relativePath) {
  return await readFile(path.join(packageRoot, relativePath), 'utf8')
}

test('package is a minimal DSH Bundle without install-time code or runtime dependencies', async () => {
  const manifest = JSON.parse(await read('package.json'))
  const patch = await read('cordis.patch.yml')
  assert.equal(manifest.name, 'zhiji-dsh-plugin')
  assert.equal(manifest.version, '0.3.1')
  assert.ok(manifest.keywords.includes('dsh-plugin'))
  assert.equal(manifest.publishConfig.access, 'public')
  assert.equal(manifest.engines.node, '^22.19.0 || >=24.0.0')
  assert.deepEqual(manifest.dsh, { bundle: { patch: './cordis.patch.yml' } })
  assert.deepEqual(manifest.dependencies ?? {}, {})
  assert.deepEqual(manifest.optionalDependencies ?? {}, {})
  assert.equal(manifest.scripts?.install, undefined)
  assert.equal(manifest.scripts?.prepare, undefined)
  assert.match(patch, /name: zhiji-dsh-plugin/)
  assert.match(patch, /id: zhiji-dsh-plugin/)
  assert.match(patch, /inject: \[skills, tools\]/)
})

test('registers daily and periodic Skills plus one narrow journal-range Tool', async () => {
  const registrations = []
  const tools = []
  const plugin = await import(pathToFileURL(path.join(packageRoot, 'index.js')).href)
  plugin.apply({
    skills: { register(skill) { registrations.push(skill); return () => {} } },
    tools: { register(tool) { tools.push(tool); return () => {} } },
  })

  assert.deepEqual(plugin.inject, ['skills', 'tools'])
  assert.equal(registrations.length, 4)
  assert.deepEqual(tools.map((tool) => tool.name), ['zhiji_read_journal_range'])
  assert.deepEqual(tools[0].parameters.required, ['start_date', 'end_date'])
  assert.equal(typeof tools[0].execute, 'function')
  assert.deepEqual(registrations.map((skill) => skill.name), [
    'zhiji-daily-review',
    'zhiji-weekly-review',
    'zhiji-monthly-review',
    'zhiji-project-review',
  ])
  for (const [index, skill] of registrations.entries()) {
    assert.equal(skill.source, 'bundled')
    assert.match(skill.description, /复盘/)
    assert.match(skill.content, index === 0 ? /不读取或扫描工作区/ : /不读取或扫描非显式配置的日志目录/)
    assert.match(skill.content, /证据不足/)
  }
  assert.match(registrations[0].content, /📌 事实/)
  assert.match(registrations[0].content, /🔍 主要洞察/)
  assert.match(registrations[0].content, /⚡ 单一行动/)
  for (const [index, heading] of [
    '## 六、下周规划',
    '## 六、下月规划',
    '## 六、后续规划',
  ].entries()) {
    assert.match(registrations[index + 1].content, /## 一、回顾目标/)
    assert.match(registrations[index + 1].content, /## 质量自检/)
    assert.match(registrations[index + 1].content, new RegExp(heading))
  }
})

test('fixture contains a dated first-person event and the expected value shape', async () => {
  const journal = await read('tests/fixtures/daily-journal.md')
  const expected = await read('tests/fixtures/expected-review.md')
  assert.match(journal, /2026-08-21/)
  assert.match(journal, /我原本准备/)
  assert.match(journal, /验收标准/)
  assert.match(expected, /📌 事实/)
  assert.match(expected, /🔍 主要洞察/)
  assert.match(expected, /⚡ 单一行动/)
  assert.match(expected, /验证：/)
})

test('runtime package contains no project-path or high-risk host capability', async () => {
  const source = `${await read('index.js')}\n${await read('read-journal-range.js')}\n${await read('cordis.patch.yml')}\n${await read('skills/daily-review.md')}`
  assert.doesNotMatch(source, /[A-Za-z]:\\|\.claude[\\/]|deepseek-harness/)
  assert.doesNotMatch(source, /child_process|spawn\(|exec\(|fetch\(|https?:\/\//)
  assert.doesNotMatch(source, /writeFile|appendFile|mkdir\(|rm\(|unlink\(/)
  assert.match(source, /ZHIJI_DSH_LOG_ROOT/)
  assert.match(source, /path\.relative/)
})
