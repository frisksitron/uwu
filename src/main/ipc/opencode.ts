import { type ChildProcess, spawn } from 'node:child_process'
import path from 'node:path'
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/v2'
import { type BrowserWindow, ipcMain } from 'electron'
import treeKill from 'tree-kill'

interface SharedServer {
  client: OpencodeClient
  proc: ChildProcess
  abortController: AbortController
}

let server: SharedServer | null = null
let serverStartPromise: Promise<SharedServer> | null = null
let eventForwardingStarted = false
const SERVER_PORT = 14096

export async function killAllOpencodeServers(): Promise<void> {
  if (!server) return
  server.abortController.abort()
  try {
    await server.client.global.dispose()
  } catch {
    /* best effort */
  }
  if (server.proc?.pid) treeKill(server.proc.pid)
  server = null
  serverStartPromise = null
  eventForwardingStarted = false
}

function spawnServer(port: number): ChildProcess {
  return spawn(
    'opencode',
    [
      '--print-logs',
      '--log-level',
      'WARN',
      'serve',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port)
    ],
    {
      shell: true,
      env: { ...process.env, OPENCODE_CLIENT: 'desktop' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  )
}

async function tryConnectExisting(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/global/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function ensureServer(): Promise<OpencodeClient> {
  if (server) return server.client
  if (!serverStartPromise) {
    serverStartPromise = (async () => {
      let proc: ChildProcess | undefined
      try {
        const abortController = new AbortController()
        const url = `http://127.0.0.1:${SERVER_PORT}`

        // If an orphaned server from a previous session is still running, reuse it
        const existingAlive = await tryConnectExisting(url)
        if (existingAlive) {
          console.log('[opencode] Reusing existing server on port', SERVER_PORT)
          const client = createOpencodeClient({ baseUrl: url })
          const s: SharedServer = { client, proc: null as unknown as ChildProcess, abortController }
          server = s
          return s
        }

        proc = spawnServer(SERVER_PORT)

        // Collect stderr for error diagnostics
        let stderrOutput = ''
        proc.stderr?.on('data', (chunk: Buffer) => {
          stderrOutput += chunk.toString()
        })

        // Wait for the server to be ready by polling
        await new Promise<void>((resolve, reject) => {
          let poll: ReturnType<typeof setInterval>
          const cleanup = () => {
            clearInterval(poll)
            clearTimeout(timeout)
          }
          const timeout = setTimeout(() => {
            cleanup()
            reject(new Error('opencode server start timeout'))
          }, 30000)
          proc?.on('error', (err) => {
            cleanup()
            reject(err)
          })
          proc?.on('exit', (code) => {
            if (!server) {
              cleanup()
              const detail = stderrOutput.trim()
              reject(
                new Error(`opencode server exited with code ${code}${detail ? `\n${detail}` : ''}`)
              )
            }
          })
          poll = setInterval(async () => {
            try {
              const res = await fetch(`${url}/global/health`)
              if (res.ok) {
                cleanup()
                resolve()
              }
            } catch {
              /* server not ready yet */
            }
          }, 100)
        })

        const client = createOpencodeClient({ baseUrl: url })
        const s: SharedServer = { client, proc, abortController }
        server = s

        proc.on('exit', () => {
          if (server?.proc === proc) {
            server = null
            serverStartPromise = null
            eventForwardingStarted = false
          }
        })

        return s
      } catch (err) {
        // Kill the spawned process if startup failed to avoid zombies
        if (proc?.pid) treeKill(proc.pid)
        serverStartPromise = null
        throw err
      }
    })()
  }
  const s = await serverStartPromise
  return s.client
}

async function startGlobalEventForwarding(
  mainWindow: BrowserWindow,
  client: OpencodeClient,
  signal: AbortSignal
): Promise<void> {
  try {
    const { stream } = await client.global.event()
    for await (const globalEvent of stream) {
      if (signal.aborted || mainWindow.isDestroyed()) break
      mainWindow.webContents.send('opencode:event', globalEvent.directory, globalEvent.payload)
    }
  } catch (err) {
    if (!signal.aborted) {
      console.error('[opencode] Global event stream error:', err)
      eventForwardingStarted = false
    }
  }
}

/** Normalize directory paths to OS-native format (backslashes on Windows).
 *  The opencode server's Filesystem.resolve() stores paths with backslashes,
 *  but the session.list SQL filter uses the raw query param as-is.
 *  Without this, forward-slash paths yield zero session matches on Windows. */
function normDir(dir: string): string {
  return path.resolve(dir)
}

export function setupOpencodeIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('opencode:start', async (_event, _projectPath: string) => {
    try {
      const client = await ensureServer()
      if (!eventForwardingStarted && server) {
        eventForwardingStarted = true
        startGlobalEventForwarding(mainWindow, client, server.abortController.signal)
      }
      return { status: 'ready' }
    } catch (err) {
      console.error('[opencode] Failed to start server:', err)
      return { status: 'error', error: String(err) }
    }
  })

  ipcMain.handle('opencode:session-list', async (_event, projectPath: string) => {
    try {
      const client = await ensureServer()
      const result = await client.session.list({ directory: normDir(projectPath) })
      return result.data
    } catch (err) {
      throw new Error(`opencode:session-list failed: ${(err as Error).message}`)
    }
  })

  ipcMain.handle('opencode:session-create', async (_event, projectPath: string, title?: string) => {
    try {
      const client = await ensureServer()
      const result = await client.session.create({ directory: normDir(projectPath), title })
      return result.data
    } catch (err) {
      throw new Error(`opencode:session-create failed: ${(err as Error).message}`)
    }
  })

  ipcMain.handle('opencode:session-get', async (_event, projectPath: string, sessionId: string) => {
    try {
      const client = await ensureServer()
      const result = await client.session.get({
        sessionID: sessionId,
        directory: normDir(projectPath)
      })
      return result.data
    } catch (err) {
      throw new Error(`opencode:session-get failed: ${(err as Error).message}`)
    }
  })

  ipcMain.handle(
    'opencode:session-delete',
    async (_event, projectPath: string, sessionId: string) => {
      try {
        const client = await ensureServer()
        const result = await client.session.delete({
          sessionID: sessionId,
          directory: normDir(projectPath)
        })
        return result.data
      } catch (err) {
        throw new Error(`opencode:session-delete failed: ${(err as Error).message}`)
      }
    }
  )

  ipcMain.handle(
    'opencode:session-abort',
    async (_event, projectPath: string, sessionId: string) => {
      try {
        const client = await ensureServer()
        const result = await client.session.abort({
          sessionID: sessionId,
          directory: normDir(projectPath)
        })
        return result.data
      } catch (err) {
        throw new Error(`opencode:session-abort failed: ${(err as Error).message}`)
      }
    }
  )

  ipcMain.handle('opencode:messages', async (_event, projectPath: string, sessionId: string) => {
    try {
      const client = await ensureServer()
      const result = await client.session.messages({
        sessionID: sessionId,
        directory: normDir(projectPath)
      })
      return result.data
    } catch (err) {
      throw new Error(`opencode:messages failed: ${(err as Error).message}`)
    }
  })

  ipcMain.handle(
    'opencode:send-message',
    async (
      _event,
      projectPath: string,
      sessionId: string,
      payload: {
        parts: Array<
          | { type: 'text'; text: string }
          | { type: 'file'; mime: string; url: string; filename?: string }
        >
        model?: { providerID: string; modelID: string }
        agent?: string
        variant?: string
      }
    ) => {
      try {
        const client = await ensureServer()
        await client.session.promptAsync({
          sessionID: sessionId,
          directory: normDir(projectPath),
          parts: payload.parts,
          model: payload.model,
          agent: payload.agent,
          variant: payload.variant
        })
      } catch (err) {
        throw new Error(`opencode:send-message failed: ${(err as Error).message}`)
      }
    }
  )

  ipcMain.handle(
    'opencode:permission-respond',
    async (
      _event,
      projectPath: string,
      sessionId: string,
      permissionId: string,
      response: 'once' | 'always' | 'reject'
    ) => {
      try {
        const client = await ensureServer()
        await client.permission.respond({
          sessionID: sessionId,
          permissionID: permissionId,
          directory: normDir(projectPath),
          response
        })
      } catch (err) {
        throw new Error(`opencode:permission-respond failed: ${(err as Error).message}`)
      }
    }
  )

  ipcMain.handle(
    'opencode:question-reply',
    async (_event, projectPath: string, requestId: string, answers: Array<Array<string>>) => {
      try {
        const client = await ensureServer()
        await client.question.reply({
          requestID: requestId,
          directory: normDir(projectPath),
          answers
        })
      } catch (err) {
        throw new Error(`opencode:question-reply failed: ${(err as Error).message}`)
      }
    }
  )

  ipcMain.handle(
    'opencode:question-reject',
    async (_event, projectPath: string, requestId: string) => {
      try {
        const client = await ensureServer()
        await client.question.reject({ requestID: requestId, directory: normDir(projectPath) })
      } catch (err) {
        throw new Error(`opencode:question-reject failed: ${(err as Error).message}`)
      }
    }
  )

  ipcMain.handle('opencode:providers', async (_event, projectPath: string) => {
    try {
      const client = await ensureServer()
      const result = await client.provider.list({ directory: normDir(projectPath) })
      return result.data
    } catch (err) {
      throw new Error(`opencode:providers failed: ${(err as Error).message}`)
    }
  })

  ipcMain.handle('opencode:config', async (_event, _projectPath: string) => {
    try {
      const client = await ensureServer()
      const result = await client.config.get()
      return result.data
    } catch (err) {
      throw new Error(`opencode:config failed: ${(err as Error).message}`)
    }
  })

  ipcMain.handle('opencode:agents', async (_event, projectPath: string) => {
    try {
      const client = await ensureServer()
      const result = await client.app.agents({ directory: normDir(projectPath) })
      return result.data
    } catch (err) {
      throw new Error(`opencode:agents failed: ${(err as Error).message}`)
    }
  })

  ipcMain.handle('opencode:commands', async (_event, projectPath: string) => {
    try {
      const client = await ensureServer()
      const result = await client.command.list({ directory: normDir(projectPath) })
      return result.data
    } catch (err) {
      throw new Error(`opencode:commands failed: ${(err as Error).message}`)
    }
  })

  ipcMain.handle(
    'opencode:session-command',
    async (
      _event,
      projectPath: string,
      sessionId: string,
      command: string,
      args: string,
      model?: string,
      agent?: string,
      variant?: string
    ) => {
      try {
        const client = await ensureServer()
        await client.session.command({
          sessionID: sessionId,
          directory: normDir(projectPath),
          command,
          arguments: args,
          model,
          agent,
          variant
        })
      } catch (err) {
        throw new Error(`opencode:session-command failed: ${(err as Error).message}`)
      }
    }
  )
}
