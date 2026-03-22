import { Pagination } from '@kobalte/core/pagination'
import { Check, Sparkles, X } from 'lucide-solid'
import { createEffect, createSignal, For, type JSX, on, Show } from 'solid-js'
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
  const [selections, setSelections] = createSignal<Array<Set<string>>>(
    props.question.questions.map(() => new Set<string>())
  )
  const [customTexts, setCustomTexts] = createSignal<string[]>(
    props.question.questions.map(() => '')
  )
  const [stepIndex, setStepIndex] = createSignal(0)

  const totalSteps = () => props.question.questions.length
  const isSingleStep = () => totalSteps() <= 1
  const currentQuestion = () => props.question.questions[stepIndex()]

  let stepRef: HTMLDivElement | undefined

  // Re-trigger slide animation on step change
  createEffect(
    on(stepIndex, () => {
      if (!stepRef) return
      stepRef.classList.remove('question-step-enter')
      void stepRef.offsetWidth
      stepRef.classList.add('question-step-enter')
    })
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
    // Auto-advance for single-choice, non-last step
    if (!multiple && stepIndex() < totalSteps() - 1) {
      setStepIndex((i) => i + 1)
    }
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
        <span class="text-heading text-[11px] font-semibold tracking-wide">Needs your input</span>
      </div>

      {/* Current question content */}
      <div ref={stepRef} class="flex flex-col gap-1.5 question-step-enter">
        <span class="text-content font-semibold text-[13px]">{currentQuestion().header}</span>
        <span class="text-muted text-[11px] leading-relaxed">{currentQuestion().question}</span>

        {/* Options */}
        <Show when={currentQuestion().options?.length}>
          <div class="flex flex-col gap-1 mt-1">
            <For each={currentQuestion().options}>
              {(opt) => {
                const isSelected = (): boolean => selections()[stepIndex()]?.has(opt.label)
                const isMultiple = (): boolean => currentQuestion().multiple ?? false
                return (
                  <button
                    type="button"
                    onClick={() => toggleOption(stepIndex(), opt.label, isMultiple())}
                    class="flex items-center gap-2 w-full text-left cursor-pointer rounded-md border px-2.5 py-1.5 text-[11px] transition-all"
                    classList={{
                      'bg-accent/15 border-accent/50 text-accent ring-1 ring-accent/20':
                        isSelected(),
                      'bg-app border-border text-content hover:border-accent/40 hover:bg-accent/5':
                        !isSelected()
                    }}
                  >
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
        <Show when={currentQuestion().custom !== false}>
          <input
            type="text"
            placeholder="Type your own..."
            value={customTexts()[stepIndex()]}
            onInput={(e) => setCustomText(stepIndex(), e.currentTarget.value)}
            class="bg-app border border-border rounded-md px-2.5 py-1.5 text-[13px] text-content outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 w-full max-w-xs placeholder:text-muted/50 transition-colors"
          />
        </Show>
      </div>

      {/* Action bar: pagination left, buttons right */}
      <div class="flex items-center gap-2 pt-1">
        <Show when={!isSingleStep()}>
          <Pagination
            count={totalSteps()}
            page={stepIndex() + 1}
            onPageChange={(p) => setStepIndex(p - 1)}
            fixedItems
            siblingCount={1}
            showFirst={false}
            showLast={false}
            itemComponent={(itemProps) => (
              <Pagination.Item class="question-page-item" page={itemProps.page}>
                {itemProps.page}
              </Pagination.Item>
            )}
            ellipsisComponent={() => (
              <Pagination.Ellipsis class="question-page-ellipsis">&hellip;</Pagination.Ellipsis>
            )}
            class="question-pagination"
          >
            <Pagination.Previous class="question-page-nav">&lsaquo;</Pagination.Previous>
            <Pagination.Items />
            <Pagination.Next class="question-page-nav">&rsaquo;</Pagination.Next>
          </Pagination>
        </Show>

        <div class="flex-1" />

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
