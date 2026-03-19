import { createStore } from 'solid-js/store'

interface OpcodeServerState {
  status: 'idle' | 'starting' | 'ready' | 'error'
}

const [state, setState] = createStore<OpcodeServerState>({
  status: 'idle'
})

export { state as opcodeServer }

export function isServerReady(): boolean {
  return state.status === 'ready'
}

export async function startServer(projectPath: string): Promise<boolean> {
  if (state.status === 'ready' || state.status === 'starting') {
    return state.status === 'ready'
  }
  setState('status', 'starting')
  const result = await window.opencodeAPI.start(projectPath)
  if (result.status === 'ready') {
    setState('status', 'ready')
    return true
  }
  setState('status', 'error')
  return false
}

export function setServerError(): void {
  setState('status', 'error')
}
