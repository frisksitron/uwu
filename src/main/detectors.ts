import * as fs from 'node:fs'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'

export interface ProjectMetadata {
  name: string
  scripts: Record<string, string> // key = display name, value = full command
  projectType: string // 'npm', 'pnpm', 'yarn', 'dotnet', 'uv', 'cargo', 'make'
}

type Detector = (folderPath: string) => Promise<ProjectMetadata | null>

const detectNodejs: Detector = async (folderPath) => {
  const pkgPath = join(folderPath, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const hasPnpm = fs.existsSync(join(folderPath, 'pnpm-lock.yaml'))
  const hasYarn = fs.existsSync(join(folderPath, 'yarn.lock'))
  const pm = hasPnpm ? 'pnpm' : hasYarn ? 'yarn' : 'npm'
  const rawScripts = (pkg.scripts || {}) as Record<string, string>
  const scripts: Record<string, string> = {}
  for (const name of Object.keys(rawScripts)) {
    scripts[name] = `${pm} run ${name}`
  }
  return {
    name: (pkg.name as string) || folderPath.split(/[\\/]/).pop() || 'Project',
    scripts,
    projectType: pm
  }
}

const detectDotnet: Detector = async (folderPath) => {
  const entries = fs.readdirSync(folderPath)
  const hasDotnet = entries.some(
    (e) => e.endsWith('.csproj') || e.endsWith('.fsproj') || e.endsWith('.sln')
  )
  if (!hasDotnet) return null
  return {
    name: folderPath.split(/[\\/]/).pop() || 'Project',
    scripts: {
      build: 'dotnet build',
      run: 'dotnet run',
      test: 'dotnet test',
      watch: 'dotnet watch'
    },
    projectType: 'dotnet'
  }
}

const detectCargo: Detector = async (folderPath) => {
  const cargoPath = join(folderPath, 'Cargo.toml')
  if (!fs.existsSync(cargoPath)) return null
  let name = folderPath.split(/[\\/]/).pop() || 'Project'
  try {
    const toml = parseToml(fs.readFileSync(cargoPath, 'utf8'))
    const pkg = toml.package as Record<string, unknown> | undefined
    if (pkg?.name && typeof pkg.name === 'string') name = pkg.name
  } catch {
    /* ignore */
  }
  return {
    name,
    scripts: {
      build: 'cargo build',
      run: 'cargo run',
      test: 'cargo test',
      check: 'cargo check',
      clippy: 'cargo clippy'
    },
    projectType: 'cargo'
  }
}

const detectUv: Detector = async (folderPath) => {
  const pyprojectPath = join(folderPath, 'pyproject.toml')
  if (!fs.existsSync(pyprojectPath)) return null
  let name = folderPath.split(/[\\/]/).pop() || 'Project'
  const scripts: Record<string, string> = { sync: 'uv sync' }
  try {
    const toml = parseToml(fs.readFileSync(pyprojectPath, 'utf8'))
    const project = toml.project as Record<string, unknown> | undefined
    if (project?.name && typeof project.name === 'string') name = project.name
    const projectScripts = (project?.scripts ?? {}) as Record<string, string>
    for (const scriptName of Object.keys(projectScripts)) {
      scripts[scriptName] = `uv run ${scriptName}`
    }
  } catch {
    // ignore parse errors
  }
  return { name, scripts, projectType: 'uv' }
}

const detectMakefile: Detector = async (folderPath) => {
  let makefilePath = join(folderPath, 'Makefile')
  if (!fs.existsSync(makefilePath)) {
    makefilePath = join(folderPath, 'GNUmakefile')
    if (!fs.existsSync(makefilePath)) return null
  }
  const content = fs.readFileSync(makefilePath, 'utf8')
  const targetRegex = /^([a-zA-Z_][\w-]*)\s*:/gm
  const scripts: Record<string, string> = {}
  let count = 0
  for (
    let match = targetRegex.exec(content);
    match !== null && count < 30;
    match = targetRegex.exec(content)
  ) {
    const target = match[1]
    if (!target.startsWith('.')) {
      scripts[target] = `make ${target}`
      count++
    }
  }
  return {
    name: folderPath.split(/[\\/]/).pop() || 'Project',
    scripts,
    projectType: 'make'
  }
}

const detectors: Detector[] = [detectNodejs, detectDotnet, detectCargo, detectUv, detectMakefile]

export async function detectProject(folderPath: string): Promise<ProjectMetadata | null> {
  for (const detector of detectors) {
    const result = await detector(folderPath)
    if (result) return result
  }
  return null
}
