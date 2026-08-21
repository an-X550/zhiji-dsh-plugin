import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isWithinConfiguredRoot,
  readJournalRange,
  resolveConfiguredRoot,
} from '../read-journal-range.js'

async function withJournalRoot(run) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'zhiji-range-test-'))
  const journalRoot = path.join(tempRoot, 'journals')
  await mkdir(journalRoot)
  try {
    return await run({ tempRoot, journalRoot, env: { ZHIJI_DSH_LOG_ROOT: journalRoot } })
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

test('aggregates daily files and dated sections from one explicit Markdown root', async () => {
  await withJournalRoot(async ({ journalRoot, env }) => {
    const daily = '2026-08-17.md'
    const dailyContent = '# 2026-08-17\n\n我先写验收边界，再开始修改。'
    await writeFile(path.join(journalRoot, daily), dailyContent, 'utf8')
    await writeFile(path.join(journalRoot, '2026-08-19.md'), '# 2026-08-19\n\n完成一次验证。', 'utf8')
    await writeFile(path.join(journalRoot, '谢安的2026-8月日志.md'), [
      '# 2026年8月日志',
      '',
      '## 8月20日',
      '开始前先确认风险。',
      '',
      '## 8月21日',
      '根据结果调整下一步。',
    ].join('\n'), 'utf8')

    const result = await readJournalRange({ start_date: '2026-08-17', end_date: '2026-08-21' }, { env })
    assert.equal(result.entryCount, 4)
    assert.deepEqual(result.dates, ['2026-08-17', '2026-08-19', '2026-08-20', '2026-08-21'])
    assert.deepEqual(result.files, ['2026-08-17.md', '2026-08-19.md', '谢安的2026-8月日志.md'])
    assert.match(result.text, /先写验收边界/)
    assert.match(result.text, /开始前先确认风险/)
    assert.match(result.text, /范围：2026-08-17 至 2026-08-21/)
    assert.doesNotMatch(result.text, new RegExp(journalRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(await readFile(path.join(journalRoot, daily), 'utf8'), dailyContent)
  })
})

test('returns a structured empty-range result without inventing material', async () => {
  await withJournalRoot(async ({ journalRoot, env }) => {
    await writeFile(path.join(journalRoot, '2026-08-21.md'), '今天有记录。', 'utf8')
    const result = await readJournalRange({ start_date: '2026-09-01', end_date: '2026-09-02' }, { env })
    assert.equal(result.empty, true)
    assert.equal(result.entryCount, 0)
    assert.deepEqual(result.files, [])
    assert.match(result.text, /范围内没有可用日志材料/)
  })
})

test('rejects invalid root, date range and unsupported files with clear failures', async () => {
  await assert.rejects(
    () => readJournalRange({ start_date: '2026-08-01', end_date: '2026-08-02' }, { env: {} }),
    /ZHIJI_DSH_LOG_ROOT is not configured/,
  )

  await assert.rejects(
    () => readJournalRange({ start_date: '2026-08-01', end_date: '2026-08-02' }, { env: { ZHIJI_DSH_LOG_ROOT: 'relative/logs' } }),
    /ZHIJI_DSH_LOG_ROOT must be an absolute path/,
  )

  await withJournalRoot(async ({ tempRoot, env }) => {
    const parentPath = `${tempRoot}${path.sep}..${path.sep}outside`
    await assert.rejects(
      () => readJournalRange({ start_date: '2026-08-02', end_date: '2026-08-01' }, { env }),
      /start_date must not be after end_date/,
    )
    await assert.rejects(
      () => readJournalRange({ start_date: '2026-02-30', end_date: '2026-03-01' }, { env }),
      /start_date is not a valid calendar date/,
    )
    await assert.rejects(
      () => resolveConfiguredRoot({ ZHIJI_DSH_LOG_ROOT: parentPath }),
      /must not contain '..' path segments/,
    )

    await writeFile(path.join(env.ZHIJI_DSH_LOG_ROOT, 'notes.txt'), 'not Markdown', 'utf8')
    await assert.rejects(
      () => readJournalRange({ start_date: '2026-08-01', end_date: '2026-08-02' }, { env }),
      /unsupported file format: notes\.txt/,
    )
    await rm(path.join(env.ZHIJI_DSH_LOG_ROOT, 'notes.txt'))

    await writeFile(path.join(env.ZHIJI_DSH_LOG_ROOT, 'notes.md'), '# no date heading\n', 'utf8')
    await assert.rejects(
      () => readJournalRange({ start_date: '2026-08-01', end_date: '2026-08-02' }, { env }),
      /unsupported Markdown format in notes\.md/,
    )
  })
})

test('keeps path-boundary checks explicit and rejects nested directories', async () => {
  await withJournalRoot(async ({ tempRoot, journalRoot, env }) => {
    const sibling = path.join(tempRoot, 'journals-other', '2026-08-01.md')
    assert.equal(isWithinConfiguredRoot(journalRoot, path.join(journalRoot, '2026-08-01.md')), true)
    assert.equal(isWithinConfiguredRoot(journalRoot, sibling), false)

    await mkdir(path.join(journalRoot, 'nested'))
    await assert.rejects(
      () => readJournalRange({ start_date: '2026-08-01', end_date: '2026-08-02' }, { env }),
      /nested directories are not supported: nested/,
    )
  })
})
