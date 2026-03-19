import { Check, Copy } from 'lucide-solid'
import type { BundledLanguage } from 'shiki'
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js'
import { SolidMarkdown } from 'solid-markdown'
import { getHighlighter } from '../../lib/highlighter'

interface MessageContentProps {
  text: string
}

interface TextSegment {
  type: 'text'
  content: string
}
interface CodeSegment {
  type: 'code'
  lang: string
  content: string
}
type Segment = TextSegment | CodeSegment

/** Split markdown into text and fenced code block segments */
function splitMarkdown(text: string): Segment[] {
  const segments: Segment[] = []
  // Match fenced code blocks: ```lang\n...\n```
  const regex = /^```(\w*)\n([\s\S]*?)^```\s*$/gm
  let lastIndex = 0

  for (const match of text.matchAll(regex)) {
    const idx = match.index ?? 0
    if (idx > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, idx) })
    }
    segments.push({
      type: 'code',
      lang: match[1] || 'text',
      content: match[2].replace(/\n$/, '')
    })
    lastIndex = idx + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return segments
}

function CodeBlock(props: { code: string; lang: string }): JSX.Element {
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
          <pre class="bg-app border border-border rounded p-2.5 overflow-x-auto text-[12px] leading-relaxed">
            <code class="text-content">{props.code}</code>
          </pre>
        }
      >
        {(h) => <div class="shiki-wrapper" innerHTML={h()} />}
      </Show>
    </div>
  )
}

function MarkdownText(props: { text: string }): JSX.Element {
  return (
    <SolidMarkdown
      renderingStrategy="reconcile"
      children={props.text}
      components={{
        code(p) {
          return (
            <code class="bg-border/50 text-accent px-1 py-0.5 rounded text-[12px]">
              {p.children}
            </code>
          )
        }
      }}
    />
  )
}

export default function MessageContent(props: MessageContentProps): JSX.Element {
  const segments = createMemo(() => splitMarkdown(props.text))

  return (
    <div class="markdown">
      <For each={segments()}>
        {(seg) =>
          seg.type === 'code' ? (
            <CodeBlock code={seg.content} lang={seg.lang} />
          ) : (
            <MarkdownText text={seg.content} />
          )
        }
      </For>
    </div>
  )
}
