import { Maximize2, Minus, Square, X } from 'lucide-solid'
import { createSignal, type JSX, onCleanup, onMount } from 'solid-js'

export default function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = createSignal(false)

  onMount(() => {
    let unsub: (() => void) | undefined

    onCleanup(() => unsub?.())
    ;(async () => {
      const maximized = await window.windowAPI.isMaximized()
      setIsMaximized(maximized)
      unsub = window.windowAPI.onMaximizedChange((val) => setIsMaximized(val))
    })()
  })

  return (
    <div
      class="flex items-center w-full h-8 bg-sidebar border-b border-border shrink-0 select-none"
      style={{ '-webkit-app-region': 'drag' } as JSX.CSSProperties}
    >
      <div class="flex-1 flex items-center px-3 text-heading text-[12px] font-medium">uwu</div>
      <div
        class="flex items-center"
        style={{ '-webkit-app-region': 'no-drag' } as JSX.CSSProperties}
      >
        <button
          type="button"
          class="flex items-center justify-center w-10 h-8 text-heading hover:bg-active transition-colors"
          onClick={() => window.windowAPI.minimize()}
          title="Minimize"
        >
          <Minus size={12} />
        </button>
        <button
          type="button"
          class="flex items-center justify-center w-10 h-8 text-heading hover:bg-active transition-colors"
          onClick={() => window.windowAPI.maximize()}
          title={isMaximized() ? 'Restore' : 'Maximize'}
        >
          {isMaximized() ? <Maximize2 size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          class="flex items-center justify-center w-10 h-8 text-heading hover:bg-active transition-colors"
          onClick={() => window.windowAPI.close()}
          title="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
