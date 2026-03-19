import { createStore } from 'solid-js/store'

export interface TabRuntimeState {
  open: boolean
  status?: 'idle' | 'running' | 'exited'
  exitCode?: number
}

const [tabRuntime, setTabRuntime] = createStore<Record<string, TabRuntimeState>>({})

export { tabRuntime }

export function openTab(id: string): void {
  setTabRuntime(id, { open: true })
}

export function closeTab(id: string): void {
  setTabRuntime(id, { ...tabRuntime[id], open: false })
}

export function removeTab(id: string): void {
  // biome-ignore lint/style/noNonNullAssertion: removing key from store requires undefined
  setTabRuntime(id, undefined!)
}

export function isOpen(id: string): boolean {
  return tabRuntime[id]?.open ?? false
}

export function getStatus(id: string): 'idle' | 'running' | 'exited' {
  return tabRuntime[id]?.status ?? 'idle'
}

export function setTabStatus(
  id: string,
  status: 'idle' | 'running' | 'exited',
  exitCode?: number
): void {
  const current = tabRuntime[id]
  if (current) {
    setTabRuntime(id, { ...current, status, exitCode })
  } else {
    setTabRuntime(id, { open: false, status, exitCode })
  }
}
