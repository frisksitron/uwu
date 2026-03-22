import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { app, ipcMain } from 'electron'
import type {
  DiffFile,
  DiffFileStatus,
  DiffHunk,
  DiffInlineSpan,
  DiffResult,
  DiffRow,
  DiffShortStat
} from '../../shared/types'

const execFileAsync = promisify(execFile)

const CONTEXT_LINES = 3

/** Resolve the path to the bundled difft binary (forward slashes for git). */
function getDifftPath(): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  const p = join(base, 'bin', `difft${process.platform === 'win32' ? '.exe' : ''}`)
  return p.replaceAll('\\', '/')
}

/** Strip \r from line endings (Windows git output) */
function stripCR(s: string): string {
  return s.replace(/\r/g, '')
}

/** Run a git command, returning stdout. Handles non-zero exit codes gracefully. */
async function git(
  args: string[],
  cwd: string,
  env?: Record<string, string | undefined>
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
      env: env ? { ...process.env, ...env } : undefined
    })
    return stripCR(stdout)
  } catch (err) {
    // git diff exits non-zero with --exit-code; also capture stdout from errors
    const stdout = (err as { stdout?: string }).stdout
    if (typeof stdout === 'string') return stripCR(stdout)
    throw err
  }
}

const EXT_TO_LANG: Record<string, string> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.json': 'json',
  '.css': 'css',
  '.html': 'html',
  '.htm': 'html',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
  '.md': 'markdown',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cs': 'csharp',
  '.java': 'java',
  '.xml': 'xml',
  '.svg': 'xml'
}

function langFromPath(filePath: string): string | undefined {
  return EXT_TO_LANG[extname(filePath).toLowerCase()]
}

function getNumstat(
  stdout: string
): Map<string, { additions: number; deletions: number; binary: boolean }> {
  const map = new Map<string, { additions: number; deletions: number; binary: boolean }>()
  for (const line of stdout.trim().split('\n')) {
    if (!line) continue
    const [add, del, file] = line.split('\t')
    if (file) {
      const binary = add === '-' && del === '-'
      map.set(file, {
        additions: binary ? 0 : Number.parseInt(add, 10),
        deletions: binary ? 0 : Number.parseInt(del, 10),
        binary
      })
    }
  }
  return map
}

function getNameStatus(stdout: string): Map<string, { status: DiffFileStatus; oldPath?: string }> {
  const map = new Map<string, { status: DiffFileStatus; oldPath?: string }>()
  for (const line of stdout.trim().split('\n')) {
    if (!line) continue
    const parts = line.split('\t')
    const code = parts[0][0]
    if (code === 'R' && parts.length >= 3) {
      map.set(parts[2], { status: 'renamed', oldPath: parts[1] })
    } else if (code === 'A') {
      map.set(parts[1], { status: 'added' })
    } else if (code === 'D') {
      map.set(parts[1], { status: 'deleted' })
    } else if (code === 'M' || code === 'T') {
      map.set(parts[1], { status: 'modified' })
    }
  }
  return map
}

// --- Difftastic structural diff ---

// --- Difftastic JSON types (DFT_DISPLAY=json DFT_UNSTABLE=yes, v0.69+) ---

interface DifftChange {
  start: number
  end: number
  content: string
  highlight: string
}

interface DifftSide {
  line_number: number
  changes: DifftChange[]
}

interface DifftEntry {
  lhs?: DifftSide
  rhs?: DifftSide
}

interface DifftasticFile {
  path: string
  language: string
  status: string
  aligned_lines: [number | null, number | null][]
  chunks: DifftEntry[][]
}

/** Build O(1) lookup maps from chunks, keyed by line number per side. */
function buildChunkIndex(chunks: DifftEntry[][]) {
  const lhs = new Map<number, DifftChange[]>()
  const rhs = new Map<number, DifftChange[]>()
  for (const chunk of chunks) {
    for (const entry of chunk) {
      if (entry.lhs) lhs.set(entry.lhs.line_number, entry.lhs.changes)
      if (entry.rhs) rhs.set(entry.rhs.line_number, entry.rhs.changes)
    }
  }
  return { lhs, rhs }
}

