import { Check, Copy } from 'lucide-solid'
import type { BundledLanguage } from 'shiki'
import { createMemo, createSignal, type JSX, Show } from 'solid-js'
import { getHighlighter } from '../../lib/highlighter'

export default function CodeBlock(props: { code: string; lang: string }): JSX.Element {
  const [copied, setCopied] = createSignal(false)

  const html = createMemo((): string | null => {
    const hl = getHighlighter()
    if (!hl) return null
    try {
      return hl.codeToHtml(props.code, {
        lang: props.lang as BundledLanguage,
        theme: 'vitesse-light'
      })
    } catch {
      return null
    }
  })

  function handleCopy(): void {
    navigator.clipboard.writeText(props.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div class="relative group">
      <button
        type="button"
        onClick={handleCopy}
        class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-all flex items-center gap-1 text-[11px] z-10"
        title={copied() ? 'Copied!' : 'Copy code'}
      >
        <Show
          when={copied()}
          fallback={
            <>
              <Copy size={11} /> Copy
            </>
          }
        >
          <Check size={11} class="text-success" /> Copied
        </Show>
      </button>
      <Show
        when={html()}
        fallback={
          <pre class="bg-sidebar border border-border rounded p-2.5 overflow-x-auto text-[12px] leading-relaxed">
            <code class="text-content">{props.code}</code>
          </pre>
        }
      >
        {(h) => <div class="shiki-wrapper" innerHTML={h()} />}
      </Show>
    </div>
  )
}
