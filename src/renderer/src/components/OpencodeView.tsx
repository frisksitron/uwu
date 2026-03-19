import { Bug, ChevronDown, History, Loader2, Plus, Sparkles } from 'lucide-solid'
import { createEffect, createSignal, type JSX, onCleanup, onMount, Show } from 'solid-js'
import {
  abortGeneration,
  executeCommand,
  type ImageAttachment,
  loadMessages,
  opcodeChat,
  rejectQuestion,
  respondPermission,
  respondQuestion,
  sendMessage
} from '../opcodeChat'
import {
  createSession,
  getSlashCommands,
  loadAgents,
  loadModels,
  loadSessions,
  loadSlashCommands,
  opcodeProject
} from '../opcodeProject'
import { startServer } from '../opcodeServer'
import ChatInput from './opencode/ChatInput'
import MessageList from './opencode/MessageList'
import RawEventLog from './opencode/RawEventLog'
import SessionPicker from './opencode/SessionPicker'

interface OpencodeViewProps {
  tabId: string
  visible: boolean
  projectPath: string
  sessionId?: string
  onSessionChange: (sessionId: string) => void
  onTitleChange?: (title: string) => void
}

export default function OpencodeView(props: OpencodeViewProps): JSX.Element {
  // Local overrides — when set, take priority over server values for the next message
  const [modelOverride, setModelOverride] = createSignal<
    { providerID: string; modelID: string } | undefined
  >()
  const [agentOverride, setAgentOverride] = createSignal<string | undefined>()
  const [variantOverride, setVariantOverride] = createSignal<string | undefined>()

  // Resolved values: local override > server's last-used value (from user messages)
  const model = () =>
    modelOverride() ?? (props.sessionId ? opcodeChat.sessionModels[props.sessionId] : undefined)
  const agent = () =>
    agentOverride() ?? (props.sessionId ? opcodeChat.sessionAgents[props.sessionId] : undefined)
  const variant = () =>
    variantOverride() ?? (props.sessionId ? opcodeChat.sessionVariants[props.sessionId] : undefined)

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
      loadSlashCommands(props.projectPath)
    ])
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
  const permissions = () =>
    (props.sessionId ? opcodeChat.pendingPermissions[props.sessionId] : undefined) || []
  const questions = () =>
    (props.sessionId ? opcodeChat.pendingQuestions[props.sessionId] : undefined) || []
  const streamingContent = () => opcodeChat.streamingContent
  const generationStartTime = () =>
    props.sessionId ? opcodeChat.generationStartTimes[props.sessionId] : undefined
  const generationDuration = () =>
    props.sessionId ? opcodeChat.generationDurations[props.sessionId] : undefined
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
    let sessionId = props.sessionId
    if (!sessionId) {
      const newSession = await createSession(props.projectPath)
      if (!newSession) return
      sessionId = newSession.id
      props.onSessionChange(sessionId)
    }

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

  async function handlePermission(
    permissionId: string,
    response: 'once' | 'always' | 'reject'
  ): Promise<void> {
    if (!props.sessionId) return
    await respondPermission(props.projectPath, props.sessionId, permissionId, response)
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
    setModelOverride(undefined)
    setAgentOverride(undefined)
    setVariantOverride(undefined)
    const newSession = await createSession(props.projectPath)
    if (newSession) {
      props.onSessionChange(newSession.id)
    }
  }

  async function handleSelectSession(sessionId: string): Promise<void> {
    setShowHistory(false)
    setModelOverride(undefined)
    setAgentOverride(undefined)
    setVariantOverride(undefined)
    props.onSessionChange(sessionId)
    await loadMessages(props.projectPath, sessionId)
    setLockedToBottom(true)
    requestAnimationFrame(() => scrollToBottom())
  }

  return (
    <div
      class="w-full h-full absolute top-0 left-0 flex flex-col"
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
            <p class="text-muted text-[13px] m-0">Connecting to AI server...</p>
          </div>
        </div>
      </Show>

      {/* Server error state */}
      <Show when={serverError()}>
        <div class="flex-1 flex items-center justify-center bg-app">
          <p class="text-error text-[13px] select-none">
            Failed to start AI server. Check your configuration and try again.
          </p>
        </div>
      </Show>

      {/* Main UI — only rendered after loading completes */}
      <Show when={loaded()}>
        {/* Top bar */}
        <div class="flex items-center gap-2 px-3 h-9 border-b border-border bg-sidebar flex-shrink-0">
          <span class="flex-1 text-[13px] text-content truncate font-medium">
            {session()?.title || 'AI Chat'}
          </span>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            class="bg-transparent hover:bg-hover border-none cursor-pointer h-7 w-7 rounded transition-colors flex items-center justify-center"
            classList={{
              'text-accent': showRaw(),
              'text-muted hover:text-content': !showRaw()
            }}
            title="Toggle raw event log"
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
            class="overflow-y-auto bg-app relative"
            classList={{ 'w-1/2': showRaw(), 'w-full': !showRaw() }}
            onScroll={handleScroll}
          >
            <div ref={contentRef}>
              <Show
                when={messages().length > 0}
                fallback={
                  <div class="flex items-center justify-center h-full">
                    <div class="w-72 max-h-full overflow-y-auto">
                      <Show
                        when={sessions().filter((s) => s.id !== (props.sessionId ?? '')).length > 0}
                        fallback={
                          <div class="flex flex-col items-center gap-2 select-none text-center">
                            <Sparkles size={28} class="text-icon-ai opacity-50" />
                            <p class="text-content text-[13px] opacity-60 m-0">
                              Ready when you are~
                            </p>
                            <p class="text-muted text-[11px] opacity-50 m-0">
                              Type a message, or <span class="font-mono text-accent">/</span> for
                              commands
                            </p>
                          </div>
                        }
                      >
                        <p class="text-muted text-[11px] font-medium mb-1 px-3 select-none">
                          Previous sessions
                        </p>
                        <SessionPicker
                          sessions={sessions().filter((s) => s.id !== (props.sessionId ?? ''))}
                          currentSessionId={props.sessionId ?? ''}
                          onSelect={handleSelectSession}
                        />
                        <div class="border-t border-border mt-2 pt-2 px-3">
                          <p class="text-muted text-[11px] opacity-60 select-none text-center">
                            or send a message to start a new conversation
                          </p>
                        </div>
                      </Show>
                    </div>
                  </div>
                }
              >
                <MessageList
                  messages={messages()}
                  streamingContent={streamingContent()}
                  generationDuration={generationDuration()}
                  permissions={permissions()}
                  questions={questions()}
                  onPermissionRespond={handlePermission}
                  onQuestionRespond={handleQuestionRespond}
                  onQuestionReject={handleQuestionReject}
                />
              </Show>
            </div>

            {/* Jump to bottom button */}
            <Show when={!lockedToBottom() && messages().length > 0}>
              <button
                type="button"
                onClick={scrollToBottom}
                class="sticky bottom-3 left-1/2 -translate-x-1/2 bg-sidebar/90 hover:bg-hover border border-border rounded-full p-1.5 cursor-pointer shadow-md transition-colors flex items-center z-20"
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

        {/* Chat input */}
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
          onModelChange={setModelOverride}
          agent={agent()}
          onAgentChange={setAgentOverride}
          variant={variant()}
          onVariantChange={setVariantOverride}
        />
      </Show>
    </div>
  )
}
