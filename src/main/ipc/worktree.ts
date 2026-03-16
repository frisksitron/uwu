import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import { join, normalize, relative } from 'node:path'
import { promisify } from 'node:util'
import { app, ipcMain } from 'electron'
import { detectProject } from '../detectors'

const execFileAsync = promisify(execFile)

/** Ensure a relative file path doesn't escape the base directory via traversal. */
function isSafePath(basePath: string, filePath: string): boolean {
  const resolved = normalize(join(basePath, filePath))
  const rel = relative(basePath, resolved)
  return !rel.startsWith('..') && !normalize(filePath).startsWith('/')
}

/** Validate a git branch name contains no dangerous characters. */
function isSafeBranchName(name: string): boolean {
  return /^[\w.\-/]+$/.test(name) && !name.includes('..')
}

interface WorktreeInfo {
  path: string
  branch: string
  isMain: boolean
  scripts: Record<string, string>
}

/** Copy a list of files from projectPath to worktreePath, creating parent dirs as needed. */
export function syncFilesToWorktree(
  projectPath: string,
  worktreePath: string,
  files: string[]
): { copied: string[]; errors: string[] } {
  const copied: string[] = []
  const errors: string[] = []

  for (const file of files) {
    if (!isSafePath(projectPath, file) || !isSafePath(worktreePath, file)) {
      errors.push(`${file}: path traversal blocked`)
      continue
    }
    const srcPath = join(projectPath, file)
    const destPath = join(worktreePath, file)
    try {
      if (fs.existsSync(srcPath)) {
        const destDir = join(destPath, '..')
        fs.mkdirSync(destDir, { recursive: true })
        fs.copyFileSync(srcPath, destPath)
        copied.push(file)
      } else {
        errors.push(`${file}: source not found`)
      }
    } catch (err) {
      errors.push(`${file}: ${(err as Error).message}`)
    }
  }

  return { copied, errors }
}

function getWorktreeBasePath(): string {
  return join(app.getPath('userData'), 'worktrees')
}

export function setupWorktreeIpc(): void {
  ipcMain.handle('worktree:default-base-path', () => {
    const basePath = getWorktreeBasePath()
    fs.mkdirSync(basePath, { recursive: true })
    return basePath
  })

  ipcMain.handle('worktree:is-git-repo', async (_event, projectPath: string) => {
    try {
      await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectPath })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('worktree:list', async (_event, projectPath: string): Promise<WorktreeInfo[]> => {
    try {
      const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
        cwd: projectPath
      })

      const blocks = stdout.trim().split('\n\n')
      const worktrees: WorktreeInfo[] = []

      for (let i = 0; i < blocks.length; i++) {
        const lines = blocks[i].split('\n')
        let wtPath = ''
        let branch = ''

        for (const line of lines) {
          if (line.startsWith('worktree ')) {
            wtPath = line.substring('worktree '.length)
          } else if (line.startsWith('branch ')) {
            const ref = line.substring('branch '.length)
            branch = ref.replace('refs/heads/', '')
          } else if (line === 'detached') {
            branch = '(detached)'
          }
        }

        if (wtPath) {
          worktrees.push({
            path: wtPath,
            branch: branch || '(unknown)',
            isMain: i === 0,
            scripts: {}
          })
        }
      }

      // Detect scripts for each worktree in parallel
      await Promise.all(
        worktrees.map(async (wt) => {
          try {
            const result = await detectProject(wt.path)
            wt.scripts = result?.scripts ?? {}
          } catch {
            // keep empty scripts
          }
        })
      )

      return worktrees
    } catch {
      return []
    }
  })

  ipcMain.handle(
    'worktree:create',
    async (
      _event,
      projectPath: string,
      branchName: string,
      worktreePath: string,
      syncFiles: string[]
    ): Promise<{ success: boolean; error?: string }> => {
      if (!isSafeBranchName(branchName)) {
        return { success: false, error: 'Invalid branch name' }
      }
      try {
        try {
          await execFileAsync('git', ['worktree', 'add', worktreePath, branchName], {
            cwd: projectPath
          })
        } catch {
          await execFileAsync('git', ['worktree', 'add', '-b', branchName, worktreePath], {
            cwd: projectPath
          })
        }

        syncFilesToWorktree(projectPath, worktreePath, syncFiles)

        return { success: true }
      } catch (err) {
        const stderr = (err as { stderr?: string }).stderr?.trim()
        return { success: false, error: stderr || (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'worktree:remove',
    async (
      _event,
      projectPath: string,
      worktreePath: string,
      force: boolean
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const args = ['worktree', 'remove', worktreePath]
        if (force) args.push('--force')
        await execFileAsync('git', args, { cwd: projectPath })
        return { success: true }
      } catch (err) {
        const stderr = (err as { stderr?: string }).stderr?.trim()
        return { success: false, error: stderr || (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'worktree:sync-files',
    async (
      _event,
      projectPath: string,
      worktreePath: string,
      files: string[]
    ): Promise<{ copied: string[]; errors: string[] }> => {
      return syncFilesToWorktree(projectPath, worktreePath, files)
    }
  )
}
