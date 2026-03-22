import remarkGfm from 'remark-gfm'
import { type JSX, children as resolveChildren } from 'solid-js'
import { SolidMarkdown } from 'solid-markdown'
import CodeBlock from './CodeBlock'

interface MessageContentProps {
  text: string
}

export default function MessageContent(props: MessageContentProps): JSX.Element {
  return (
    <div class="markdown">
      <SolidMarkdown
        renderingStrategy="reconcile"
        children={props.text}
        remarkPlugins={[remarkGfm]}
        components={{
          pre(p) {
            return <>{p.children}</>
          },
          code(p) {
            const codeProps = p as unknown as Record<string, unknown>
            if (codeProps.inline) {
              return (
                <code class="bg-border/50 text-accent px-1 py-0.5 rounded text-[12px]">
                  {p.children}
                </code>
              )
            }
            const lang = ((codeProps.class as string) || '').replace('language-', '') || 'text'
            const resolved = resolveChildren(() => p.children)
            const text = () => String(resolved() ?? '').replace(/\n$/, '')
            return <CodeBlock code={text()} lang={lang} />
          }
        }}
      />
    </div>
  )
}
