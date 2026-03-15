import vitesseLight from '@shikijs/themes/vitesse-light'
import type { BundledLanguage, BundledTheme, HighlighterGeneric } from 'shiki'
import { createHighlighter, createJavaScriptRegexEngine } from 'shiki'
import { createSignal } from 'solid-js'

const [highlighter, setHighlighter] = createSignal<HighlighterGeneric<
  BundledLanguage,
  BundledTheme
> | null>(null)

createHighlighter({
  themes: [vitesseLight],
  engine: createJavaScriptRegexEngine(),
  langs: [
    'javascript',
    'typescript',
    'tsx',
    'jsx',
    'python',
    'rust',
    'go',
    'bash',
    'shellscript',
    'json',
    'css',
    'html',
    'yaml',
    'toml',
    'sql',
    'markdown',
    'diff',
    'c',
    'cpp',
    'csharp',
    'java',
    'xml'
  ]
})
  .then((h) => {
    setHighlighter(() => h)
  })
  .catch((err) => {
    console.error('[shiki] failed to create highlighter:', err)
  })

export { highlighter as getHighlighter }
