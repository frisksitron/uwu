import { ChevronDown, ChevronRight, FolderPlus, Plus, RefreshCw, Settings, X } from 'lucide-solid'
import { createEffect, For, type JSX, onMount, Show } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import { createStore } from 'solid-js/store'
import { opencodeState, startServer } from '../opencodeStore'
import { runScript } from '../scriptActions'
import type {
  AppState,
  OpencodeInstance,
  PersistentTerminal,
  Project,
  Tab,
  WorktreeInfo
} from '../types'
import CreateWorktreeDialog from './CreateWorktreeDialog'
import ProjectSettings from './ProjectSettings'
import ScriptsAndTerminals, { type ScriptsAndTerminalsProps } from './ScriptsAndTerminals'

interface SidebarProps {
  store: AppState
  setStore: SetStoreFunction<AppState>
  onAddTab: (tab: Tab, activate?: boolean) => void
  onCloseTab: (tabId: string) => void
  onSaveProjects: () => void
  width: number
}

interface SidebarState {
  renamingTerminalId: string | null
  renameValue: string
  settingsProjectId: string | null
  createWorktreeProjectId: string | null
  gitProjects: Record<string, boolean>
  worktrees: Record<string, WorktreeInfo[]>
  worktreeScripts: Record<string, Record<string, string>>
}

