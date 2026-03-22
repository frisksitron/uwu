import { execFile } from 'node:child_process'
import { ipcMain } from 'electron'

let monoFontPromise: Promise<string[]> | null = null

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

function detectMonoFonts(): Promise<string[]> {
  if (!monoFontPromise) {
    monoFontPromise = process.platform === 'win32' ? detectMonoFontsWin32() : detectMonoFontsUnix()
  }
  return monoFontPromise
}

export function setupFontIpc(): void {
  ipcMain.handle('settings:get-mono-fonts', () => detectMonoFonts())
}
