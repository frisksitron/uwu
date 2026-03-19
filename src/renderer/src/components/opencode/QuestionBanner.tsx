import { Check, Sparkles, X } from 'lucide-solid'
import { createSignal, For, type JSX, Show } from 'solid-js'
import type { OcQuestion } from '../../opcodeChat'

interface QuestionBannerProps {
  questions: OcQuestion[]
  onRespond: (requestId: string, answers: Array<Array<string>>) => void
  onReject: (requestId: string) => void
}

export default function QuestionBanner(props: QuestionBannerProps): JSX.Element {
  return (
    <Show when={props.questions.length > 0}>
      <div class="flex flex-col gap-2">
        <For each={props.questions}>
          {(q) => (
            <QuestionItem question={q} onRespond={props.onRespond} onReject={props.onReject} />
          )}
        </For>
      </div>
    </Show>
  )
}

function QuestionItem(props: {
  question: OcQuestion
  onRespond: (requestId: string, answers: Array<Array<string>>) => void
  onReject: (requestId: string) => void
}): JSX.Element {
  // Track selected options per question index
  const [selections, setSelections] = createSignal<Array<Set<string>>>(
    props.question.questions.map(() => new Set<string>())
  )
  const [customTexts, setCustomTexts] = createSignal<string[]>(
    props.question.questions.map(() => '')
  )

  function toggleOption(qIdx: number, label: string, multiple: boolean): void {
    setSelections((prev) => {
      const next = prev.map((s) => new Set(s))
      if (multiple) {
        if (next[qIdx].has(label)) {
          next[qIdx].delete(label)
        } else {
          next[qIdx].add(label)
        }
      } else {
        next[qIdx] = new Set([label])
      }
      return next
    })
  }

  function setCustomText(qIdx: number, text: string): void {
    setCustomTexts((prev) => {
      const next = [...prev]
      next[qIdx] = text
      return next
    })
  }

  function handleRespond(): void {
    const answers = props.question.questions.map((_qi, idx) => {
      const selected = [...selections()[idx]]
      const custom = customTexts()[idx].trim()
      if (custom) {
        selected.push(custom)
      }
      return selected
    })
    props.onRespond(props.question.id, answers)
  }

  return (
    <div class="flex flex-col gap-3 text-[13px]">
      {/* Header */}
      <div class="flex items-center gap-1.5">
        <Sparkles size={12} class="text-heading" />
        <span class="text-heading text-[11px] font-semibold tracking-wider uppercase">
          Question
        </span>
      </div>

      {/* Question blocks */}
      <For each={props.question.questions}>
        {(qi, qIdx) => (
          <div
            class="flex flex-col gap-1.5"
            classList={{
              'border-t border-border/60 pt-2': qIdx() > 0
            }}
          >
            <span class="text-content font-semibold text-[13px]">{qi.header}</span>
            <span class="text-muted text-[11px] leading-relaxed">{qi.question}</span>

            {/* Option cards */}
            <Show when={qi.options && qi.options.length > 0}>
              <div class="flex flex-col gap-1.5 mt-1">
                <For each={qi.options}>
                  {(opt) => {
                    const isSelected = (): boolean => selections()[qIdx()]?.has(opt.label)
                    const isMultiple = (): boolean => qi.multiple ?? false
                    return (
                      <button
                        type="button"
                        onClick={() => toggleOption(qIdx(), opt.label, isMultiple())}
                        class="flex items-center gap-2 w-full text-left cursor-pointer rounded-md border px-2.5 py-1.5 text-[11px] transition-all"
                        classList={{
                          'bg-accent/15 border-accent/50 text-accent ring-1 ring-accent/20':
                            isSelected(),
                          'bg-app border-border text-content hover:border-accent/40 hover:bg-accent/5':
                            !isSelected()
                        }}
                      >
                        {/* Indicator */}
                        <span
                          class="flex-shrink-0 w-3.5 h-3.5 border flex items-center justify-center transition-colors"
                          classList={{
                            'rounded-sm': isMultiple(),
                            'rounded-full': !isMultiple(),
                            'border-accent bg-accent': isSelected(),
                            'border-muted/50': !isSelected()
                          }}
                        >
                          <Show when={isSelected()}>
                            <Check size={9} class="text-white" stroke-width={3} />
                          </Show>
                        </span>
                        <span class="flex flex-col min-w-0">
                          <span class="truncate">{opt.label}</span>
                          <Show when={opt.description}>
                            <span class="text-[11px] text-muted truncate">{opt.description}</span>
                          </Show>
                        </span>
                      </button>
                    )
                  }}
                </For>
              </div>
            </Show>

            {/* Custom input */}
            <Show when={qi.custom !== false}>
              <input
                type="text"
                placeholder="Custom answer..."
                value={customTexts()[qIdx()]}
                onInput={(e) => setCustomText(qIdx(), e.currentTarget.value)}
                class="bg-app border border-border rounded-md px-2.5 py-1.5 text-[13px] text-content outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 w-full max-w-xs placeholder:text-muted/50 transition-colors"
              />
            </Show>
          </div>
        )}
      </For>

      {/* Action buttons */}
      <div class="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleRespond}
          class="flex items-center gap-1.5 bg-accent hover:bg-accent/85 text-white cursor-pointer px-3 py-1.5 rounded-md text-[11px] font-medium shadow-sm border-none transition-colors"
        >
          <Check size={12} />
          Answer
        </button>
        <button
          type="button"
          onClick={() => props.onReject(props.question.id)}
          class="flex items-center gap-1.5 bg-transparent border border-border text-muted cursor-pointer px-3 py-1.5 rounded-md text-[11px] font-medium hover:bg-error/10 hover:text-error hover:border-error/30 transition-colors"
        >
          <X size={12} />
          Dismiss
        </button>
      </div>
    </div>
  )
}
