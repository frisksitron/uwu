import type { Terminal } from '@xterm/xterm'

// Intentional control characters — strips ANSI escape sequences from terminal output
export const ANSI_RE = new RegExp(
  [
    '\\x1b\\[[0-9;?>=!]*[ -/]*[A-Za-z@`]', // CSI sequences
    '\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)', // OSC sequences
    '\\x1b[()#][A-Za-z0-9]', // charset select
    '\\x1b[A-Za-z>=<]', // two-char escapes
    '\\x07', // BEL
    '\\r', // CR
    '\\x1b' // lone ESC
  ].join('|'),
  'g'
)

const MAX_LINES = 200

/** Read last non-empty lines from xterm buffer, ANSI stripped. */
export function readTerminalBuffer(term: Terminal): string {
  const buf = term.buffer.active
  const totalRows = buf.length
  const lines: string[] = []

  // Walk backwards to find non-empty lines
  for (let i = totalRows - 1; i >= 0 && lines.length < MAX_LINES; i--) {
    const line = buf.getLine(i)
    if (!line) continue
    const text = line.translateToString(true)
    if (text.trim() || lines.length > 0) {
      lines.unshift(text)
    }
  }

  // Strip leading empty lines
  while (lines.length > 0 && !lines[0].trim()) lines.shift()

  return lines.map((l) => l.replace(ANSI_RE, '')).join('\n')
}