export default function Sidebar(props: SidebarProps): JSX.Element {
  const [state, setState] = createStore<SidebarState>({
    renamingTerminalId: null,
    renameValue: '',
    settingsProjectId: null,
    createWorktreeProjectId: null,
    gitProjects: {},
    worktrees: {},
    worktreeScripts: {}
  })

  function isGit(projectId: string): boolean {
    return state.gitProjects[projectId] ?? false
  }

  async function detectGitAndLoadWorktrees(project: Project): Promise<void> {
    const isGitRepo = await window.worktreeAPI.isGitRepo(project.path)
    setState('gitProjects', project.id, isGitRepo)
    if (isGitRepo) {
      await refreshWorktrees(project)
    }
  }

  async function refreshWorktrees(project: Project): Promise<void> {
    const wts = await window.worktreeAPI.list(project.path)
    setState('worktrees', project.id, wts)

    // Auto-expand main worktree
    for (const wt of wts) {
      if (wt.isMain) {
        const proj = props.store.projects.find((p) => p.id === project.id)
        if (proj && proj.expandedWorktrees?.[wt.path] === undefined) {
          if (!proj.expandedWorktrees) {
            props.setStore('projects', (p) => p.id === project.id, 'expandedWorktrees', {
              [wt.path]: true
            })
          } else {
            props.setStore(
              'projects',
              (p) => p.id === project.id,
              'expandedWorktrees',
              wt.path,
              true
            )
          }
          props.onSaveProjects()
        }
      }
    }

    for (const wt of wts) {
      const scripts = await window.worktreeAPI.readScripts(wt.path)
      setState('worktreeScripts', wt.path, scripts)
    }
  }

  onMount(() => {
    for (const project of props.store.projects) {
      detectGitAndLoadWorktrees(project)
    }
  })

  createEffect(() => {
    const projectIds = props.store.projects.map((p) => p.id)
    const known = Object.keys(state.gitProjects)
    for (const project of props.store.projects) {
      if (!known.includes(project.id)) {
        detectGitAndLoadWorktrees(project)
      }
    }
    for (const id of known) {
      if (!projectIds.includes(id)) {
        setState('gitProjects', id, undefined as unknown as boolean)
      }
    }
  })

  function toggleWorktreeExpanded(projectId: string, wtPath: string): void {
    const project = props.store.projects.find((p) => p.id === projectId)
    const current = project?.expandedWorktrees?.[wtPath] ?? false
    if (!project?.expandedWorktrees) {
      props.setStore('projects', (p) => p.id === projectId, 'expandedWorktrees', {
        [wtPath]: !current
      })
    } else {
      props.setStore('projects', (p) => p.id === projectId, 'expandedWorktrees', wtPath, !current)
    }
    props.onSaveProjects()
  }

  async function addProject(): Promise<void> {
    const folderPath = await window.projectAPI.selectFolder()
    if (!folderPath) return
    const meta = await window.projectAPI.readMetadata(folderPath)
    const project: Project = {
      id: crypto.randomUUID(),
      name: meta?.name || folderPath.split(/[\\/]/).pop() || 'Project',
      path: folderPath,
      scripts: meta?.scripts || {},
      projectType: meta?.projectType || 'unknown',
      persistentTerminals: [],
      collapsed: false
    }
    props.setStore('projects', (ps) => [...ps, project])
    props.onSaveProjects()
    detectGitAndLoadWorktrees(project)
  }

  function toggleCollapse(projectId: string): void {
    props.setStore(
      'projects',
      (p) => p.id === projectId,
      'collapsed',
      (c) => !c
    )
    props.onSaveProjects()
  }

  function removeProject(projectId: string): void {
    const project = props.store.projects.find((p) => p.id === projectId)
    if (!project) return
    const projectTabs = props.store.tabs.filter((t) => t.projectId === projectId)
    for (const tab of projectTabs) props.onCloseTab(tab.tabId)
    props.setStore('projects', (ps) => ps.filter((p) => p.id !== projectId))
    props.onSaveProjects()
  }

  function getScriptTab(project: Project, scriptName: string, cwd?: string): Tab | undefined {
    return props.store.tabs.find(
      (t) =>
        t.projectId === project.id &&
        t.type === 'script' &&
        t.initialCommand === project.scripts[scriptName] &&
        (!cwd || t.cwd === cwd)
    )
  }

  function scriptStatus(
    project: Project,
    scriptName: string,
    cwd?: string
  ): 'idle' | 'running' | 'success' | 'error' {
    const tab = getScriptTab(project, scriptName, cwd)
    if (!tab || !tab.status || tab.status === 'idle') return 'idle'
    if (tab.status === 'running') return 'running'
    if (tab.status === 'exited') return tab.exitCode === 0 ? 'success' : 'error'
    return 'idle'
  }

  function openScript(
    project: Project,
    scriptName: string,
    cwd: string,
    activate = true,
    autoRun = false
  ): void {
    const existing = getScriptTab(project, scriptName, cwd)
    if (existing) {
      if (activate) props.setStore('activeTabId', existing.tabId)
      if (autoRun) runScript(existing.tabId)
    } else {
      const tabId = crypto.randomUUID()
      props.onAddTab(
        {
          tabId,
          label: scriptName,
          cwd,
          projectId: project.id,
          type: 'script',
          initialCommand: project.scripts[scriptName],
          status: 'idle'
        },
        activate
      )
      if (autoRun) {
        queueMicrotask(() => runScript(tabId))
      }
    }
  }

  function openPersistentTerminal(project: Project, pt: PersistentTerminal): void {
    const existing = props.store.tabs.find((t) => t.persistentTerminalId === pt.id)
    if (existing) {
      props.setStore('activeTabId', existing.tabId)
    } else {
      const cwd = pt.worktreePath || project.path
      const tab: Tab = {
        tabId: crypto.randomUUID(),
        label: pt.label,
        cwd,
        projectId: project.id,
        type: 'persistent',
        persistentTerminalId: pt.id
      }
      props.onAddTab(tab)
    }
  }

  function removePersistentTerminal(project: Project, ptId: string): void {
    const tab = props.store.tabs.find((t) => t.persistentTerminalId === ptId)
    if (tab) props.onCloseTab(tab.tabId)
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'persistentTerminals',
      (pts) => pts.filter((pt) => pt.id !== ptId)
    )
    props.onSaveProjects()
  }

  function createTerminal(project: Project, worktreePath?: string): void {
    const terminalsForWt = project.persistentTerminals.filter(
      (pt) => (pt.worktreePath || project.path) === (worktreePath || project.path)
    )
    const count = terminalsForWt.length
    const label = count === 0 ? 'Terminal' : `Terminal ${count + 1}`
    const pt: PersistentTerminal = { id: crypto.randomUUID(), label, worktreePath }
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'persistentTerminals',
      (pts) => [...pts, pt]
    )
    props.onSaveProjects()
    openPersistentTerminal(project, pt)
  }

  function renameTerminal(project: Project, ptId: string, name: string): void {
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'persistentTerminals',
      (pts) => pts.map((pt) => (pt.id === ptId ? { ...pt, label: name, customLabel: true } : pt))
    )
    const tab = props.store.tabs.find((t) => t.persistentTerminalId === ptId)
    if (tab) props.setStore('tabs', (t) => t.tabId === tab.tabId, 'label', name)
    props.onSaveProjects()
  }

  function openOpencodeInstance(project: Project, instance: OpencodeInstance): void {
    const existing = props.store.tabs.find((t) => t.opencodeInstanceId === instance.id)
    if (existing) {
      props.setStore('activeTabId', existing.tabId)
    } else {
      const cwd = instance.worktreePath || project.path
      const tab: Tab = {
        tabId: crypto.randomUUID(),
        label: instance.label,
        cwd,
        projectId: project.id,
        type: 'opencode',
        opencodeInstanceId: instance.id,
        sessionId: instance.sessionId
      }
      props.onAddTab(tab)
    }
  }

  function removeOpencodeInstance(project: Project, instanceId: string): void {
    const tab = props.store.tabs.find((t) => t.opencodeInstanceId === instanceId)
    if (tab) props.onCloseTab(tab.tabId)
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'opencodeInstances',
      (instances) => (instances ?? []).filter((i) => i.id !== instanceId)
    )
    props.onSaveProjects()
  }

  async function createOpencodeInstance(project: Project, worktreePath?: string): Promise<void> {
    const cwd = worktreePath || project.path
    const started = await startServer(cwd)
    if (!started) return

    const instancesForCwd = (project.opencodeInstances ?? []).filter(
      (i) => (i.worktreePath || project.path) === cwd
    )
    const count = instancesForCwd.length
    const label = count === 0 ? 'AI Chat' : `AI Chat ${count + 1}`

    const instance: OpencodeInstance = {
      id: crypto.randomUUID(),
      label,
      worktreePath
    }
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'opencodeInstances',
      (instances) => [...(instances ?? []), instance]
    )
    props.onSaveProjects()
    openOpencodeInstance(project, instance)
  }

  function confirmRename(project: Project, ptId: string): void {
    const name = state.renameValue.trim()
    setState({ renamingTerminalId: null, renameValue: '' })
    if (name) renameTerminal(project, ptId, name)
  }

  function isScriptActive(project: Project, scriptName: string, cwd?: string): boolean {
    return props.store.tabs.some(
      (t) =>
        t.projectId === project.id &&
        t.type === 'script' &&
        t.initialCommand === project.scripts[scriptName] &&
        (!cwd || t.cwd === cwd) &&
        t.tabId === props.store.activeTabId
    )
  }

  function isPtActive(ptId: string): boolean {
    return props.store.tabs.some(
      (t) => t.persistentTerminalId === ptId && t.tabId === props.store.activeTabId
    )
  }

  function isOcInstanceActive(instanceId: string): boolean {
    return props.store.tabs.some(
      (t) => t.opencodeInstanceId === instanceId && t.tabId === props.store.activeTabId
    )
  }

  async function removeWorktree(project: Project, wt: WorktreeInfo): Promise<void> {
    const result = await window.worktreeAPI.remove(project.path, wt.path, false)
    if (!result.success) {
      const forceResult = await window.worktreeAPI.remove(project.path, wt.path, true)
      if (!forceResult.success) return
    }

    const tabsToClose = props.store.tabs.filter(
      (t) => t.projectId === project.id && t.cwd === wt.path
    )
    for (const tab of tabsToClose) props.onCloseTab(tab.tabId)

    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'persistentTerminals',
      (pts) => pts.filter((pt) => pt.worktreePath !== wt.path)
    )
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'opencodeInstances',
      (instances) => (instances ?? []).filter((i) => i.worktreePath !== wt.path)
    )
    props.onSaveProjects()

    await refreshWorktrees(project)
  }

  async function syncWorktreeFiles(project: Project, wt: WorktreeInfo): Promise<void> {
    const files = project.syncFiles ?? []
    if (files.length === 0) return
    await window.worktreeAPI.syncFiles(project.path, wt.path, files)
  }

  function scriptsAndTerminalsProps(
    project: Project,
    scripts: Record<string, string>,
    cwd: string,
    indent: number,
    worktreePath?: string
  ): ScriptsAndTerminalsProps {
    return {
      project,
      scripts,
      cwd,
      indent,
      worktreePath,
      renamingTerminalId: state.renamingTerminalId,
      renameValue: state.renameValue,
      onOpenScript: (scriptName, cwd) => openScript(project, scriptName, cwd),
      onRunScript: (scriptName, cwd) => openScript(project, scriptName, cwd, false, true),
      onCreateTerminal: (wtp) => createTerminal(project, wtp),
      onOpenTerminal: openPersistentTerminal,
      onRemoveTerminal: removePersistentTerminal,
      onStartRename: (ptId, label) => setState({ renamingTerminalId: ptId, renameValue: label }),
      onConfirmRename: confirmRename,
      onRenameInput: (value) => setState('renameValue', value),
      onCancelRename: () => setState({ renamingTerminalId: null, renameValue: '' }),
      isScriptActive: (scriptName, cwd) => isScriptActive(project, scriptName, cwd),
      scriptStatus: (scriptName, cwd) => scriptStatus(project, scriptName, cwd),
      getScriptTab: (scriptName, cwd) => getScriptTab(project, scriptName, cwd),
      isPtActive,
      onCreateOpencodeInstance: (wtp) => createOpencodeInstance(project, wtp),
      onOpenOpencodeInstance: openOpencodeInstance,
      onRemoveOpencodeInstance: removeOpencodeInstance,
      isOcInstanceActive,
      getOcSessionId: (instanceId) => {
        const inst = (project.opencodeInstances ?? []).find((i) => i.id === instanceId)
        return inst?.sessionId
      },
      isOcGenerating: (sessionId) => opencodeState.isGenerating[sessionId] ?? false,
      ocNeedsAttention: (sessionId) =>
        (opencodeState.pendingPermissions[sessionId]?.length ?? 0) > 0 ||
        (opencodeState.pendingQuestions[sessionId]?.length ?? 0) > 0
    }
  }

  return (
    <div
      style={{ width: `${props.width}px`, 'min-width': `${props.width}px` }}
      class="h-full bg-sidebar flex flex-col overflow-hidden"
    >
      {/* Project list */}
      <div class="flex-1 overflow-y-auto">
        {/* Empty state */}
        <Show when={props.store.projects.length === 0}>
          <div class="flex flex-col items-center justify-center h-full gap-3 p-6 text-center select-none">
            <FolderPlus size={28} class="text-muted opacity-60" />
            <p class="text-muted text-[12px] leading-relaxed opacity-70">
              No projects yet.
              <br />
              Add one to get started.
            </p>
          </div>
        </Show>

        <For each={props.store.projects}>
          {(project) => (
            <div>
              {/* Project header */}
              <div class="group flex items-center gap-1 px-2 h-9 border-b border-border cursor-pointer hover:bg-hover">
                <span
                  role="menuitem"
                  tabIndex={0}
                  class="flex-1 flex items-center gap-1.5 min-w-0"
                  onClick={() => toggleCollapse(project.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggleCollapse(project.id)
                  }}
                  title={project.path}
                >
                  <span class="text-muted flex-shrink-0 flex items-center">
                    {project.collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                  </span>
                  <span
                    class="font-medium text-[12px] truncate"
                    classList={{
                      'text-content': !project.collapsed,
                      'text-muted': project.collapsed
                    }}
                  >
                    {project.name}
                  </span>
                  <Show when={project.projectType !== 'unknown'}>
                    <span class="text-[9px] text-muted border border-border px-1 rounded font-mono flex-shrink-0 leading-[14px]">
                      {project.projectType}
                    </span>
                  </Show>
                </span>
                <Show when={isGit(project.id)}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setState('createWorktreeProjectId', project.id)
                    }}
                    class="invisible group-hover:visible bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center"
                    title="New worktree"
                  >
                    <Plus size={11} />
                  </button>
                </Show>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setState('settingsProjectId', project.id)
                  }}
                  class="invisible group-hover:visible bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center"
                  title="Project settings"
                >
                  <Settings size={11} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeProject(project.id)
                  }}
                  class="invisible group-hover:visible bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center"
                  title="Remove project"
                >
                  <X size={11} />
                </button>
              </div>

              {/* Expanded content */}
              <Show when={!project.collapsed}>
                <div class="border-b border-border">
                  <Show
                    when={isGit(project.id)}
                    fallback={
                      <ScriptsAndTerminals
                        {...scriptsAndTerminalsProps(project, project.scripts, project.path, 24)}
                      />
                    }
                  >
                    {/* Git project: show worktrees */}
                    <For each={state.worktrees[project.id] ?? []}>
                      {(wt) => {
                        const wtScripts = (): Record<string, string> =>
                          state.worktreeScripts[wt.path] ?? {}
                        const isExpanded = (): boolean =>
                          project.expandedWorktrees?.[wt.path] ?? false

                        return (
                          <div>
                            {/* Worktree header */}
                            <div class="group/wt flex items-center gap-1 py-[3px] px-2 pl-4 cursor-pointer hover:bg-hover">
                              <span
                                role="menuitem"
                                tabIndex={0}
                                class="flex-1 flex items-center gap-1.5 min-w-0"
                                onClick={() => toggleWorktreeExpanded(project.id, wt.path)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ')
                                    toggleWorktreeExpanded(project.id, wt.path)
                                }}
                                title={wt.path}
                              >
                                <span class="text-muted flex-shrink-0 flex items-center">
                                  {isExpanded() ? (
                                    <ChevronDown size={10} />
                                  ) : (
                                    <ChevronRight size={10} />
                                  )}
                                </span>
                                <span
                                  class="text-[12px] truncate"
                                  classList={{
                                    'text-content': isExpanded(),
                                    'text-muted': !isExpanded()
                                  }}
                                >
                                  {wt.branch}
                                </span>
                                <Show when={wt.isMain}>
                                  <span class="text-[10px] flex-shrink-0 text-status-running">
                                    ★
                                  </span>
                                </Show>
                              </span>
                              <Show when={!wt.isMain}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    syncWorktreeFiles(project, wt)
                                  }}
                                  class="invisible group-hover/wt:visible bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center"
                                  title="Sync configured files"
                                >
                                  <RefreshCw size={10} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removeWorktree(project, wt)
                                  }}
                                  class="invisible group-hover/wt:visible bg-transparent hover:bg-border border-none text-content/60 hover:text-content cursor-pointer p-1 rounded transition-colors flex items-center"
                                  title="Remove worktree"
                                >
                                  <X size={10} />
                                </button>
                              </Show>
                            </div>

                            <Show when={isExpanded()}>
                              <ScriptsAndTerminals
                                {...scriptsAndTerminalsProps(
                                  project,
                                  wtScripts(),
                                  wt.path,
                                  24,
                                  wt.path
                                )}
                              />
                            </Show>
                          </div>
                        )
                      }}
                    </For>
                  </Show>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>

      {/* Add Project */}
      <div class="border-t border-border">
        <button
          type="button"
          onClick={addProject}
          class="w-full py-1.5 px-2 bg-transparent border-none text-content/60 hover:text-content cursor-pointer text-[11px] flex items-center justify-center gap-1 transition-colors"
        >
          <FolderPlus size={10} />
          Add Project
        </button>
      </div>

      {/* Project settings modal */}
      <Show when={state.settingsProjectId}>
        {(id) => {
          const project = props.store.projects.find((p) => p.id === id())
          return (
            <Show when={project}>
              {(proj) => (
                <ProjectSettings
                  project={proj()}
                  isGitProject={isGit(proj().id)}
                  onClose={() => setState('settingsProjectId', null)}
                  onUpdate={(updates) => {
                    props.setStore(
                      'projects',
                      (p) => p.id === id(),
                      (prev) => ({ ...prev, ...updates })
                    )
                    props.onSaveProjects()
                  }}
                />
              )}
            </Show>
          )
        }}
      </Show>

      {/* Create worktree dialog */}
      <Show when={state.createWorktreeProjectId}>
        {(id) => {
          const project = props.store.projects.find((p) => p.id === id())
          return (
            <Show when={project}>
              {(proj) => (
                <CreateWorktreeDialog
                  projectPath={proj().path}
                  projectName={proj().name}
                  syncFiles={proj().syncFiles ?? []}
                  onCreated={() => refreshWorktrees(proj())}
                  onClose={() => setState('createWorktreeProjectId', null)}
                />
              )}
            </Show>
          )
        }}
      </Show>
    </div>
  )
}
