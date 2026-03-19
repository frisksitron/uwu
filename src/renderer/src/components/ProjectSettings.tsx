import { Plus, Trash2 } from 'lucide-solid'
import { createSignal, For, Index, type JSX, Show } from 'solid-js'
import type { Project, ScriptTab, WorkspaceTab } from '../types'
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
    workspaces: initWorkspaces
  } = props.project // eslint-disable-line solid/reactivity -- intentionally capturing initial values

  // Derive scripts from workspace items
  const allItems = Object.values(initWorkspaces ?? {}).flat()
  const scriptItems = allItems.filter((i): i is ScriptTab => i.type === 'script')
  const [shellOverride, setShellOverride] = createSignal(initShell ?? '')
  const [envVars, setEnvVars] = createSignal<{ key: string; value: string }[]>(
    Object.entries(initEnv ?? {}).map(([key, value]) => ({ key, value }))
  )
  const [syncFiles, setSyncFiles] = createSignal<string[]>(initSync ?? [])

  // Unique scripts from workspace items
  const uniqueScripts = new Map<string, string>()
  for (const s of scriptItems) {
    if (!uniqueScripts.has(s.name)) uniqueScripts.set(s.name, s.command)
  }
  const [scripts, setScripts] = createSignal<{ name: string; command: string }[]>(
    [...uniqueScripts.entries()].map(([name, command]) => ({ name, command }))
  )

  function addEnvVar(): void {
    setEnvVars((prev) => [...prev, { key: '', value: '' }])
  }

  function updateEnvVar(index: number, field: 'key' | 'value', val: string): void {
    setEnvVars((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)))
  }

  function removeEnvVar(index: number): void {
    setEnvVars((prev) => prev.filter((_, i) => i !== index))
  }

  function addScript(): void {
    setScripts((prev) => [...prev, { name: '', command: '' }])
  }

  function updateScript(index: number, field: 'name' | 'command', val: string): void {
    setScripts((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)))
  }

  function removeScript(index: number): void {
    setScripts((prev) => prev.filter((_, i) => i !== index))
  }

  function save(): void {
    const envObj: Record<string, string> = {}
    for (const { key, value } of envVars()) {
      const k = key.trim()
      if (k) envObj[k] = value
    }

    // Build script map from the scripts signal
    const scriptMap = new Map<string, string>()
    for (const { name, command } of scripts()) {
      const n = name?.trim()
      const c = command?.trim()
      if (n && c) scriptMap.set(n, c)
    }

    // Apply scripts back to all workspaces
    const newWorkspaces: Record<string, WorkspaceTab[]> = {}

    for (const [cwd, items] of Object.entries(initWorkspaces ?? {})) {
      // Keep non-script items
      const nonScripts = items.filter((i) => i.type !== 'script')

      // Build new script items
      const newScriptItems: WorkspaceTab[] = [...scriptMap.entries()].map(([name, command]) => ({
        id: crypto.randomUUID(),
        type: 'script' as const,
        name,
        command
      }))

      newWorkspaces[cwd] = [...newScriptItems, ...nonScripts]
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

  return (
    <Dialog
      title={`${props.project.name} — Settings`}
      onClose={props.onClose}
      footer={
        <button
          type="button"
          onClick={save}
          class="px-4 py-1.5 bg-accent border-none text-white cursor-pointer text-[13px] rounded-sm font-medium hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      }
    >
      {/* Shell Override */}
      <section>
        <h3 class="text-muted text-[11px] uppercase tracking-widest font-medium m-0 mb-2">
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
          <h3 class="text-muted text-[11px] uppercase tracking-widest font-medium m-0 mb-2">
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
                    class="flex-1 bg-terminal border border-input text-content text-[13px] px-1.5 py-1 rounded-sm outline-none font-mono min-w-0"
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

      {/* Scripts */}
      <section>
        <h3 class="text-muted text-[11px] uppercase tracking-widest font-medium m-0 mb-2">
          Scripts
        </h3>
        <div class="flex flex-col gap-1.5">
          <Index each={scripts()}>
            {(entry, index) => (
              <div class="flex items-center gap-1">
                <input
                  type="text"
                  value={entry().name}
                  onInput={(e) => updateScript(index, 'name', e.currentTarget.value)}
                  placeholder="name"
                  class="w-[120px] bg-terminal border border-input text-content text-[13px] px-1.5 py-1 rounded-sm outline-none font-mono min-w-0"
                />
                <input
                  type="text"
                  value={entry().command}
                  onInput={(e) => updateScript(index, 'command', e.currentTarget.value)}
                  placeholder="command"
                  class="flex-1 bg-terminal border border-input text-content text-[13px] px-1.5 py-1 rounded-sm outline-none font-mono min-w-0"
                />
                <button
                  type="button"
                  onClick={() => removeScript(index)}
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
          onClick={addScript}
          class="flex items-center gap-1 mt-2 bg-transparent border-none text-muted text-[11px] cursor-pointer hover:text-accent p-0"
        >
          <Plus size={10} />
          Add script
        </button>
      </section>

      {/* Environment Variables */}
      <section>
        <h3 class="text-muted text-[11px] uppercase tracking-widest font-medium m-0 mb-2">
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
                  class="flex-1 bg-terminal border border-input text-content text-[13px] px-1.5 py-1 rounded-sm outline-none font-mono min-w-0"
                />
                <span class="text-muted text-[13px]">=</span>
                <input
                  type="text"
                  value={entry().value}
                  onInput={(e) => updateEnvVar(index, 'value', e.currentTarget.value)}
                  placeholder="value"
                  class="flex-1 bg-terminal border border-input text-content text-[13px] px-1.5 py-1 rounded-sm outline-none font-mono min-w-0"
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
