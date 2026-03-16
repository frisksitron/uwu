import { createSignal } from 'solid-js'

interface UpdateInfo {
  version: string
  releaseNotes?: string
}

const [updateReady, setUpdateReady] = createSignal<UpdateInfo | null>(null)
const [updateError, setUpdateError] = createSignal<{ message: string; stack?: string } | null>(null)
const [dismissed, setDismissed] = createSignal(false)

if (window.updaterAPI) {
  window.updaterAPI.onDownloaded((info: unknown) => {
    setUpdateReady(info as UpdateInfo)
    setDismissed(false)
  })
  window.updaterAPI.onError((error) => {
    setUpdateError(error)
    console.error('[updater] Error:', error.message)
  })
}

export function useUpdater() {
  return {
    updateReady,
    updateError,
    dismissed,
    installUpdate: () => window.updaterAPI?.install(),
    dismiss: () => setDismissed(true)
  }
}
