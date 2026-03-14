const actions = new Map<string, { run: () => void; stop: () => void }>()

export function registerScriptActions(
  tabId: string,
  fns: { run: () => void; stop: () => void }
): void {
  actions.set(tabId, fns)
}

export function unregisterScriptActions(tabId: string): void {
  actions.delete(tabId)
}

export function runScript(tabId: string): void {
  actions.get(tabId)?.run()
}

export function stopScript(tabId: string): void {
  actions.get(tabId)?.stop()
}
