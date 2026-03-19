import { GitCompareArrows } from 'lucide-solid'
import { createSignal, type JSX, onMount, Show } from 'solid-js'
import type { DiffResult } from '../../../shared/types'
import DiffFileList from './diff/DiffFileList'
import DiffToolbar, { type DiffMode } from './diff/DiffToolbar'
import DiffUnifiedView from './diff/DiffUnifiedView'

interface DiffViewProps {
  tabId: string
  visible: boolean
  cwd: string
  projectId: string
}

export default function DiffView(props: DiffViewProps): JSX.Element {
  const [diffResult, setDiffResult] = createSignal<DiffResult | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [diffMode, setDiffMode] = createSignal<DiffMode>('unstaged')
  const [selectedFileIdx, setSelectedFileIdx] = createSignal(0)
  const [fileListWidth, setFileListWidth] = createSignal(200)
  const [fileListCollapsed, setFileListCollapsed] = createSignal(false)

  const fileRefs = new Map<number, HTMLDivElement>()

  async function fetchDiff(mode?: DiffMode): Promise<void> {
    fileRefs.clear()
    setLoading(true)
    try {
      const result = await window.diffAPI.get(props.cwd, mode ?? diffMode())
      setDiffResult(result)
      setSelectedFileIdx(0)
    } catch (err) {
      setDiffResult({
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        error: (err as Error).message
      })
    } finally {
      setLoading(false)
    }
  }

  onMount(() => fetchDiff())

  function handleDiffModeChange(mode: DiffMode): void {
    setDiffMode(mode)
    fetchDiff(mode)
  }

  function handleFileSelect(idx: number): void {
    setSelectedFileIdx(idx)
    const el = fileRefs.get(idx)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function startResize(e: MouseEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = fileListWidth()
    const onMouseMove = (e: MouseEvent): void => {
      const delta = e.clientX - startX
      setFileListWidth(Math.min(Math.max(startWidth + delta, 120), 400))
    }
    const onMouseUp = (): void => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const result = () => diffResult()
  const files = () => result()?.files ?? []

  return (
    <div
      class="absolute top-0 left-0 w-full h-full flex flex-col bg-app"
      classList={{ invisible: !props.visible }}
    >
      <DiffToolbar
        diffMode={diffMode()}
        totalAdditions={result()?.totalAdditions ?? 0}
        totalDeletions={result()?.totalDeletions ?? 0}
        loading={loading()}
        onDiffModeChange={handleDiffModeChange}
        onRefresh={fetchDiff}
        fileListCollapsed={fileListCollapsed()}
        onToggleFileList={() => setFileListCollapsed((c) => !c)}
      />

      <Show when={result()?.error}>
        <div class="px-3 py-2 text-[11px] text-error bg-error/5 border-b border-error/20">
          {result()?.error}
        </div>
      </Show>

      <Show
        when={files().length > 0}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center gap-2 text-muted select-none">
            <GitCompareArrows size={28} class="opacity-40" />
            <p class="text-[13px] opacity-60">
              {loading() ? 'Loading diff...' : 'No changes detected'}
            </p>
            <Show when={!loading()}>
              <p class="text-[11px] opacity-40">Switch between Unstaged, Staged, and All above</p>
            </Show>
          </div>
        }
      >
        <div class="flex-1 flex overflow-hidden">
          <Show when={!fileListCollapsed()}>
            <div
              style={{ width: `${fileListWidth()}px`, 'min-width': `${fileListWidth()}px` }}
              class="h-full flex-shrink-0"
            >
              <DiffFileList
                files={files()}
                selectedIdx={selectedFileIdx()}
                onSelect={handleFileSelect}
              />
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: drag resize handle */}
            <div
              tabIndex={0}
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={fileListWidth()}
              aria-valuemin={120}
              aria-valuemax={400}
              class="w-1 flex-shrink-0 bg-border hover:bg-accent cursor-col-resize transition-colors"
              onMouseDown={startResize}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  setFileListWidth((w) => Math.max(w - 10, 120))
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault()
                  setFileListWidth((w) => Math.min(w + 10, 400))
                }
              }}
            />
          </Show>
          <div class="flex-1 overflow-y-auto">
            <DiffUnifiedView files={files()} fileRefs={fileRefs} />
          </div>
        </div>
      </Show>
    </div>
  )
}
