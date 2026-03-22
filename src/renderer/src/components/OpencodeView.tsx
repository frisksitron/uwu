import { Bug, ChevronDown, History, Loader2, Plus, Sparkles } from 'lucide-solid'
import { createEffect, createSignal, type JSX, onCleanup, onMount, Show } from 'solid-js'
import {
  abortGeneration,
  executeCommand,
  type ImageAttachment,
  loadMessages,
  opcodeChat,
  rejectQuestion,
  respondQuestion,
  sendMessage
} from '../opcodeChat'
import {
  initProject,
  promote,
  resolvedAgent,
  resolvedModel,
  resolvedVariant,
  setSelection
} from '../opcodeLocal'
import {
  createSession,
  deleteSession,
  getSlashCommands,
  loadAgents,
  loadConfig,
  loadModels,
  loadSessions,
  loadSlashCommands,
  opcodeProject
} from '../opcodeProject'
import { startServer } from '../opcodeServer'
import ActivityBox from './opencode/ActivityBox'
import ChatInput from './opencode/ChatInput'
import MessageList from './opencode/MessageList'
import RawEventLog from './opencode/RawEventLog'
import SessionPicker from './opencode/SessionPicker'

interface OpencodeViewProps {
  tabId: string
  visible: boolean
  projectPath: string
  sessionId?: string
  label: string
  onSessionChange: (sessionId: string) => void
  onTitleChange?: (title: string) => void
}