/** Convert difftastic change spans to inline highlight ranges. */
function changesToHighlights(changes: DifftChange[]): DiffInlineSpan[] | undefined {
  if (changes.length === 0) return undefined
  return changes.map((c) => ({ start: c.start, end: c.end }))
}

/** Walk aligned_lines to produce DiffRow[] directly from difftastic output. */
function buildRowsFromAlignedLines(
  alignedLines: [number | null, number | null][],
  oldLines: string[],
  newLines: string[],
  chunks: DifftEntry[][]
): DiffRow[] {
  const { lhs, rhs } = buildChunkIndex(chunks)
  const rows: DiffRow[] = []

  for (const [oldIdx, newIdx] of alignedLines) {
    if (oldIdx != null && newIdx != null) {
      const lhsChanges = lhs.get(oldIdx)
      const rhsChanges = rhs.get(newIdx)

      if (lhsChanges || rhsChanges) {
        // Modified line — emit remove then add with highlights
        rows.push({
          type: 'remove',
          oldLineNo: oldIdx + 1,
          newLineNo: null,
          content: oldLines[oldIdx] ?? '',
          highlights: lhsChanges ? changesToHighlights(lhsChanges) : undefined
        })
        rows.push({
          type: 'add',
          oldLineNo: null,
          newLineNo: newIdx + 1,
          content: newLines[newIdx] ?? '',
          highlights: rhsChanges ? changesToHighlights(rhsChanges) : undefined
        })
      } else {
        rows.push({
          type: 'context',
          oldLineNo: oldIdx + 1,
          newLineNo: newIdx + 1,
          content: newLines[newIdx] ?? ''
        })
      }
    } else if (oldIdx != null) {
      const lhsChanges = lhs.get(oldIdx)
      rows.push({
        type: 'remove',
        oldLineNo: oldIdx + 1,
        newLineNo: null,
        content: oldLines[oldIdx] ?? '',
        highlights: lhsChanges ? changesToHighlights(lhsChanges) : undefined
      })
    } else if (newIdx != null) {
      const rhsChanges = rhs.get(newIdx)
      rows.push({
        type: 'add',
        oldLineNo: null,
        newLineNo: newIdx + 1,
        content: newLines[newIdx] ?? '',
        highlights: rhsChanges ? changesToHighlights(rhsChanges) : undefined
      })
    }
  }

  return rows
}

function groupIntoHunks(rows: DiffRow[]): DiffHunk[] {
  if (rows.length === 0) return []

  const changed = rows.map((r) => r.type !== 'context')
  const include = new Array(rows.length).fill(false)
  for (let i = 0; i < rows.length; i++) {
    if (changed[i]) {
      for (
        let j = Math.max(0, i - CONTEXT_LINES);
        j <= Math.min(rows.length - 1, i + CONTEXT_LINES);
        j++
      ) {
        include[j] = true
      }
    }
  }

  const hunks: DiffHunk[] = []
  let current: DiffRow[] | null = null
  for (let i = 0; i < rows.length; i++) {
    if (include[i]) {
      if (!current) current = []
      current.push(rows[i])
    } else if (current) {
      hunks.push({ rows: current })
      current = null
    }
  }
  if (current) hunks.push({ rows: current })
  return hunks
}

async function getFileContent(cwd: string, ref: string, filePath: string): Promise<string | null> {
  try {
    return await git(['show', `${ref}:${filePath}`], cwd)
  } catch {
    return null
  }
}

async function readFileContent(fullPath: string): Promise<string | null> {
  try {
    return await fs.readFile(fullPath, 'utf-8')
  } catch {
    return null
  }
}

