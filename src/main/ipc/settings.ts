import { execFile } from 'node:child_process'
import { ipcMain } from 'electron'
import Store from 'electron-store'
import { type AppSettings, DEFAULT_SETTINGS } from '../../shared/types'

const settingsStore = new Store<{ settings: AppSettings }>({
  name: 'settings',
  defaults: { settings: DEFAULT_SETTINGS }
})

export function getSettingsStore(): Store<{ settings: AppSettings }> {
  return settingsStore
}

// biome-ignore lint/suspicious/noExplicitAny: recursive merge needs any
function deepMerge(defaults: any, saved: any): any {
  if (!saved || typeof saved !== 'object' || typeof defaults !== 'object') return defaults
  const result = { ...defaults }
  for (const key of Object.keys(defaults)) {
    const def = defaults[key]
    const val = saved[key]
    if (val === undefined) continue
    if (def && typeof def === 'object' && !Array.isArray(def) && val && typeof val === 'object') {
      result[key] = deepMerge(def, val)
    } else {
      result[key] = val
    }
  }
  return result
}

let monoFontCache: string[] | null = null

/** Windows: detect mono fonts via System.Drawing */
function detectMonoFontsWin32(): Promise<string[]> {
  return new Promise((resolve) => {
    const script = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(1,1)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$fmt = [System.Drawing.StringFormat]::GenericTypographic
foreach ($fam in [System.Drawing.FontFamily]::Families) {
  try {
    if (-not $fam.IsStyleAvailable([System.Drawing.FontStyle]::Regular)) { continue }
    $f = New-Object System.Drawing.Font($fam.Name, 16)
    $wi = $g.MeasureString('iiii', $f, [int]::MaxValue, $fmt).Width
    $wm = $g.MeasureString('MMMM', $f, [int]::MaxValue, $fmt).Width
    $f.Dispose()
    if ([Math]::Abs($wi - $wm) -ge 1.0) { continue }
    $fam.Name
  } catch {}
}
$g.Dispose()
$bmp.Dispose()
`.trim()
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 30000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(['Consolas', 'Courier New', 'Lucida Console'])
          return
        }
        const names = stdout
          .trim()
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
        resolve(names.sort())
      }
    )
  })
}

/** macOS/Linux: detect mono fonts via fc-list */
function detectMonoFontsUnix(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile('fc-list', [':spacing=mono', 'family'], { timeout: 10000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(['Menlo', 'Monaco', 'DejaVu Sans Mono'])
        return
      }
      const seen = new Set<string>()
      for (const line of stdout.split('\n')) {
        for (const raw of line.split(',')) {
          const name = raw.trim()
          if (name) seen.add(name)
        }
      }
      resolve([...seen].sort())
    })
  })
}

async function detectMonoFonts(): Promise<string[]> {
  if (monoFontCache) return monoFontCache
  monoFontCache =
    process.platform === 'win32' ? await detectMonoFontsWin32() : await detectMonoFontsUnix()
  return monoFontCache
}

export function setupSettingsIpc(): void {
  ipcMain.handle('settings:load', () => {
    const saved = settingsStore.get('settings', {} as AppSettings)
    return deepMerge(DEFAULT_SETTINGS, saved) as AppSettings
  })

  ipcMain.handle('settings:save', (_e, settings: AppSettings) => {
    settingsStore.set('settings', settings)
  })

  ipcMain.handle('settings:get-mono-fonts', () => detectMonoFonts())
}