export default function OpencodeView(props: OpencodeViewProps): JSX.Element {
  // Resolved values from opcodeLocal (per-session state + fallback chain)
  const model = () => resolvedModel(props.projectPath, props.sessionId)
  const agent = () => resolvedAgent(props.projectPath, props.sessionId)
  const variant = () => resolvedVariant(props.projectPath, props.sessionId)

  const [showRaw, setShowRaw] = createSignal(false)
  const [showHistory, setShowHistory] = createSignal(false)
  const [lockedToBottom, setLockedToBottom] = createSignal(true)
  const [loaded, setLoaded] = createSignal(false)
  const [serverError, setServerError] = createSignal(false)
  let scrollRef: HTMLDivElement | undefined
  let contentRef: HTMLDivElement | undefined
  let lastScrollTop = 0

  onMount(async () => {
    const ok = await startServer(props.projectPath)
    if (!ok) {
      setServerError(true)
      return
    }
    await Promise.all([
      loadAgents(props.projectPath),
      loadModels(props.projectPath),
      loadSessions(props.projectPath),
      loadSlashCommands(props.projectPath),
      loadConfig(props.projectPath)
    ])
    initProject(props.projectPath)
    if (props.sessionId) {
      await loadMessages(props.projectPath, props.sessionId)
      requestAnimationFrame(() => scrollToBottom())
    }
    setLoaded(true)
  })

  // ResizeObserver: auto-scroll when content or container size changes
  // Uses createEffect because scrollRef lives inside <Show when={loaded()}> and isn't available at mount time
  createEffect(() => {
    if (!loaded() || !scrollRef) return
    const observer = new ResizeObserver(() => {
      if (!scrollRef) return
      // If content fits without scrolling, re-lock so the button disappears
      if (scrollRef.scrollHeight <= scrollRef.clientHeight) {
        setLockedToBottom(true)
      } else if (lockedToBottom()) {
        scrollToBottom()
      }
    })
    observer.observe(scrollRef)
    if (contentRef) observer.observe(contentRef)
    onCleanup(() => observer.disconnect())
  })

  const messages = () => (props.sessionId ? opcodeChat.messages[props.sessionId] : undefined) || []
  const isGenerating = () => (props.sessionId && opcodeChat.isGenerating[props.sessionId]) || false

  const questions = () =>
    (props.sessionId ? opcodeChat.pendingQuestions[props.sessionId] : undefined) || []
  const streamingContent = () => opcodeChat.smoothContent
  const generationStartTime = () =>
    props.sessionId ? opcodeChat.generationStartTimes[props.sessionId] : undefined
  const inputHistory = () =>
    messages()
      .filter((m) => m.role === 'user')
      .map((m) =>
        m.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as { text: string }).text)
          .join('')
      )
      .filter(Boolean)

  const sessions = () => opcodeProject.sessions[props.projectPath] || []

  const session = () =>
    props.sessionId ? sessions().find((s) => s.id === props.sessionId) : undefined

  function handleScroll(): void {
    if (!scrollRef) return
    const { scrollHeight, scrollTop, clientHeight } = scrollRef
    const distFromBottom = scrollHeight - scrollTop - clientHeight
    // Only unlock if the user actively scrolled up
    if (scrollTop < lastScrollTop) {
      setLockedToBottom(distFromBottom <= 50)
    } else {
      if (distFromBottom <= 50) setLockedToBottom(true)
    }
    lastScrollTop = scrollTop
  }

  function scrollToBottom(): void {
    if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight
  }

  // Auto-scroll on reactive state changes (new messages, streaming)
  createEffect(() => {
    messages().length
    isGenerating()
    opcodeChat.streamingVersion
    if (lockedToBottom()) {
      scrollToBottom()
    }
  })

  // Sync session title to tab label
  createEffect(() => {
    const title = session()?.title
    if (title && props.onTitleChange) {
      props.onTitleChange(title)
    }
  })

  async function handleSend(text: string, images: ImageAttachment[]): Promise<void> {
    const sessionId = props.sessionId
    if (!sessionId) return

    // Parse slash commands: /command args
    if (text.startsWith('/')) {
      const spaceIdx = text.indexOf(' ')
      const command = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx)
      const args = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim()
      if (command) {
        await executeCommand(
          props.projectPath,
          sessionId,
          command,
          args,
          model(),
          agent(),
          variant()
        )
        return
      }
    }

    await sendMessage(props.projectPath, sessionId, text, model(), agent(), images, variant())
  }

  async function handleAbort(): Promise<void> {
    if (!props.sessionId) return
    await abortGeneration(props.projectPath, props.sessionId)
  }

  async function handleQuestionRespond(
    requestId: string,
    answers: Array<Array<string>>
  ): Promise<void> {
    await respondQuestion(props.projectPath, requestId, answers)
  }

  async function handleQuestionReject(requestId: string): Promise<void> {
    await rejectQuestion(props.projectPath, requestId)
  }

  async function handleNewSession(): Promise<void> {
    const newSession = await createSession(props.projectPath)
    if (newSession) {
      // Promote current resolved values into the new session
      promote(props.projectPath, newSession.id)
      props.onSessionChange(newSession.id)
    }
  }

  async function handleSelectSession(sessionId: string): Promise<void> {
    setShowHistory(false)
    props.onSessionChange(sessionId)
    await loadMessages(props.projectPath, sessionId)
    setLockedToBottom(true)
    requestAnimationFrame(() => scrollToBottom())
  }

  async function handleDeleteSession(sessionId: string): Promise<void> {
    await deleteSession(props.projectPath, sessionId)
    // If the deleted session was the active one, clear it
    if (props.sessionId === sessionId) {
      props.onSessionChange('')
    }
  }

  function handleModelChange(m: { providerID: string; modelID: string } | undefined): void {
    setSelection(props.projectPath, props.sessionId, { model: m })
  }

  function handleAgentChange(a: string | undefined): void {
    setSelection(props.projectPath, props.sessionId, { agent: a })
  }

  function handleVariantChange(v: string | undefined): void {
    setSelection(props.projectPath, props.sessionId, { variant: v ?? null })
  }

  return (
    <div
      class="w-full h-full absolute top-0 left-0 flex flex-col bg-app"
      classList={{
        invisible: !props.visible,
        'pointer-events-none': !props.visible
      }}
    >
      {/* Loading state — shown until server connects and data loads */}
      <Show when={!loaded() && !serverError()}>
        <div class="flex-1 flex items-center justify-center bg-app">
          <div class="flex flex-col items-center gap-3 select-none">
            <Loader2 size={24} class="text-accent animate-spin" />
            <p class="text-muted text-[13px] m-0">Starting up...</p>
          </div>
        </div>
      </Show>

      {/* Server error state */}
      <Show when={serverError()}>
        <div class="flex-1 flex items-center justify-center bg-app">
          <p class="text-error text-[13px] select-none">
            Couldn't connect — make sure opencode is installed and your API keys are set up.
          </p>
        </div>
      </Show>

      {/* Main UI — only rendered after loading completes */}
      <Show when={loaded()}>
        {/* Top bar */}
        <div class="flex items-center gap-2 px-3 h-9 border-b border-border bg-sidebar flex-shrink-0">
          <span class="flex-1 text-[13px] text-content truncate font-medium">
            {session()?.title || props.label}
          </span>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            class="bg-transparent hover:bg-hover border-none cursor-pointer h-7 w-7 rounded transition-colors flex items-center justify-center"
            classList={{
              'text-accent': showRaw(),
              'text-muted hover:text-content': !showRaw()
            }}
            title="Debug log"
          >
            <Bug size={14} />
          </button>
          <div class="relative">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              class="bg-transparent hover:bg-hover border-none cursor-pointer h-7 w-7 rounded transition-colors flex items-center justify-center"
              classList={{
                'text-accent': showHistory(),
                'text-muted hover:text-content': !showHistory()
              }}
              title="Session history"
            >
              <History size={14} />
            </button>
            <Show when={showHistory()}>
              <div
                class="fixed inset-0 z-40"
                role="presentation"
                aria-hidden="true"
                onClick={() => setShowHistory(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowHistory(false)
                }}
              />
              <div class="absolute right-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto bg-sidebar border border-border rounded shadow-lg py-1">
                <SessionPicker
                  sessions={sessions()}
                  currentSessionId={props.sessionId ?? ''}
                  onSelect={handleSelectSession}
                  onDelete={handleDeleteSession}
                />
              </div>
            </Show>
          </div>
          <button
            type="button"
            onClick={handleNewSession}
            class="bg-transparent hover:bg-hover border-none cursor-pointer h-7 w-7 rounded transition-colors flex items-center justify-center text-muted hover:text-content"
            title="New session"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Messages area (with optional raw event split) */}
        <div class="flex-1 flex min-h-0">
          <div
            ref={scrollRef}
            class="overflow-y-auto bg-app relative [scrollbar-gutter:stable]"
            classList={{ 'w-1/2': showRaw(), 'w-full': !showRaw() }}
            onScroll={handleScroll}
          >
            <div ref={contentRef} class="min-h-full flex flex-col">
              {/* Always mounted — empty <For> renders nothing, no teardown on session change */}
              <MessageList messages={messages()} streamingContent={streamingContent()} />
              {/* Empty state — shown when idle with no messages */}
              <Show when={!props.sessionId && messages().length === 0 && !isGenerating()}>
                <div class="flex items-center justify-center flex-1">
                  <div class="w-72">
                    <div class="flex flex-col items-center gap-2 select-none text-center mb-4">
                      <Sparkles size={28} class="text-icon-ai/60" />
                      <p class="text-muted text-[13px] m-0">Ready when you are~</p>
                    </div>

                    <button
                      type="button"
                      onClick={handleNewSession}
                      class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white text-[13px] font-medium border-none cursor-pointer hover:brightness-105 transition-all shadow-sm"
                    >
                      <Plus size={14} />
                      New session
                    </button>

                    {/* Previous sessions list — capped height to keep layout centered */}
                    <Show
                      when={sessions().filter((s) => s.id !== (props.sessionId ?? '')).length > 0}
                    >
                      <div class="border-t border-border mt-4 pt-3">
                        <p class="text-muted text-[11px] font-medium mb-1 px-3 select-none">
                          Previous sessions
                        </p>
                        <div class="max-h-48 overflow-y-auto">
                          <SessionPicker
                            sessions={sessions().filter((s) => s.id !== (props.sessionId ?? ''))}
                            currentSessionId={props.sessionId ?? ''}
                            onSelect={handleSelectSession}
                            onDelete={handleDeleteSession}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>

            {/* Jump to bottom button */}
            <Show when={!lockedToBottom() && messages().length > 0}>
              <button
                type="button"
                onClick={scrollToBottom}
                class="sticky bottom-3 left-1/2 -translate-x-1/2 bg-sidebar/90 hover:bg-hover border border-border rounded-full p-2 cursor-pointer shadow-md transition-colors flex items-center z-20"
                title="Jump to bottom"
              >
                <ChevronDown size={14} class="text-accent" />
              </button>
            </Show>
          </div>
          <Show when={showRaw()}>
            <div class="w-px bg-border flex-shrink-0" />
            <div class="w-1/2 min-h-0">
              <RawEventLog events={opcodeChat.rawEvents} />
            </div>
          </Show>
        </div>

        {/* Chat input + activity box overlay — only when a session is active */}
        <Show when={props.sessionId}>
          <div class="relative flex-shrink-0 pb-3">
            <div class="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-app to-transparent pointer-events-none z-0" />
            <div class="absolute bottom-full left-0 right-0 z-10 flex justify-center">
              <ActivityBox
                sessionId={props.sessionId}
                isGenerating={isGenerating()}
                questions={questions()}
                onQuestionRespond={handleQuestionRespond}
                onQuestionReject={handleQuestionReject}
              />
            </div>
            <div class="max-w-3xl mx-auto w-full px-3">
              <ChatInput
                isGenerating={isGenerating()}
                generationStartTime={generationStartTime()}
                history={inputHistory()}
                slashCommands={getSlashCommands(props.projectPath)}
                onSend={handleSend}
                onAbort={handleAbort}
                visible={props.visible}
                projectPath={props.projectPath}
                model={model()}
                onModelChange={handleModelChange}
                agent={agent()}
                onAgentChange={handleAgentChange}
                variant={variant()}
                onVariantChange={handleVariantChange}
              />
            </div>
          </div>
        </Show>
      </Show>
    </div>
  )
}
