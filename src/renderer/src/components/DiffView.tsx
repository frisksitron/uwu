import { GitCompareArrows, Info } from 'lucide-solid'
import { createSignal, type JSX, onMount, Show } from 'solid-js'
import type { DiffResult } from '../../../shared/types'
import DiffFileList from './diff/DiffFileList'
import DiffSplitView from './diff/DiffSplitView'
import DiffToolbar, { type DiffMode, type ViewMode } from './diff/DiffToolbar'
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
  const [viewMode, setViewMode] = createSignal<ViewMode>('unified')
  const [selectedFileIdx, setSelectedFileIdx] = createSignal(0)
  const [fileListWidth, setFileListWidth] = createSignal(200)
  const [fileListCollapsed, setFileListCollapsed] = createSignal(false)

  const fileRefs = new Map<number, HTMLDivElement>()

  async function fetchDiff(): Promise<void> {
    setLoading(true)
    try {
      const result = await window.diffAPI.get(props.cwd, diffMode())
      setDiffResult(result)
      setSelectedFileIdx(0)
    } catch (err) {
      setDiffResult({
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        hasDifftastic: false,
        error: (err as Error).message
      })
    } finally {
      setLoading(false)
    }
  }

  onMount(() => fetchDiff())

  function handleDiffModeChange(mode: DiffMode): void {
    setDiffMode(mode)
    fetchDiff()
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
        viewMode={viewMode()}
        totalAdditions={result()?.totalAdditions ?? 0}
        totalDeletions={result()?.totalDeletions ?? 0}
        loading={loading()}
        onDiffModeChange={handleDiffModeChange}
        onViewModeChange={setViewMode}
        onRefresh={fetchDiff}
        fileListCollapsed={fileListCollapsed()}
        onToggleFileList={() => setFileListCollapsed((c) => !c)}
      />

      <Show when={result() && !result()?.hasDifftastic}>
        <div class="flex items-center gap-1.5 px-3 py-1 bg-sidebar/50 border-b border-border/40 text-[10px] text-muted">
          <Info size={11} />
          <span>
            Using basic git diff. Install <span class="font-semibold">difftastic</span> for
            structural diffs.
          </span>
        </div>
      </Show>

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
            <p class="text-[12px] opacity-60">
              {loading() ? 'Loading diff...' : 'No changes detected'}
            </p>
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
            />
          </Show>
          <div class="flex-1 overflow-y-auto">
            <Show
              when={viewMode() === 'unified'}
              fallback={<DiffSplitView files={files()} fileRefs={fileRefs} />}
            >
              <DiffUnifiedView files={files()} fileRefs={fileRefs} />
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
