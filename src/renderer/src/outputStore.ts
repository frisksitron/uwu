import { createRoot, createSignal } from 'solid-js'
import { ANSI_RE } from './terminalCache'

const FLUSH_MS = 150

type SignalPair = ReturnType<typeof createSignal<string>>

const lastLines = new Map<string, { signal: SignalPair; dispose: () => void }>()
const buffers = new Map<string, string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function getOrCreate(tabId: string): SignalPair {
  let entry = lastLines.get(tabId)
  if (!entry) {
    let signal!: SignalPair
    const dispose = createRoot((d) => {
      const [get, set] = createSignal('')
      signal = [get, set]
      return d
    })
    entry = { signal, dispose }
    lastLines.set(tabId, entry)
  }
  return entry.signal
}

function flush(tabId: string): void {
  const raw = buffers.get(tabId) || ''
  buffers.delete(tabId)
  timers.delete(tabId)

  const stripped = raw.replace(ANSI_RE, '')
  const lines = stripped.split('\n')
  let last = ''
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (trimmed) {
      last = trimmed
      break
    }
  }
  if (last) {
    const [, set] = getOrCreate(tabId)
    set(last)
  }
}

export function pushOutput(tabId: string, rawData: string): void {
  buffers.set(tabId, (buffers.get(tabId) || '') + rawData)
  if (!timers.has(tabId)) {
    timers.set(
      tabId,
      setTimeout(() => flush(tabId), FLUSH_MS)
    )
  }
}

export function getLastLine(tabId: string): string {
  const [get] = getOrCreate(tabId)
  return get()
}

export function clearOutput(tabId: string): void {
  buffers.delete(tabId)
  const timer = timers.get(tabId)
  if (timer) clearTimeout(timer)
  timers.delete(tabId)
  const entry = lastLines.get(tabId)
  if (entry) {
    entry.signal[1]('')
    entry.dispose()
  }
  lastLines.delete(tabId)
}
