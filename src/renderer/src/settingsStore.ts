import { createSignal } from 'solid-js'
import { createStore, reconcile, unwrap } from 'solid-js/store'
import { type AppSettings, DEFAULT_SETTINGS, type KeyBinding } from '../../shared/types'

const [settings, setSettings] = createStore<AppSettings>(structuredClone(DEFAULT_SETTINGS))
const [settingsCorrupted, setSettingsCorrupted] = createSignal(false)

export { settings, setSettings, settingsCorrupted }

export async function loadSettings(): Promise<void> {
  const { data, corrupted } = await window.settingsAPI.load()
  setSettings(reconcile(data))
  if (corrupted) setSettingsCorrupted(true)
}

export async function saveSettings(): Promise<void> {
  await window.settingsAPI.save(unwrap(settings))
}

export async function resetSettings(): Promise<void> {
  const defaults = await window.settingsAPI.reset()
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
    e.altKey === binding.altKey
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
