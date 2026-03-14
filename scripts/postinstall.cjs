// Runs electron-builder install-app-deps but does not fail the install if
// rebuilding a native module fails. node-pty 1.x ships N-API prebuilts that
// work with any Electron ABI, so a source rebuild is not required.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execSync } = require('node:child_process')

try {
  execSync('electron-builder install-app-deps', { stdio: 'inherit' })
} catch {
  console.warn(
    '\nWARN: electron-builder install-app-deps failed (native prebuilts will be used instead)\n'
  )
}
