import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import { extname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { ipcMain } from 'electron'
import type { DiffFile, DiffFileStatus, DiffHunk, DiffResult, DiffRow } from '../../shared/types'

const execFileAsync = promisify(execFile)

const CONTEXT_LINES = 3

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

let difftasticCache: boolean | null = null

async function hasDifftastic(): Promise<boolean> {
  if (difftasticCache !== null) return difftasticCache
  try {
    await execFileAsync('difft', ['--version'])
    difftasticCache = true
  } catch {
    difftasticCache = false
  }
  return difftasticCache
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

// --- Unified diff parser ---

function parseHunkHeader(line: string): { oldStart: number; newStart: number } | null {
  const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  if (!match) return null
  return {
    oldStart: Number.parseInt(match[1], 10),
    newStart: Number.parseInt(match[2], 10)
  }
}

function parseUnifiedDiff(raw: string): Map<string, DiffHunk[]> {
  const result = new Map<string, DiffHunk[]>()
  const lines = raw.split('\n')
  let i = 0

  while (i < lines.length) {
    if (!lines[i].startsWith('diff --git')) {
      i++
      continue
    }

    let filePath = ''
    i++

    // Skip extended header lines until --- line
    while (i < lines.length && !lines[i].startsWith('---') && !lines[i].startsWith('diff --git')) {
      i++
    }

    if (i >= lines.length || lines[i].startsWith('diff --git')) continue

    // --- a/path or --- /dev/null
    const minusLine = lines[i]
    i++
    if (i >= lines.length) break
    // +++ b/path or +++ /dev/null
    const plusLine = lines[i]
    i++

    if (plusLine.startsWith('+++ b/')) {
      filePath = plusLine.substring('+++ b/'.length)
    } else if (plusLine === '+++ /dev/null' && minusLine.startsWith('--- a/')) {
      filePath = minusLine.substring('--- a/'.length)
    }

    if (!filePath) continue

    const hunks: DiffHunk[] = []

    while (i < lines.length && !lines[i].startsWith('diff --git')) {
      const hunkHeader = parseHunkHeader(lines[i])
      if (!hunkHeader) {
        i++
        continue
      }
      i++

      let oldLine = hunkHeader.oldStart
      let newLine = hunkHeader.newStart
      const rows: DiffRow[] = []

      while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
        const line = lines[i]
        if (line.startsWith('+')) {
          rows.push({
            type: 'add',
            oldLineNo: null,
            newLineNo: newLine++,
            oldContent: null,
            newContent: line.substring(1)
          })
        } else if (line.startsWith('-')) {
          rows.push({
            type: 'remove',
            oldLineNo: oldLine++,
            newLineNo: null,
            oldContent: line.substring(1),
            newContent: null
          })
        } else if (line.startsWith(' ')) {
          rows.push({
            type: 'context',
            oldLineNo: oldLine++,
            newLineNo: newLine++,
            oldContent: line.substring(1),
            newContent: line.substring(1)
          })
        } else if (line.startsWith('\\')) {
          // "\ No newline at end of file" — skip
          i++
          continue
        }
        i++
      }

      if (rows.length > 0) hunks.push({ rows })
    }

    result.set(filePath, hunks)
  }

  return result
}

// --- Difftastic structural diff ---

// --- Difftastic JSON types (DFT_DISPLAY=json DFT_UNSTABLE=yes) ---

interface DifftSide {
  line_number: number
  changes: unknown[]
}

interface DifftEntry {
  lhs?: DifftSide
  rhs?: DifftSide
}

interface DifftasticFile {
  path: string
  language: string
  status: string
  chunks: DifftEntry[][]
}

/**
 * Build complete aligned rows from difftastic chunks + file content.
 * Chunks only contain changed lines; we fill in context from file content.
 */
function buildRowsFromChunks(
  chunks: DifftEntry[][],
  oldLines: string[],
  newLines: string[]
): DiffRow[] {
  // Collect all changed line numbers per side
  const changedOld = new Set<number>()
  const changedNew = new Set<number>()
  // Map modified lines: old line → new line (and vice versa)
  const oldToNew = new Map<number, number>()

  for (const chunk of chunks) {
    for (const entry of chunk) {
      if (entry.lhs && entry.rhs) {
        // Modified line
        changedOld.add(entry.lhs.line_number)
        changedNew.add(entry.rhs.line_number)
        oldToNew.set(entry.lhs.line_number, entry.rhs.line_number)
      } else if (entry.lhs) {
        changedOld.add(entry.lhs.line_number)
      } else if (entry.rhs) {
        changedNew.add(entry.rhs.line_number)
      }
    }
  }

  // Two-pointer walk through old and new files
  const rows: DiffRow[] = []
  let oi = 0
  let ni = 0

  while (oi < oldLines.length || ni < newLines.length) {
    const oldIsChanged = oi < oldLines.length && changedOld.has(oi)
    const newIsChanged = ni < newLines.length && changedNew.has(ni)

    if (!oldIsChanged && !newIsChanged) {
      // Context line — both sides advance together
      if (oi < oldLines.length && ni < newLines.length) {
        rows.push({
          type: 'context',
          oldLineNo: oi + 1,
          newLineNo: ni + 1,
          oldContent: oldLines[oi],
          newContent: newLines[ni]
        })
        oi++
        ni++
      } else if (oi < oldLines.length) {
        rows.push({
          type: 'remove',
          oldLineNo: oi + 1,
          newLineNo: null,
          oldContent: oldLines[oi],
          newContent: null
        })
        oi++
      } else {
        rows.push({
          type: 'add',
          oldLineNo: null,
          newLineNo: ni + 1,
          oldContent: null,
          newContent: newLines[ni]
        })
        ni++
      }
    } else if (oldIsChanged && oldToNew.has(oi)) {
      // Modified line — use mapped new line to avoid desync from interleaved adds/removes
      const mappedNi = oldToNew.get(oi) as number
      rows.push({
        type: 'modify',
        oldLineNo: oi + 1,
        newLineNo: mappedNi + 1,
        oldContent: oldLines[oi],
        newContent: newLines[mappedNi]
      })
      oi++
      ni++
    } else if (oldIsChanged) {
      // Deleted line — only old side advances
      rows.push({
        type: 'remove',
        oldLineNo: oi + 1,
        newLineNo: null,
        oldContent: oldLines[oi],
        newContent: null
      })
      oi++
    } else {
      // Added line — only new side advances
      rows.push({
        type: 'add',
        oldLineNo: null,
        newLineNo: ni + 1,
        oldContent: null,
        newContent: newLines[ni]
      })
      ni++
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

function readFileContent(fullPath: string): string | null {
  try {
    return fs.readFileSync(fullPath, 'utf-8')
  } catch {
    return null
  }
}

async function tryDifftasticHunks(
  cwd: string,
  mode: 'unstaged' | 'staged' | 'all',
  modeArgs: string[]
): Promise<Map<string, DiffHunk[]> | null> {
  try {
    const stdout = await git(['-c', 'diff.external=difft', 'diff', ...modeArgs], cwd, {
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

    if (jsonObjects.length === 0) return null

    const hunksMap = new Map<string, DiffHunk[]>()

    await Promise.all(
      jsonObjects.map(async (obj) => {
        try {
          if (!obj.path || obj.status === 'unchanged') return
          if (!Array.isArray(obj.chunks) || obj.chunks.length === 0) return

          const oldContent = await getFileContent(cwd, 'HEAD', obj.path)
          const newContent =
            mode === 'unstaged'
              ? readFileContent(join(cwd, obj.path))
              : mode === 'staged'
                ? await getFileContent(cwd, ':0', obj.path)
                : readFileContent(join(cwd, obj.path))

          const oldLines = oldContent?.split('\n') ?? []
          const newLines = newContent?.split('\n') ?? []
          const rows = buildRowsFromChunks(obj.chunks, oldLines, newLines)
          const hunks = groupIntoHunks(rows)
          if (hunks.length > 0) {
            hunksMap.set(obj.path, hunks)
          }
        } catch {
          // skip this file
        }
      })
    )

    return hunksMap.size > 0 ? hunksMap : null
  } catch {
    return null
  }
}

export function setupDiffIpc(): void {
  ipcMain.handle('diff:get', async (_event, cwd: string, mode: string): Promise<DiffResult> => {
    if (typeof cwd !== 'string' || !cwd || !isAbsolute(cwd)) {
      return {
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        hasDifftastic: false,
        error: 'Invalid working directory'
      }
    }

    const diffMode = mode === 'staged' || mode === 'all' ? mode : 'unstaged'
    const modeArgs = diffMode === 'staged' ? ['--cached'] : diffMode === 'all' ? ['HEAD'] : []

    try {
      // 1. Always get file list and stats from git (reliable baseline)
      // --no-ext-diff: bypass any configured external diff tool (e.g. difftastic)
      // so we always get standard git output formats
      const [numstatOut, nameStatusOut, diffOut] = await Promise.all([
        git(['diff', '--no-ext-diff', '--numstat', ...modeArgs], cwd).catch(() => ''),
        git(['diff', '--no-ext-diff', '--name-status', '-M', ...modeArgs], cwd).catch(() => ''),
        git(
          ['diff', '--no-ext-diff', '--unified=3', '--no-color', '--find-renames', ...modeArgs],
          cwd
        ).catch(() => '')
      ])

      const numstat = getNumstat(numstatOut)
      const nameStatus = getNameStatus(nameStatusOut)
      const parsedHunks = parseUnifiedDiff(diffOut)

      // 2. Optionally try difftastic for structural hunks
      let difftHunks: Map<string, DiffHunk[]> | null = null
      const difftAvailable = await hasDifftastic()
      if (difftAvailable) {
        difftHunks = await tryDifftasticHunks(cwd, diffMode, modeArgs)
      }

      // 3. Build file list from name-status (authoritative source for which files changed)
      const files: DiffFile[] = []
      let totalAdditions = 0
      let totalDeletions = 0

      for (const [filePath, info] of nameStatus) {
        const stats = numstat.get(filePath)
        const additions = stats?.additions ?? 0
        const deletions = stats?.deletions ?? 0
        totalAdditions += additions
        totalDeletions += deletions

        // Use difftastic hunks if available, otherwise fall back to parsed unified diff
        const hunks = difftHunks?.get(filePath) ?? parsedHunks.get(filePath) ?? []

        files.push({
          path: filePath,
          oldPath: info.oldPath,
          status: info.status,
          additions,
          deletions,
          binary: stats?.binary,
          language: langFromPath(filePath),
          hunks
        })
      }

      return {
        files,
        totalAdditions,
        totalDeletions,
        hasDifftastic: difftAvailable
      }
    } catch (err) {
      return {
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        hasDifftastic: false,
        error: (err as Error).message
      }
    }
  })
}
