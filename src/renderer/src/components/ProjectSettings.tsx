import { Plus, Trash2 } from 'lucide-solid'
import { createSignal, For, Index, type JSX, Show } from 'solid-js'
import type { CustomScriptTab, Project, ScriptTab, WorkspaceTab } from '../types'
import Dialog from './Dialog'

interface ProjectSettingsProps {
  project: Project
  isGitProject?: boolean
  onUpdate: (updates: Partial<Project>) => void
  onClose: () => void
}

export default function ProjectSettings(props: ProjectSettingsProps): JSX.Element {
  const {
    shellOverride: initShell,
    envVars: initEnv,
    syncFiles: initSync,
    scripts: initScripts,
    workspaces: initWorkspaces
  } = props.project // eslint-disable-line solid/reactivity -- intentionally capturing initial values

  // Derive hidden scripts from workspace items
  const allItems = Object.values(initWorkspaces ?? {}).flat()
  const scriptItems = allItems.filter((i): i is ScriptTab => i.type === 'script')
  const customScriptItems = allItems.filter((i): i is CustomScriptTab => i.type === 'custom-script')
  // Deduplicate by name
  const uniqueHidden = new Set(scriptItems.filter((s) => s.hidden).map((s) => s.name))

  const [hiddenScripts, setHiddenScripts] = createSignal<string[]>([...uniqueHidden])
  const [shellOverride, setShellOverride] = createSignal(initShell ?? '')
  const [envVars, setEnvVars] = createSignal<{ key: string; value: string }[]>(
    Object.entries(initEnv ?? {}).map(([key, value]) => ({ key, value }))
  )
  const [syncFiles, setSyncFiles] = createSignal<string[]>(initSync ?? [])

  // Unique custom scripts from workspace items
  const uniqueCustom = new Map<string, string>()
  for (const cs of customScriptItems) {
    if (!uniqueCustom.has(cs.name)) uniqueCustom.set(cs.name, cs.command)
  }
  const [customScripts, setCustomScripts] = createSignal<{ name: string; command: string }[]>(
    [...uniqueCustom.entries()].map(([name, command]) => ({ name, command }))
  )

  function toggleScript(name: string): void {
    setHiddenScripts((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    )
  }

  function addEnvVar(): void {
    setEnvVars((prev) => [...prev, { key: '', value: '' }])
  }

  function updateEnvVar(index: number, field: 'key' | 'value', val: string): void {
    setEnvVars((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)))
  }

  function removeEnvVar(index: number): void {
    setEnvVars((prev) => prev.filter((_, i) => i !== index))
  }

  function addCustomScript(): void {
    setCustomScripts((prev) => [...prev, { name: '', command: '' }])
  }

  function updateCustomScript(index: number, field: 'name' | 'command', val: string): void {
    setCustomScripts((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)))
  }

  function removeCustomScript(index: number): void {
    setCustomScripts((prev) => prev.filter((_, i) => i !== index))
  }

  function save(): void {
    const envObj: Record<string, string> = {}
    for (const { key, value } of envVars()) {
      const k = key.trim()
      if (k) envObj[k] = value
    }
    const csObj: Record<string, string> = {}
    for (const { name, command } of customScripts()) {
      const n = name.trim()
      if (n && command.trim()) csObj[n] = command.trim()
    }

    // Apply hidden state and custom scripts back to all workspaces
    const hidden = new Set(hiddenScripts())
    const newWorkspaces: Record<string, WorkspaceTab[]> = {}

    for (const [cwd, items] of Object.entries(initWorkspaces ?? {})) {
      // Update hidden state on script items
      let updated: WorkspaceTab[] = items.map((item) => {
        if (item.type === 'script') {
          return { ...item, hidden: hidden.has(item.name) || undefined }
        }
        return item
      })

      // Remove old custom-script items
      updated = updated.filter((i) => i.type !== 'custom-script')

      // Add new custom-script items
      for (const [name, command] of Object.entries(csObj)) {
        updated.push({
          id: crypto.randomUUID(),
          type: 'custom-script',
          name,
          command
        })
      }

      newWorkspaces[cwd] = updated
    }

    props.onUpdate({
      workspaces: newWorkspaces,
      shellOverride: shellOverride().trim() || undefined,
      envVars: Object.keys(envObj).length > 0 ? envObj : undefined,
      syncFiles: syncFiles().length > 0 ? syncFiles() : undefined
    })
    props.onClose()
  }

  const shellPresets = ['pwsh.exe', 'bash', 'cmd.exe', 'zsh']

  // All script names: detected + custom
  const scriptNames = [
    ...Object.keys(initScripts),
    ...[...uniqueCustom.keys()].filter((k) => !(k in initScripts))
  ]

  return (
    <Dialog
      title={`${props.project.name} — Settings`}
      onClose={props.onClose}
      footer={
        <button
          type="button"
          onClick={save}
          class="px-4 py-1.5 bg-accent border-none text-white cursor-pointer text-[12px] rounded-sm font-medium hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      }
    >
      {/* Script Visibility */}
      <section>
        <h3 class="text-muted text-[10px] uppercase tracking-widest font-medium m-0 mb-2">
          Script Visibility
        </h3>
        {scriptNames.length === 0 ? (
          <p class="text-[12px] text-muted italic m-0">No scripts in this project.</p>
        ) : (
          <div class="flex flex-col gap-1">
            <For each={scriptNames}>
              {(name) => (
                <label class="flex items-center gap-2 text-[13px] cursor-pointer hover:bg-hover px-1 py-0.5 rounded-sm">
                  <input
                    type="checkbox"
                    checked={!hiddenScripts().includes(name)}
                    onChange={() => toggleScript(name)}
                    class="accent-accent"
                  />
                  <span class="truncate">{name}</span>
                </label>
              )}
            </For>
          </div>
        )}
      </section>

      {/* Shell Override */}
      <section>
        <h3 class="text-muted text-[10px] uppercase tracking-widest font-medium m-0 mb-2">
          Shell Override
        </h3>
        <input
          type="text"
          value={shellOverride()}
          onInput={(e) => setShellOverride(e.currentTarget.value)}
          placeholder="Default shell"
          class="w-full bg-terminal border border-input text-content text-[13px] px-2 py-1.5 rounded-sm outline-none"
        />
        <div class="flex gap-1.5 mt-2 flex-wrap">
          <For each={shellPresets}>
            {(preset) => (
              <button
                type="button"
                onClick={() => setShellOverride(preset)}
                class="px-2 py-0.5 text-[11px] rounded-sm cursor-pointer border transition-colors"
                classList={{
                  'bg-accent text-white border-accent': shellOverride() === preset,
                  'bg-transparent text-muted border-border hover:border-accent hover:text-accent':
                    shellOverride() !== preset
                }}
              >
                {preset}
              </button>
            )}
          </For>
        </div>
      </section>

      {/* Worktree File Sync — only for git projects */}
      <Show when={props.isGitProject}>
        <section>
          <h3 class="text-muted text-[10px] uppercase tracking-widest font-medium m-0 mb-2">
            Worktree File Sync
          </h3>
          <div class="flex flex-col gap-1.5">
            <Index each={syncFiles()}>
              {(file, index) => (
                <div class="flex items-center gap-1">
                  <input
                    type="text"
                    value={file()}
                    onInput={(e) =>
                      setSyncFiles((prev) =>
                        prev.map((f, i) => (i === index ? e.currentTarget.value : f))
                      )
                    }
                    placeholder="relative/path"
                    class="flex-1 bg-terminal border border-input text-content text-[12px] px-1.5 py-1 rounded-sm outline-none font-mono min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setSyncFiles((prev) => prev.filter((_, i) => i !== index))}
                    class="bg-transparent hover:bg-hover border-none text-content cursor-pointer p-0.5 rounded transition-colors flex items-center opacity-70 hover:opacity-100 flex-shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </Index>
          </div>
          <button
            type="button"
            onClick={async () => {
              const files = await window.projectAPI.selectFiles(props.project.path)
              if (files.length === 0) return
              setSyncFiles((prev) => [...prev, ...files.filter((f) => !prev.includes(f))])
            }}
            class="flex items-center gap-1 mt-2 bg-transparent border-none text-muted text-[11px] cursor-pointer hover:text-accent p-0"
          >
            <Plus size={10} />
            Add file
          </button>
        </section>
      </Show>

      {/* Custom Scripts */}
      <section>
        <h3 class="text-muted text-[10px] uppercase tracking-widest font-medium m-0 mb-2">
          Custom Scripts
        </h3>
        <div class="flex flex-col gap-1.5">
          <Index each={customScripts()}>
            {(entry, index) => (
              <div class="flex items-center gap-1">
                <input
                  type="text"
                  value={entry().name}
                  onInput={(e) => updateCustomScript(index, 'name', e.currentTarget.value)}
                  placeholder="name"
                  class="w-[120px] bg-terminal border border-input text-content text-[12px] px-1.5 py-1 rounded-sm outline-none font-mono min-w-0"
                />
                <input
                  type="text"
                  value={entry().command}
                  onInput={(e) => updateCustomScript(index, 'command', e.currentTarget.value)}
                  placeholder="command"
                  class="flex-1 bg-terminal border border-input text-content text-[12px] px-1.5 py-1 rounded-sm outline-none font-mono min-w-0"
                />
                <button
                  type="button"
                  onClick={() => removeCustomScript(index)}
                  class="bg-transparent hover:bg-hover border-none text-content cursor-pointer p-0.5 rounded transition-colors flex items-center opacity-70 hover:opacity-100 flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </Index>
        </div>
        <button
          type="button"
          onClick={addCustomScript}
          class="flex items-center gap-1 mt-2 bg-transparent border-none text-muted text-[11px] cursor-pointer hover:text-accent p-0"
        >
          <Plus size={10} />
          Add script
        </button>
      </section>

      {/* Environment Variables */}
      <section>
        <h3 class="text-muted text-[10px] uppercase tracking-widest font-medium m-0 mb-2">
          Environment Variables
        </h3>
        <div class="flex flex-col gap-1.5">
          <Index each={envVars()}>
            {(entry, index) => (
              <div class="flex items-center gap-1">
                <input
                  type="text"
                  value={entry().key}
                  onInput={(e) => updateEnvVar(index, 'key', e.currentTarget.value)}
                  placeholder="KEY"
                  class="flex-1 bg-terminal border border-input text-content text-[12px] px-1.5 py-1 rounded-sm outline-none font-mono min-w-0"
                />
                <span class="text-muted text-[12px]">=</span>
                <input
                  type="text"
                  value={entry().value}
                  onInput={(e) => updateEnvVar(index, 'value', e.currentTarget.value)}
                  placeholder="value"
                  class="flex-1 bg-terminal border border-input text-content text-[12px] px-1.5 py-1 rounded-sm outline-none font-mono min-w-0"
                />
                <button
                  type="button"
                  onClick={() => removeEnvVar(index)}
                  class="bg-transparent hover:bg-hover border-none text-content cursor-pointer p-0.5 rounded transition-colors flex items-center opacity-70 hover:opacity-100 flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </Index>
        </div>
        <button
          type="button"
          onClick={addEnvVar}
          class="flex items-center gap-1 mt-2 bg-transparent border-none text-muted text-[11px] cursor-pointer hover:text-accent p-0"
        >
          <Plus size={10} />
          Add variable
        </button>
      </section>
    </Dialog>
  )
}
