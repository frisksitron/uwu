import { createSignal, type JSX, onMount, Show } from 'solid-js'
import Dialog from './Dialog'

interface CreateWorktreeDialogProps {
  projectPath: string
  projectName: string
  syncFiles: string[]
  onCreated: () => void
  onClose: () => void
}

export default function CreateWorktreeDialog(props: CreateWorktreeDialogProps): JSX.Element {
  const [branchName, setBranchName] = createSignal('')
  const [worktreePath, setWorktreePath] = createSignal('')
  const [error, setError] = createSignal('')
  const [creating, setCreating] = createSignal(false)
  const [basePath, setBasePath] = createSignal('')

  function defaultPath(branch: string): string {
    if (!branch || !basePath()) return ''
    const sanitized = branch.replace(/\//g, '-')
    return `${basePath()}/${props.projectName}.${sanitized}`
  }

  onMount(async () => {
    const bp = await window.worktreeAPI.getDefaultBasePath()
    setBasePath(bp)
  })

  function onBranchInput(val: string): void {
    setBranchName(val)
    setWorktreePath(defaultPath(val))
  }

  async function browse(): Promise<void> {
    const folder = await window.projectAPI.selectFolder()
    if (folder) setWorktreePath(folder)
  }

  async function submit(): Promise<void> {
    const branch = branchName().trim()
    const path = worktreePath().trim()
    if (!branch || !path) return

    setCreating(true)
    setError('')

    const result = await window.worktreeAPI.create(props.projectPath, branch, path, props.syncFiles)

    setCreating(false)

    if (result.success) {
      props.onCreated()
      props.onClose()
    } else {
      setError(result.error || 'Failed to create worktree')
    }
  }

  return (
    <Dialog
      title={`New Worktree — ${props.projectName}`}
      onClose={props.onClose}
      footer={
        <>
          <button
            type="button"
            onClick={props.onClose}
            class="px-4 py-1.5 bg-transparent border border-border text-muted cursor-pointer text-[13px] rounded-sm font-medium hover:text-content transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={creating() || !branchName().trim() || !worktreePath().trim()}
            class="px-4 py-1.5 bg-accent border-none text-white cursor-pointer text-[13px] rounded-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating() ? 'Creating...' : 'Create'}
          </button>
        </>
      }
    >
      <section>
        <h3 class="text-muted text-[11px] uppercase tracking-widest font-medium m-0 mb-2">
          Branch Name
        </h3>
        <input
          type="text"
          value={branchName()}
          onInput={(e) => onBranchInput(e.currentTarget.value)}
          placeholder="feature/my-branch"
          autofocus
          class="w-full bg-terminal border border-input text-content text-[13px] px-2 py-1.5 rounded-sm outline-none"
        />
      </section>

      <section>
        <h3 class="text-muted text-[11px] uppercase tracking-widest font-medium m-0 mb-2">
          Worktree Path
        </h3>
        <div class="flex gap-1">
          <input
            type="text"
            value={worktreePath()}
            onInput={(e) => setWorktreePath(e.currentTarget.value)}
            placeholder="Path for the worktree"
            class="flex-1 bg-terminal border border-input text-content text-[13px] px-2 py-1.5 rounded-sm outline-none min-w-0"
          />
          <button
            type="button"
            onClick={browse}
            class="px-2 py-1.5 text-[11px] rounded-sm cursor-pointer border bg-transparent text-muted border-border hover:border-accent hover:text-accent transition-colors flex-shrink-0"
          >
            Browse
          </button>
        </div>
      </section>

      <Show when={error()}>
        <div class="text-[13px] px-2 py-1.5 rounded-sm text-error bg-error/10">{error()}</div>
      </Show>
    </Dialog>
  )
}
