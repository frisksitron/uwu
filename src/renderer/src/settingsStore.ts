import { createSignal } from 'solid-js'
import { createStore, reconcile, unwrap } from 'solid-js/store'
import { type AppSettings, DEFAULT_SETTINGS, type KeyBinding } from '../../shared/types'

const [settings, setSettings] = createStore<AppSettings>(structuredClone(DEFAULT_SETTINGS))
const [settingsCorrupted, setSettingsCorrupted] = createSignal(false)

export { settings, setSettings, settingsCorrupted }

export async function loadSettings(): Promise<void> {
  const result = (await window.persistAPI.load('settings')) as {
    data: AppSettings
    corrupted: boolean
  }
  setSettings(reconcile(result.data))
  if (result.corrupted) setSettingsCorrupted(true)
}

export function saveSettings(): void {
  window.persistAPI.update('settings', unwrap(settings))
}

export function resetSettings(): void {
  const defaults = structuredClone(DEFAULT_SETTINGS)
  window.persistAPI.update('settings', defaults)
  setSettings(reconcile(defaults))
  setSettingsCorrupted(false)
}

export function dismissCorrupted(): void {
  setSettingsCorrupted(false)
}

export function matchesBinding(e: KeyboardEvent, binding: KeyBinding): boolean {
  return (
    e.key.toLowerCase() === binding.key.toLowerCase() &&
    e.ctrlKey === binding.ctrlKey &&
    e.shiftKey === binding.shiftKey &&
    e.altKey === binding.altKey &&
    !e.metaKey
  )
}

export function formatBinding(binding: KeyBinding): string {
  const parts: string[] = []
  if (binding.ctrlKey) parts.push('Ctrl')
  if (binding.shiftKey) parts.push('Shift')
  if (binding.altKey) parts.push('Alt')
  const keyName = binding.key === ' ' ? 'Space' : binding.key
  parts.push(keyName.length === 1 ? keyName.toUpperCase() : keyName)
  return parts.join('+')
}
