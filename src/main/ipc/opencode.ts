import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import path from 'node:path'
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/v2'
import { type BrowserWindow, ipcMain } from 'electron'
import treeKill from 'tree-kill'

interface SharedServer {
  client: OpencodeClient
  proc: ChildProcess | null
  abortController: AbortController
}

let server: SharedServer | null = null
let serverStartPromise: Promise<SharedServer> | null = null
let eventForwardingStarted = false

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

async function getAvailablePort(): Promise<number> {
  const fromEnv = process.env.OPENCODE_PORT
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10)
    if (!Number.isNaN(parsed)) return parsed
  }
  return new Promise<number>((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (typeof addr !== 'object' || !addr) {
        srv.close()
        reject(new Error('Failed to get port'))
        return
      }
      srv.close(() => resolve(addr.port))
    })
  })
}

function spawnServer(port: number, password: string): ChildProcess {
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
      env: {
        ...process.env,
        OPENCODE_CLIENT: 'uwu',
        OPENCODE_SERVER_USERNAME: 'uwu',
        OPENCODE_SERVER_PASSWORD: password
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  )
}

async function checkHealth(url: string, password?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {}
    if (password) {
      headers.authorization = `Basic ${Buffer.from(`uwu:${password}`).toString('base64')}`
    }
    const res = await fetch(`${url}/global/health`, {
      headers,
      signal: AbortSignal.timeout(3000)
    })
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
        const port = await getAvailablePort()
        const password = randomUUID()
        const url = `http://127.0.0.1:${port}`

        proc = spawnServer(port, password)
        console.log('[opencode] Spawning server on port', port)

        // Collect stderr for error diagnostics
        let stderrOutput = ''
        proc.stderr?.on('data', (chunk: Buffer) => {
          stderrOutput += chunk.toString()
        })

        const ready = async () => {
          while (true) {
            await new Promise((r) => setTimeout(r, 100))
            if (await checkHealth(url, password)) return
          }
        }

        const terminated = async () => {
          const { code, signal } = await new Promise<{
            code: number | null
            signal: string | null
          }>((resolve) => {
            proc?.on('exit', (c, s) => resolve({ code: c, signal: s }))
          })
          const detail = stderrOutput.trim()
          throw new Error(
            `opencode server terminated before becoming healthy (code=${code ?? 'unknown'} signal=${signal ?? 'unknown'})${detail ? `\n${detail}` : ''}`
          )
        }

        await Promise.race([
          ready(),
          terminated(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('opencode server start timeout')), 30_000)
          )
        ])

        const authHeader = `Basic ${Buffer.from(`uwu:${password}`).toString('base64')}`
        const client = createOpencodeClient({
          baseUrl: url,
          headers: { authorization: authHeader }
        })
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
      throw new Error(`opencode:session-list failed: ${(err as Error).message}`, { cause: err })
    }
  })

  ipcMain.handle('opencode:session-create', async (_event, projectPath: string, title?: string) => {
    try {
      const client = await ensureServer()
      const result = await client.session.create({ directory: normDir(projectPath), title })
      return result.data
    } catch (err) {
      throw new Error(`opencode:session-create failed: ${(err as Error).message}`, { cause: err })
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
      throw new Error(`opencode:session-get failed: ${(err as Error).message}`, { cause: err })
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
        throw new Error(`opencode:session-delete failed: ${(err as Error).message}`, { cause: err })
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
        throw new Error(`opencode:session-abort failed: ${(err as Error).message}`, { cause: err })
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
      throw new Error(`opencode:messages failed: ${(err as Error).message}`, { cause: err })
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
        throw new Error(`opencode:send-message failed: ${(err as Error).message}`, { cause: err })
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
        throw new Error(`opencode:permission-respond failed: ${(err as Error).message}`, {
          cause: err
        })
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
        throw new Error(`opencode:question-reply failed: ${(err as Error).message}`, { cause: err })
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
        throw new Error(`opencode:question-reject failed: ${(err as Error).message}`, {
          cause: err
        })
      }
    }
  )

  ipcMain.handle('opencode:providers', async (_event, projectPath: string) => {
    try {
      const client = await ensureServer()
      const result = await client.provider.list({ directory: normDir(projectPath) })
      return result.data
    } catch (err) {
      throw new Error(`opencode:providers failed: ${(err as Error).message}`, { cause: err })
    }
  })

  ipcMain.handle('opencode:config', async (_event, _projectPath: string) => {
    try {
      const client = await ensureServer()
      const result = await client.config.get()
      return result.data
    } catch (err) {
      throw new Error(`opencode:config failed: ${(err as Error).message}`, { cause: err })
    }
  })

  ipcMain.handle('opencode:agents', async (_event, projectPath: string) => {
    try {
      const client = await ensureServer()
      const result = await client.app.agents({ directory: normDir(projectPath) })
      return result.data
    } catch (err) {
      throw new Error(`opencode:agents failed: ${(err as Error).message}`, { cause: err })
    }
  })

  ipcMain.handle('opencode:commands', async (_event, projectPath: string) => {
    try {
      const client = await ensureServer()
      const result = await client.command.list({ directory: normDir(projectPath) })
      return result.data
    } catch (err) {
      throw new Error(`opencode:commands failed: ${(err as Error).message}`, { cause: err })
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
        throw new Error(`opencode:session-command failed: ${(err as Error).message}`, {
          cause: err
        })
      }
    }
  )
}