async function getDifftasticHunks(
  cwd: string,
  mode: 'unstaged' | 'staged' | 'all',
  modeArgs: string[],
  nameStatus: Map<string, { status: DiffFileStatus; oldPath?: string }>
): Promise<Map<string, DiffHunk[]>> {
  const difftPath = getDifftPath()
  const stdout = await git(['-c', `diff.external=${difftPath}`, 'diff', ...modeArgs], cwd, {
    DFT_DISPLAY: 'json',
    DFT_UNSTABLE: 'yes'
  })

  const jsonObjects: DifftasticFile[] = []
  for (const line of stdout.trim().split('\n')) {
    if (!line) continue
    try {
      jsonObjects.push(JSON.parse(line))
    } catch {
      // skip non-JSON lines
    }
  }

  const hunksMap = new Map<string, DiffHunk[]>()

  await Promise.all(
    jsonObjects.map(async (obj) => {
      try {
        if (!obj.path || obj.status === 'unchanged') return
        if (!Array.isArray(obj.aligned_lines) || obj.aligned_lines.length === 0) return

        // For renames, use the old path when fetching from HEAD
        const oldPath = nameStatus.get(obj.path)?.oldPath ?? obj.path

        const oldContent = await getFileContent(cwd, 'HEAD', oldPath)
        const newContent =
          mode === 'staged'
            ? await getFileContent(cwd, ':0', obj.path)
            : await readFileContent(join(cwd, obj.path))

        const oldLines = oldContent?.split('\n') ?? []
        const newLines = newContent?.split('\n') ?? []
        const rows = buildRowsFromAlignedLines(obj.aligned_lines, oldLines, newLines, obj.chunks)
        const hunks = groupIntoHunks(rows)
        if (hunks.length > 0) {
          hunksMap.set(obj.path, hunks)
        }
      } catch {
        // skip this file
      }
    })
  )

  return hunksMap
}

function parseShortStat(stdout: string): DiffShortStat | null {
  const line = stdout.trim()
  if (!line) return null
  const files = line.match(/(\d+) files? changed/)
  const adds = line.match(/(\d+) insertions?\(\+\)/)
  const dels = line.match(/(\d+) deletions?\(-\)/)
  if (!files) return null
  return {
    filesChanged: Number.parseInt(files[1], 10),
    additions: adds ? Number.parseInt(adds[1], 10) : 0,
    deletions: dels ? Number.parseInt(dels[1], 10) : 0
  }
}

export function setupDiffIpc(): void {
  ipcMain.handle('diff:shortstat', async (_event, cwd: string): Promise<DiffShortStat | null> => {
    if (typeof cwd !== 'string' || !cwd || !isAbsolute(cwd)) return null
    try {
      const stdout = await git(['diff', 'HEAD', '--shortstat'], cwd)
      return parseShortStat(stdout)
    } catch {
      return null
    }
  })

  ipcMain.handle('diff:get', async (_event, cwd: string, mode: string): Promise<DiffResult> => {
    if (typeof cwd !== 'string' || !cwd || !isAbsolute(cwd)) {
      return {
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        error: 'Invalid working directory'
      }
    }

    const diffMode = mode === 'staged' || mode === 'all' ? mode : 'unstaged'
    const modeArgs = diffMode === 'staged' ? ['--cached'] : diffMode === 'all' ? ['HEAD'] : []

    try {
      // 1. Get file metadata first (fast), then difftastic hunks with nameStatus
      const [numstatOut, nameStatusOut] = await Promise.all([
        git(['diff', '--no-ext-diff', '--numstat', ...modeArgs], cwd).catch(() => ''),
        git(['diff', '--no-ext-diff', '--name-status', '-M', ...modeArgs], cwd).catch(() => '')
      ])

      const numstat = getNumstat(numstatOut)
      const nameStatus = getNameStatus(nameStatusOut)
      const difftHunks = await getDifftasticHunks(cwd, diffMode, modeArgs, nameStatus)

      // 2. Build file list from name-status (authoritative source for which files changed)
      const files: DiffFile[] = []
      let totalAdditions = 0
      let totalDeletions = 0

      for (const [filePath, info] of nameStatus) {
        const stats = numstat.get(filePath)
        const additions = stats?.additions ?? 0
        const deletions = stats?.deletions ?? 0
        totalAdditions += additions
        totalDeletions += deletions

        files.push({
          path: filePath,
          oldPath: info.oldPath,
          status: info.status,
          additions,
          deletions,
          binary: stats?.binary,
          language: langFromPath(filePath),
          hunks: difftHunks.get(filePath) ?? []
        })
      }

      return {
        files,
        totalAdditions,
        totalDeletions
      }
    } catch (err) {
      return {
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        error: (err as Error).message
      }
    }
  })
}
