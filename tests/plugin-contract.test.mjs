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
  assert.equal(manifest.version, '0.1.0')
  assert.deepEqual(manifest.dsh, { bundle: { patch: './cordis.patch.yml' } })
  assert.deepEqual(manifest.dependencies ?? {}, {})
  assert.deepEqual(manifest.optionalDependencies ?? {}, {})
  assert.equal(manifest.scripts?.install, undefined)
  assert.equal(manifest.scripts?.prepare, undefined)
  assert.match(patch, /name: zhiji-dsh-plugin/)
  assert.match(patch, /inject: \[skills\]/)
})

test('registers one embedded user- and model-invocable Skill', async () => {
  const registrations = []
  const plugin = await import(pathToFileURL(path.join(packageRoot, 'index.js')).href)
  plugin.apply({ skills: { register(skill) { registrations.push(skill); return () => {} } } })

  assert.deepEqual(plugin.inject, ['skills'])
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].name, 'zhiji-daily-review')
  assert.equal(registrations[0].source, 'bundled')
  assert.match(registrations[0].description, /一个主要洞察/)
  assert.match(registrations[0].content, /📌 事实/)
  assert.match(registrations[0].content, /🔍 主要洞察/)
  assert.match(registrations[0].content, /⚡ 单一行动/)
  assert.match(registrations[0].content, /不读取或扫描/)
  assert.match(registrations[0].content, /证据不足/)
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
  const source = `${await read('index.js')}\n${await read('cordis.patch.yml')}\n${await read('skills/daily-review.md')}`
  assert.doesNotMatch(source, /[A-Za-z]:\\|\.claude[\\/]|deepseek-harness/)
  assert.doesNotMatch(source, /child_process|spawn\(|exec\(|fetch\(|https?:\/\//)
  assert.doesNotMatch(source, /writeFile|appendFile|mkdir\(|rm\(|unlink\(/)
})
