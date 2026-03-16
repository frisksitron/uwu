import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import { createEffect, type JSX, on, onCleanup, onMount } from 'solid-js'
import '@xterm/xterm/css/xterm.css'
import { clearOutput, pushOutput } from '../outputStore'
import { matchesBinding, settings } from '../settingsStore'
import { readTerminalBuffer } from '../terminalCache'

interface TerminalProps {
  tabId: string
  visible: boolean
  cwd: string
  initialCommand?: string
  readOnly?: boolean
  onExit?: (exitCode: number) => void
  onKillRef?: (kill: () => void) => void
  onProcessChange?: (processName: string) => void
  shell?: string
  extraEnv?: Record<string, string>
  persistentTerminalId?: string
  onCacheSnapshot?: (snapshot: { lastOutput: string; title: string }) => void
}

function cleanTitle(title: string): string {
  if (/^[a-zA-Z]:[/\\]/.test(title) || title.startsWith('/')) {
    const base = title.replace(/\\/g, '/').split('/').pop() || title
    return base.replace(/\.exe$/i, '')
  }
  return title
}

export default function Terminal(props: TerminalProps): JSX.Element {
  let containerRef!: HTMLDivElement
  let fitAddon!: FitAddon
  let term!: XTerm
  let currentTitle = ''

  createEffect(() => {
    if (props.visible && fitAddon) {
      requestAnimationFrame(() => {
        fitAddon.fit()
        term.focus()
      })
    }
  })

  onMount(() => {
    term = new XTerm({
      cursorBlink: settings.terminal.cursorBlink,
      fontSize: settings.terminal.fontSize,
      fontFamily: settings.terminal.fontFamily,
      theme: {
        background: '#fff8fc', // --color-terminal
        foreground: '#6b3d58', // darker shade of --color-content
        cursor: '#c9709a', // --color-heading
        cursorAccent: '#fff8fc',
        selectionBackground: '#f5c8e5', // --color-border
        // ANSI 16-color palette — warm pink/mauve to match app
        black: '#6b3d58',
        red: '#c84848',
        green: '#4a9a4a',
        yellow: '#b07828',
        blue: '#6868b8',
        magenta: '#b85890',
        cyan: '#4898a0',
        white: '#e8d0e0',
        brightBlack: '#a878a0', // --color-muted range
        brightRed: '#e06060',
        brightGreen: '#5ab85a',
        brightYellow: '#c89840',
        brightBlue: '#8888d0',
        brightMagenta: '#d070a8', // --color-accent range
        brightCyan: '#60b0b8',
        brightWhite: '#f5e8f0'
      }
    })
    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef)

    // Let app shortcuts pass through to the global keydown handler
    term.attachCustomKeyEventHandler((e) => {
      for (const binding of Object.values(settings.shortcuts)) {
        if (matchesBinding(e, binding)) return false
      }
      return true
    })

    fitAddon.fit()

    // React to live settings changes
    createEffect(
      on(
        () => ({
          fontSize: settings.terminal.fontSize,
          fontFamily: settings.terminal.fontFamily,
          cursorBlink: settings.terminal.cursorBlink
        }),
        (opts) => {
          term.options.fontSize = opts.fontSize
          term.options.fontFamily = opts.fontFamily
          term.options.cursorBlink = opts.cursorBlink
          fitAddon.fit()
        },
        { defer: true }
      )
    )

    // Mutable cleanup state — populated after async init
    let id: number | undefined
    let removeOutput: (() => void) | undefined
    let removeExit: (() => void) | undefined
    let dataDisposable: { dispose(): void } | undefined
    let observer: ResizeObserver | undefined
    let titleDisposable: { dispose(): void } | undefined

    if (props.onCacheSnapshot) {
      const snapshotFn = props.onCacheSnapshot
      snapshotFn({
        get lastOutput() {
          return readTerminalBuffer(term)
        },
        get title() {
          return currentTitle
        }
      } as { lastOutput: string; title: string })
    }

    // Register cleanup synchronously so Solid can track the owner
    const persistentTerminalId = props.persistentTerminalId
    onCleanup(() => {
      if (persistentTerminalId) {
        const lastOutput = readTerminalBuffer(term)
        const entry = { lastOutput, title: currentTitle, savedAt: Date.now() }
        window.terminalAPI
          .loadCache()
          .then((cache) => {
            cache[persistentTerminalId] = entry
            return window.terminalAPI.saveCache(cache)
          })
          .catch(() => {})
      }

      titleDisposable?.dispose()
      observer?.disconnect()
      dataDisposable?.dispose()
      removeOutput?.()
      removeExit?.()
      if (id !== undefined) window.terminalAPI.kill(id)
      term.dispose()
      clearOutput(props.tabId)
    })

    // Async init — populates cleanup refs
    ;(async () => {
      if (props.persistentTerminalId) {
        try {
          const cache = await window.terminalAPI.loadCache()
          const entry = cache[props.persistentTerminalId]
          if (entry?.lastOutput) {
            const dimmed = entry.lastOutput
              .split('\n')
              .map((line) => `\x1b[2m${line}\x1b[0m`)
              .join('\r\n')
            term.write(`${dimmed}\r\n`)
            term.write('\x1b[2m── previous session ──\x1b[0m\r\n')
            // Push cached content into scrollback by emitting enough
            // newlines to fill the viewport, then reset cursor to top
            const blankLines = '\r\n'.repeat(term.rows)
            term.write(blankLines)
            // Move cursor back to the top of the visible viewport
            term.write(`\x1b[${term.rows}A`)
            if (entry.title) {
              currentTitle = entry.title
              if (props.onProcessChange) props.onProcessChange(cleanTitle(entry.title))
            }
          }
        } catch {
          /* ignore */
        }
      }

      const env = props.extraEnv ? { ...props.extraEnv } : undefined

      id = props.initialCommand
        ? await window.terminalAPI.createScript(
            term.cols,
            term.rows,
            props.cwd,
            props.initialCommand,
            props.shell,
            env
          )
        : await window.terminalAPI.create(term.cols, term.rows, props.cwd, props.shell, env)

      props.onKillRef?.(() => window.terminalAPI.kill(id as number))

      // eslint-disable-next-line solid/reactivity
      removeOutput = window.terminalAPI.onOutput((termId, data) => {
        if (termId === id) {
          term.write(data)
          pushOutput(props.tabId, data)
        }
      })
      // eslint-disable-next-line solid/reactivity
      removeExit = window.terminalAPI.onExit((termId, code) => {
        if (termId === id) props.onExit?.(code)
      })
      // eslint-disable-next-line solid/reactivity
      dataDisposable = term.onData((data) => {
        if (!props.readOnly && id !== undefined) window.terminalAPI.sendInput(id, data)
      })

      observer = new ResizeObserver(() => {
        fitAddon.fit()
        if (id !== undefined) window.terminalAPI.resize(id, term.cols, term.rows)
      })
      observer.observe(containerRef)

      // Listen for terminal title changes (OSC 0/2 escape sequences)
      const onProcessChange = props.onProcessChange
      titleDisposable = term.onTitleChange((title) => {
        if (title) currentTitle = title
        if (onProcessChange && title) {
          onProcessChange(cleanTitle(title))
        }
      })
    })()
  })

  return (
    <div
      ref={containerRef}
      class="w-full h-full p-1 bg-terminal absolute top-0 left-0"
      classList={{
        invisible: !props.visible,
        'pointer-events-none': !props.visible
      }}
    />
  )
}
