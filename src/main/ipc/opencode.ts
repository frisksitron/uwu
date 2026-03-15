import { type ChildProcess, spawn } from 'node:child_process'
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/v2'
import { type BrowserWindow, ipcMain } from 'electron'

interface OpencodeInstance {
  client: OpencodeClient
  proc: ChildProcess
  abortController: AbortController
}

let nextPort = 14096
const instances = new Map<string, OpencodeInstance>()

export function killAllOpencodeServers(): void {
  for (const [, instance] of instances) {
    instance.abortController.abort()
    instance.proc.kill()
  }
  instances.clear()
}

async function spawnServer(
  projectPath: string,
  port: number,
  timeout = 10000
): Promise<{ proc: ChildProcess; url: string }> {
  const hostname = '127.0.0.1'
  const proc = spawn('opencode', ['serve', `--hostname=${hostname}`, `--port=${port}`], {
    cwd: projectPath,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error(`Timeout waiting for opencode server after ${timeout}ms`))
    }, timeout)

    let output = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      for (const line of output.split('\n')) {
        if (line.startsWith('opencode server listening')) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          if (match) {
            clearTimeout(id)
            resolve(match[1])
            return
          }
        }
      }
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    proc.on('exit', (code) => {
      clearTimeout(id)
      reject(new Error(`Server exited with code ${code}\n${output}`))
    })
    proc.on('error', (error) => {
      clearTimeout(id)
      reject(error)
    })
  })

  return { proc, url }
}

export function setupOpencodeIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('opencode:start', async (_event, projectPath: string) => {
    if (instances.has(projectPath)) {
      return { status: 'ready' }
    }
    try {
      const port = nextPort++
      const { proc, url } = await spawnServer(projectPath, port)
      const client = createOpencodeClient({ baseUrl: url })
      const abortController = new AbortController()
      instances.set(projectPath, { client, proc, abortController })

      // Start event subscription in background
      startEventForwarding(mainWindow, client, projectPath, abortController.signal)

      return { status: 'ready' }
    } catch (err) {
      console.error(`[opencode] Failed to start server for ${projectPath}:`, err)
      return { status: 'error', error: String(err) }
    }
  })

  ipcMain.handle('opencode:stop', async (_event, projectPath: string) => {
    const instance = instances.get(projectPath)
    if (!instance) return
    instance.abortController.abort()
    instance.proc.kill()
    instances.delete(projectPath)
  })

  ipcMain.handle('opencode:status', async (_event, projectPath: string) => {
    return instances.has(projectPath) ? 'ready' : 'stopped'
  })

  ipcMain.handle('opencode:session-list', async (_event, projectPath: string) => {
    const client = getClient(projectPath)
    const result = await client.session.list()
    return result.data
  })

  ipcMain.handle('opencode:session-create', async (_event, projectPath: string, title?: string) => {
    const client = getClient(projectPath)
    const result = await client.session.create({ title })
    return result.data
  })

  ipcMain.handle('opencode:session-get', async (_event, projectPath: string, sessionId: string) => {
    const client = getClient(projectPath)
    const result = await client.session.get({ sessionID: sessionId })
    return result.data
  })

  ipcMain.handle(
    'opencode:session-delete',
    async (_event, projectPath: string, sessionId: string) => {
      const client = getClient(projectPath)
      const result = await client.session.delete({ sessionID: sessionId })
      return result.data
    }
  )

  ipcMain.handle(
    'opencode:session-abort',
    async (_event, projectPath: string, sessionId: string) => {
      const client = getClient(projectPath)
      const result = await client.session.abort({ sessionID: sessionId })
      return result.data
    }
  )

  ipcMain.handle('opencode:messages', async (_event, projectPath: string, sessionId: string) => {
    const client = getClient(projectPath)
    const result = await client.session.messages({ sessionID: sessionId })
    return result.data
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
      const client = getClient(projectPath)
      await client.session.promptAsync({
        sessionID: sessionId,
        parts: payload.parts,
        model: payload.model,
        agent: payload.agent,
        variant: payload.variant
      })
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
      const client = getClient(projectPath)
      await client.permission.respond({
        sessionID: sessionId,
        permissionID: permissionId,
        response
      })
    }
  )

  ipcMain.handle(
    'opencode:question-reply',
    async (_event, projectPath: string, requestId: string, answers: Array<Array<string>>) => {
      const client = getClient(projectPath)
      await client.question.reply({ requestID: requestId, answers })
    }
  )

  ipcMain.handle(
    'opencode:question-reject',
    async (_event, projectPath: string, requestId: string) => {
      const client = getClient(projectPath)
      await client.question.reject({ requestID: requestId })
    }
  )

  ipcMain.handle('opencode:providers', async (_event, projectPath: string) => {
    const client = getClient(projectPath)
    const result = await client.provider.list()
    return result.data
  })

  ipcMain.handle('opencode:config', async (_event, projectPath: string) => {
    const client = getClient(projectPath)
    const result = await client.config.get()
    return result.data
  })

  ipcMain.handle('opencode:agents', async (_event, projectPath: string) => {
    const client = getClient(projectPath)
    const result = await client.app.agents()
    return result.data
  })

  ipcMain.handle('opencode:commands', async (_event, projectPath: string) => {
    const client = getClient(projectPath)
    const result = await client.command.list()
    return result.data
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
      const client = getClient(projectPath)
      await client.session.command({
        sessionID: sessionId,
        command,
        arguments: args,
        model,
        agent,
        variant
      })
    }
  )
}

function getClient(projectPath: string): OpencodeClient {
  const instance = instances.get(projectPath)
  if (!instance) throw new Error(`No opencode server running for ${projectPath}`)
  return instance.client
}

async function startEventForwarding(
  mainWindow: BrowserWindow,
  client: OpencodeClient,
  projectPath: string,
  signal: AbortSignal
): Promise<void> {
  try {
    const { stream } = await client.event.subscribe()
    for await (const event of stream) {
      if (signal.aborted) break
      if (mainWindow.isDestroyed()) break
      mainWindow.webContents.send('opencode:event', projectPath, event)
    }
  } catch (err) {
    if (!signal.aborted) {
      console.error(`[opencode] Event stream error for ${projectPath}:`, err)
    }
  }
}
