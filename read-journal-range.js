import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

export const JOURNAL_RANGE_TOOL_NAME = 'zhiji_read_journal_range'
export const LOG_ROOT_ENV = 'ZHIJI_DSH_LOG_ROOT'
export const MAX_MATERIAL_CHARS = 120_000

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAILY_FILE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})\.md$/i

function fail(message) {
  throw new Error(`${JOURNAL_RANGE_TOOL_NAME}: ${message}`)
}

function checkAborted(signal) {
  if (signal?.aborted) fail('journal read aborted')
}

function parseDateParts(yearText, monthText, dayText) {
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  const value = new Date(Date.UTC(year, month - 1, day))
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseRequestDate(value, name) {
  if (typeof value !== 'string' || !DATE_INPUT_PATTERN.test(value)) {
    fail(`${name} must use YYYY-MM-DD`)
  }
  const parsed = parseDateParts(value.slice(0, 4), value.slice(5, 7), value.slice(8, 10))
  if (parsed === null) fail(`${name} is not a valid calendar date`)
  return parsed
}

function hasParentSegment(value) {
  return value.replaceAll('/', '\\').split('\\').includes('..')
}

/** Return true only when candidate is the root or a descendant of root. */
export function isWithinConfiguredRoot(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

/** Resolve and validate the explicitly configured, existing journal directory. */
export async function resolveConfiguredRoot(env = process.env) {
  const raw = typeof env?.[LOG_ROOT_ENV] === 'string' ? env[LOG_ROOT_ENV].trim() : ''
  if (!raw) fail(`${LOG_ROOT_ENV} is not configured; set it to an absolute journal directory`)
  if (!path.isAbsolute(raw)) fail(`${LOG_ROOT_ENV} must be an absolute path`)
  if (hasParentSegment(raw)) fail(`${LOG_ROOT_ENV} must not contain '..' path segments`)

  let resolved
  try {
    resolved = await realpath(raw)
    const metadata = await stat(resolved)
    if (!metadata.isDirectory()) fail('configured log root is not a directory')
  } catch (error) {
    if (error?.message?.startsWith(`${JOURNAL_RANGE_TOOL_NAME}:`)) throw error
    fail('configured log root does not exist or cannot be read')
  }
  return resolved
}

function inferYear(fileName) {
  const match = fileName.match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/)
  return match?.[1] ?? null
}

function parseDateMarker(line, fileName, inferredYear) {
  const trimmed = line.trim()
  const heading = trimmed.match(/^#{1,6}\s+(.+?)\s*$/)
  const standalone = trimmed.match(/^(\d{4}-\d{1,2}-\d{1,2})\s*$/)
  const source = heading?.[1]?.trim() ?? standalone?.[1]
  if (!source) return null

  const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s|$|[（(])/)
  if (iso) {
    const date = parseDateParts(iso[1], iso[2], iso[3])
    if (date === null) fail(`invalid date heading in ${fileName}`)
    return date
  }

  const chinese = source.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s|$|[（(])/)
  if (chinese) {
    if (inferredYear === null) fail(`year is missing for Chinese date heading in ${fileName}`)
    const date = parseDateParts(inferredYear, chinese[1], chinese[2])
    if (date === null) fail(`invalid date heading in ${fileName}`)
    return date
  }
  return null
}

function parseDailyFileDate(fileName) {
  const match = fileName.match(DAILY_FILE_PATTERN)
  if (!match) return null
  const date = parseDateParts(match[1], match[2], match[3])
  if (date === null) fail(`invalid date in file name ${fileName}`)
  return date
}

function inRange(date, startDate, endDate) {
  return date >= startDate && date <= endDate
}

async function listMarkdownFiles(root, signal) {
  checkAborted(signal)
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    fail('configured log root cannot be listed')
  }

  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    checkAborted(signal)
    if (entry.isDirectory()) fail(`nested directories are not supported: ${entry.name}`)
    if (!entry.isFile() && !entry.isSymbolicLink()) fail(`unsupported filesystem entry: ${entry.name}`)
    if (!entry.name.toLowerCase().endsWith('.md')) fail(`unsupported file format: ${entry.name}`)

    const candidate = path.join(root, entry.name)
    let resolved
    let metadata
    try {
      resolved = await realpath(candidate)
      metadata = await stat(resolved)
    } catch {
      fail(`journal file cannot be read: ${entry.name}`)
    }
    if (!isWithinConfiguredRoot(root, resolved)) fail(`path escapes configured root: ${entry.name}`)
    if (!metadata.isFile()) fail(`journal entry is not a regular file: ${entry.name}`)
    files.push({ name: entry.name, path: resolved })
  }
  return files
}

