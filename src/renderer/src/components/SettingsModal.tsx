import { RotateCcw } from 'lucide-solid'
import { createSignal, For, type JSX, onMount, Show } from 'solid-js'
import { DEFAULT_SETTINGS, type KeyBinding, type KeyboardShortcuts } from '../../../shared/types'
import { formatBinding, setSettings, settings } from '../settingsStore'
import Dialog from './Dialog'
import Select from './ui/Select'
import ToggleSwitch from './ui/ToggleSwitch'

interface SettingsModalProps {
  onClose: () => void
}

const shortcutLabels: Record<keyof KeyboardShortcuts, string> = {
  cycleTabForward: 'Next tab',
  cycleTabBackward: 'Previous tab',
  toggleSidebar: 'Toggle sidebar',
  closeTab: 'Close tab',
  openSettings: 'Open settings',
  cycleAgent: 'Cycle agent'
}

const shellPresets = ['pwsh.exe', 'bash', 'cmd.exe', 'zsh']

export default function SettingsModal(props: SettingsModalProps): JSX.Element {
  const [recording, setRecording] = createSignal<keyof KeyboardShortcuts | null>(null)
  const [conflict, setConflict] = createSignal<string | null>(null)
  const [monoFonts, setMonoFonts] = createSignal<string[]>([])

  onMount(async () => {
    setMonoFonts(await window.settingsAPI.getMonoFonts())
  })

  function startRecording(name: keyof KeyboardShortcuts): void {
    setConflict(null)
    setRecording(name)
  }

  function handleRecordKey(e: KeyboardEvent): void {
    const name = recording()
    if (!name) return
    if (e.key === 'Escape') {
      setRecording(null)
      return
    }
    // Ignore bare modifier presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
    e.preventDefault()

    const binding: KeyBinding = {
      key: e.key,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey
    }

    // Check for conflicts
    const formatted = formatBinding(binding)
    for (const [k, v] of Object.entries(settings.shortcuts) as [
      keyof KeyboardShortcuts,
      KeyBinding
    ][]) {
      if (k !== name && formatBinding(v) === formatted) {
        setConflict(`Conflicts with "${shortcutLabels[k]}"`)
        setRecording(null)
        return
      }
    }

    setSettings('shortcuts', name, binding)
    setConflict(null)
    setRecording(null)
  }

  function resetShortcut(name: keyof KeyboardShortcuts): void {
    setSettings('shortcuts', name, { ...DEFAULT_SETTINGS.shortcuts[name] })
  }

  return (
    <Dialog
      title="Settings"
      onClose={props.onClose}
      footer={
        <button
          type="button"
          onClick={props.onClose}
          class="px-4 py-1.5 bg-accent border-none text-white cursor-pointer text-[13px] rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      }
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: global keyboard capture for shortcut recording */}
      <div onKeyDown={handleRecordKey}>
        {/* Terminal */}
        <section>
          <h3 class="text-muted text-[11px] uppercase tracking-widest font-medium m-0 mb-2">
            Terminal
          </h3>
          <div class="flex flex-col gap-3">
            {/* Font Size */}
            <div class="flex items-center gap-2">
              <span class="text-[13px] text-content w-20 flex-shrink-0">Font size</span>
              <button
                type="button"
                onClick={() =>
                  setSettings('terminal', 'fontSize', Math.max(8, settings.terminal.fontSize - 1))
                }
                class="w-6 h-6 flex items-center justify-center bg-transparent border border-border text-content rounded-lg cursor-pointer hover:border-accent hover:text-accent transition-colors text-[14px]"
              >
                -
              </button>
              <input
                type="number"
                min={8}
                max={24}
                value={settings.terminal.fontSize}
                onInput={(e) => {
                  const v = Number.parseInt(e.currentTarget.value, 10)
                  if (v >= 8 && v <= 24) setSettings('terminal', 'fontSize', v)
                }}
                class="w-12 bg-terminal border border-input text-content text-[13px] text-center px-1 py-1 rounded-lg outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  setSettings('terminal', 'fontSize', Math.min(24, settings.terminal.fontSize + 1))
                }
                class="w-6 h-6 flex items-center justify-center bg-transparent border border-border text-content rounded-lg cursor-pointer hover:border-accent hover:text-accent transition-colors text-[14px]"
              >
                +
              </button>
            </div>

            {/* Font Family */}
            <div>
              <span class="text-[13px] text-content block mb-1">Font family</span>
              <Select<string>
                options={monoFonts()}
                value={settings.terminal.fontFamily || undefined}
                onChange={(font) => setSettings('terminal', 'fontFamily', font ?? '')}
                placeholder="Select a font..."
                itemRender={(font) => (
                  <span class="truncate" style={{ 'font-family': `"${font}", monospace` }}>
                    {font}
                  </span>
                )}
                label="Font family"
              />
            </div>

            {/* Cursor Blink */}
            <ToggleSwitch
              checked={settings.terminal.cursorBlink}
              onChange={(checked) => setSettings('terminal', 'cursorBlink', checked)}
              label="Cursor blink"
            />

            {/* Default Shell */}
            <div>
              <span class="text-[13px] text-content block mb-1">Default shell</span>
              <input
                type="text"
                value={settings.terminal.defaultShell}
                onInput={(e) => setSettings('terminal', 'defaultShell', e.currentTarget.value)}
                placeholder="Platform default"
                class="w-full bg-terminal border border-input text-content text-[13px] px-2 py-1.5 rounded-lg outline-none"
              />
              <div class="flex gap-1.5 mt-2 flex-wrap">
                <For each={shellPresets}>
                  {(preset) => (
                    <button
                      type="button"
                      onClick={() => setSettings('terminal', 'defaultShell', preset)}
                      class="px-2 py-0.5 text-[11px] rounded-lg cursor-pointer border transition-colors"
                      classList={{
                        'bg-accent text-white border-accent':
                          settings.terminal.defaultShell === preset,
                        'bg-transparent text-muted border-border hover:border-accent hover:text-accent':
                          settings.terminal.defaultShell !== preset
                      }}
                    >
                      {preset}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>
        </section>

        {/* Window */}
        <section class="mt-4">
          <h3 class="text-muted text-[11px] uppercase tracking-widest font-medium m-0 mb-2">
            Window
          </h3>
          <ToggleSwitch
            checked={settings.window.rememberBounds}
            onChange={(checked) => setSettings('window', 'rememberBounds', checked)}
            label="Remember window size and position"
          />
        </section>

        {/* Keyboard Shortcuts */}
        <section class="mt-4">
          <h3 class="text-muted text-[11px] uppercase tracking-widest font-medium m-0 mb-2">
            Keyboard Shortcuts
          </h3>
          <Show when={conflict()}>
            <p class="text-[11px] text-error m-0 mb-2">{conflict()}</p>
          </Show>
          <div class="flex flex-col gap-1.5">
            <For each={Object.keys(shortcutLabels) as (keyof KeyboardShortcuts)[]}>
              {(name) => (
                <div class="flex items-center gap-2 py-1">
                  <span class="flex-1 text-[13px] text-content">{shortcutLabels[name]}</span>
                  <Show
                    when={recording() !== name}
                    fallback={
                      <span class="text-[11px] text-accent italic px-2">Press a key combo...</span>
                    }
                  >
                    <span class="text-[11px] font-mono bg-terminal border border-border px-2 py-0.5 rounded-lg text-content">
                      {formatBinding(settings.shortcuts[name])}
                    </span>
                  </Show>
                  <button
                    type="button"
                    onClick={() => startRecording(name)}
                    class="px-2 py-0.5 text-[11px] rounded-lg cursor-pointer border bg-transparent text-muted border-border hover:border-accent hover:text-accent transition-colors"
                  >
                    Record
                  </button>
                  <button
                    type="button"
                    onClick={() => resetShortcut(name)}
                    class="bg-transparent hover:bg-hover border-none text-muted cursor-pointer p-0.5 rounded transition-colors flex items-center opacity-70 hover:opacity-100"
                    title="Reset to default"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              )}
            </For>
          </div>
        </section>
      </div>
    </Dialog>
  )
}
