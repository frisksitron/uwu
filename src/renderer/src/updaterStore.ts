import { createSignal } from 'solid-js'

interface UpdateInfo {
  version: string
  releaseNotes?: string
}

const [updateReady, setUpdateReady] = createSignal<UpdateInfo | null>(null)
const [dismissed, setDismissed] = createSignal(false)

if (window.updaterAPI) {
  window.updaterAPI.onDownloaded((info: unknown) => {
    setUpdateReady(info as UpdateInfo)
    setDismissed(false)
  })
}

export function useUpdater() {
  return {
    updateReady,
    dismissed,
    installUpdate: () => window.updaterAPI?.install(),
    dismiss: () => setDismissed(true)
  }
}