function sectionsFromMarkdown(content, fileName) {
  const inferredYear = inferYear(fileName)
  const lines = content.split(/\r?\n/)
  const sections = []
  let current = null
  const preamble = []

  const finish = () => {
    if (current === null) return
    sections.push({ date: current.date, text: current.lines.join('\n').trim() })
    current = null
  }

  for (const line of lines) {
    const date = parseDateMarker(line, fileName, inferredYear)
    if (date !== null) {
      finish()
      current = { date, lines: [line] }
      continue
    }
    if (current === null) preamble.push(line)
    else current.lines.push(line)
  }
  finish()

  if (sections.length === 0) {
    if (content.trim() === '') fail(`empty Markdown file: ${fileName}`)
    fail(`unsupported Markdown format in ${fileName}; expected a dated heading`)
  }
  if (preamble.some((line) => line.trim() !== '')) sections[0].text = `${preamble.join('\n').trim()}\n\n${sections[0].text}`.trim()
  return sections
}

async function readFileEntries(file, startDate, endDate, signal) {
  checkAborted(signal)
  let content
  try {
    content = await readFile(file.path, { encoding: 'utf8', signal })
  } catch (error) {
    if (error?.name === 'AbortError') fail('journal read aborted')
    fail(`journal file cannot be read: ${file.name}`)
  }

  const dailyDate = parseDailyFileDate(file.name)
  if (dailyDate !== null) {
    return inRange(dailyDate, startDate, endDate) ? [{ date: dailyDate, file: file.name, text: content.trim() }] : []
  }

  return sectionsFromMarkdown(content, file.name)
    .filter((section) => inRange(section.date, startDate, endDate))
    .map((section) => ({ ...section, file: file.name }))
}

function buildMaterial(entries, startDate, endDate) {
  const dates = [...new Set(entries.map((entry) => entry.date))].sort()
  const files = [...new Set(entries.map((entry) => entry.file))].sort((left, right) => left.localeCompare(right))
  const parts = [
    '# 知己只读日志材料',
    `范围：${startDate} 至 ${endDate}`,
    '来源：已配置日志根目录中的 Markdown；本次读取不会写回文件。',
  ]

  if (entries.length === 0) {
    parts.push('范围内没有可用日志材料。')
  } else {
    for (const entry of entries) {
      parts.push(`\n## ${entry.date}\n来源文件：${entry.file}\n${entry.text}`.trimEnd())
    }
  }
  const text = parts.join('\n')
  if (text.length > MAX_MATERIAL_CHARS) fail(`selected material exceeds ${MAX_MATERIAL_CHARS} characters; narrow the date range`)
  return { startDate, endDate, files, dates, entryCount: entries.length, empty: entries.length === 0, text }
}

/** Read only supported Markdown entries in one explicit inclusive date range. */
export async function readJournalRange(args, options = {}) {
  const startDate = parseRequestDate(args?.start_date, 'start_date')
  const endDate = parseRequestDate(args?.end_date, 'end_date')
  if (startDate > endDate) fail('start_date must not be after end_date')

  const signal = options.signal
  const root = await resolveConfiguredRoot(options.env ?? process.env)
  const files = await listMarkdownFiles(root, signal)
  const entries = []
  for (const file of files) entries.push(...await readFileEntries(file, startDate, endDate, signal))
  entries.sort((left, right) => left.date.localeCompare(right.date) || left.file.localeCompare(right.file) || left.text.localeCompare(right.text))
  return buildMaterial(entries, startDate, endDate)
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    startDate: { type: 'string' },
    endDate: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    dates: { type: 'array', items: { type: 'string' } },
    entryCount: { type: 'integer' },
    empty: { type: 'boolean' },
    text: { type: 'string' },
  },
  required: ['startDate', 'endDate', 'files', 'dates', 'entryCount', 'empty', 'text'],
}

/** Create the single purpose DSH raw ToolDefinition without a package dependency. */
export function createJournalRangeTool() {
  return {
    name: JOURNAL_RANGE_TOOL_NAME,
    description: 'Read supported Markdown journal entries from the explicitly configured ZHIJI_DSH_LOG_ROOT for one inclusive date range. Read-only; never accepts a path and never scans recursively.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        start_date: { type: 'string', description: 'Inclusive range start in YYYY-MM-DD.' },
        end_date: { type: 'string', description: 'Inclusive range end in YYYY-MM-DD.' },
      },
      required: ['start_date', 'end_date'],
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render(_args, value) {
        return [{ type: 'text', text: value.text }]
      },
    },
    async execute(args, exec) {
      return await readJournalRange(args, { signal: exec.signal })
    },
  }
}
