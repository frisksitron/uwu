import { type } from 'arktype'

// --- Settings schemas ---

export const KeyBindingSchema = type({
  key: 'string',
  ctrlKey: 'boolean',
  shiftKey: 'boolean',
  altKey: 'boolean'
})

export type KeyBinding = typeof KeyBindingSchema.infer

export const KeyboardShortcutsSchema = type({
  cycleTabForward: KeyBindingSchema,
  cycleTabBackward: KeyBindingSchema,
  toggleSidebar: KeyBindingSchema,
  closeTab: KeyBindingSchema,
  openSettings: KeyBindingSchema
})

export type KeyboardShortcuts = typeof KeyboardShortcutsSchema.infer

export const TerminalSettingsSchema = type({
  fontSize: 'number >= 8 & number <= 24',
  fontFamily: 'string',
  cursorBlink: 'boolean',
  defaultShell: 'string'
})

export type TerminalSettings = typeof TerminalSettingsSchema.infer

export const WindowSettingsSchema = type({
  rememberBounds: 'boolean',
  'bounds?': {
    x: 'number',
    y: 'number',
    width: 'number',
    height: 'number'
  }
})

export type WindowSettings = typeof WindowSettingsSchema.infer

export const AppSettingsSchema = type({
  terminal: TerminalSettingsSchema,
  window: WindowSettingsSchema,
  shortcuts: KeyboardShortcutsSchema
})

export type AppSettings = typeof AppSettingsSchema.infer

// --- Workspace tab schemas ---

export const ScriptWorkspaceTabSchema = type({
  id: 'string',
  type: "'script'",
  name: 'string',
  'hidden?': 'boolean'
})

export const CustomScriptWorkspaceTabSchema = type({
  id: 'string',
  type: "'custom-script'",
  name: 'string',
  command: 'string'
})

export const TerminalWorkspaceTabSchema = type({
  id: 'string',
  type: "'terminal'",
  label: 'string',
  'customLabel?': 'boolean'
})

export const OpencodeWorkspaceTabSchema = type({
  id: 'string',
  type: "'opencode'",
  label: 'string',
  'sessionId?': 'string'
})

export const WorkspaceTabSchema = ScriptWorkspaceTabSchema.or(CustomScriptWorkspaceTabSchema)
  .or(TerminalWorkspaceTabSchema)
  .or(OpencodeWorkspaceTabSchema)

export type WorkspaceTab = typeof WorkspaceTabSchema.infer

// --- Project schemas ---

export const ProjectEntrySchema = type({
  id: 'string',
  name: 'string',
  path: 'string',
  scripts: 'Record<string, string>',
  projectType: 'string',
  collapsed: 'boolean',
  'workspaces?': 'Record<string, unknown>',
  'shellOverride?': 'string',
  'envVars?': 'Record<string, string>',
  'syncFiles?': 'string[]',
  'expandedWorktrees?': 'Record<string, boolean>'
})

export type ProjectEntry = typeof ProjectEntrySchema.infer

// --- Terminal cache schemas ---

export const TerminalCacheEntrySchema = type({
  lastOutput: 'string',
  title: 'string',
  savedAt: 'number'
})

export type TerminalCacheEntry = typeof TerminalCacheEntrySchema.infer

export const TerminalCacheSchema = type('Record<string, unknown>').pipe((data) => {
  const result: Record<string, TerminalCacheEntry> = {}
  for (const [key, value] of Object.entries(data)) {
    const parsed = TerminalCacheEntrySchema(value)
    if (parsed instanceof type.errors) continue
    result[key] = parsed
  }
  return result
})
