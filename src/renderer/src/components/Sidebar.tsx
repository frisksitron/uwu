import { FolderPlus } from 'lucide-solid'
import { createEffect, For, type JSX, onMount, Show } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import { createStore } from 'solid-js/store'
import { type ProjectContextValue, ProjectProvider } from '../context/ProjectContext'
import { getOcActivity, opencodeState, startServer } from '../opencodeStore'
import { runScript } from '../scriptActions'
import type {
  AppState,
  OpencodeInstance,
  OpencodeTab,
  PersistentTab,
  PersistentTerminal,
  Project,
  ScriptTab,
  Tab,
  WorktreeInfo
} from '../types'
import CreateWorktreeDialog from './CreateWorktreeDialog'
import ProjectSettings from './ProjectSettings'
import ScriptsAndTerminals from './ScriptsAndTerminals'
import AddProjectButton from './sidebar/AddProjectButton'
import ProjectHeader from './sidebar/ProjectHeader'
import WorktreeList from './sidebar/WorktreeList'

interface SidebarProps {
  store: AppState
  setStore: SetStoreFunction<AppState>
  onAddTab: (tab: Tab, activate?: boolean) => void
  onCloseTab: (tabId: string) => void
  width: number
}

interface SidebarState {
  renamingTerminalId: string | null
  renameValue: string
  settingsProjectId: string | null
  createWorktreeProjectId: string | null
}

export default function Sidebar(props: SidebarProps): JSX.Element {
  const [state, setState] = createStore<SidebarState>({
    renamingTerminalId: null,
    renameValue: '',
    settingsProjectId: null,
    createWorktreeProjectId: null
  })

  function allScripts(project: Project): Record<string, string> {
    return { ...project.scripts, ...(project.customScripts ?? {}) }
  }

  async function detectGitAndLoadWorktrees(project: Project): Promise<void> {
    const isGitRepo = await window.worktreeAPI.isGitRepo(project.path)
    props.setStore('projects', (p) => p.id === project.id, 'isGit', isGitRepo)
    if (isGitRepo) {
      await refreshWorktrees(project)
    }
  }

  async function refreshWorktrees(project: Project): Promise<void> {
    const wts = await window.worktreeAPI.list(project.path)
    props.setStore('projects', (p) => p.id === project.id, 'worktrees', wts)

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
        }
      }
    }
  }

  onMount(() => {
    for (const project of props.store.projects) {
      detectGitAndLoadWorktrees(project)
    }
  })

  createEffect(() => {
    for (const project of props.store.projects) {
      if (project.isGit === undefined) {
        detectGitAndLoadWorktrees(project)
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
    detectGitAndLoadWorktrees(project)
  }

  function toggleCollapse(projectId: string): void {
    props.setStore(
      'projects',
      (p) => p.id === projectId,
      'collapsed',
      (c) => !c
    )
  }

  function removeProject(projectId: string): void {
    const project = props.store.projects.find((p) => p.id === projectId)
    if (!project) return
    const projectTabs = props.store.tabs.filter((t) => t.projectId === projectId)
    for (const tab of projectTabs) props.onCloseTab(tab.tabId)
    props.setStore('projects', (ps) => ps.filter((p) => p.id !== projectId))
  }

  // --- Project-scoped operations for context ---

  function getScriptTab(project: Project, scriptName: string, cwd?: string): ScriptTab | undefined {
    return props.store.tabs.find(
      (t): t is ScriptTab =>
        t.projectId === project.id &&
        t.type === 'script' &&
        t.initialCommand === allScripts(project)[scriptName] &&
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
      const tab: ScriptTab = {
        tabId,
        label: scriptName,
        cwd,
        projectId: project.id,
        type: 'script',
        initialCommand: allScripts(project)[scriptName],
        status: 'idle'
      }
      props.onAddTab(tab, activate)
      if (autoRun) {
        queueMicrotask(() => runScript(tabId))
      }
    }
  }

  function openPersistentTerminal(project: Project, pt: PersistentTerminal): void {
    const existing = props.store.tabs.find(
      (t): t is PersistentTab => t.type === 'persistent' && t.persistentTerminalId === pt.id
    )
    if (existing) {
      props.setStore('activeTabId', existing.tabId)
    } else {
      const cwd = pt.worktreePath || project.path
      const tab: PersistentTab = {
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
    const tab = props.store.tabs.find(
      (t) => t.type === 'persistent' && t.persistentTerminalId === ptId
    )
    if (tab) props.onCloseTab(tab.tabId)
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'persistentTerminals',
      (pts) => pts.filter((pt) => pt.id !== ptId)
    )
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
    openPersistentTerminal(project, pt)
  }

  function renameTerminal(project: Project, ptId: string, name: string): void {
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'persistentTerminals',
      (pts) => pts.map((pt) => (pt.id === ptId ? { ...pt, label: name, customLabel: true } : pt))
    )
    const tab = props.store.tabs.find(
      (t) => t.type === 'persistent' && t.persistentTerminalId === ptId
    )
    if (tab) props.setStore('tabs', (t) => t.tabId === tab.tabId, 'label', name)
  }

  function openOpencodeInstance(project: Project, instance: OpencodeInstance): void {
    const existing = props.store.tabs.find(
      (t): t is OpencodeTab => t.type === 'opencode' && t.opencodeInstanceId === instance.id
    )
    if (existing) {
      props.setStore('activeTabId', existing.tabId)
    } else {
      const cwd = instance.worktreePath || project.path
      const tab: OpencodeTab = {
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
    const tab = props.store.tabs.find(
      (t) => t.type === 'opencode' && t.opencodeInstanceId === instanceId
    )
    if (tab) props.onCloseTab(tab.tabId)
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'opencodeInstances',
      (instances) => (instances ?? []).filter((i) => i.id !== instanceId)
    )
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
        t.initialCommand === allScripts(project)[scriptName] &&
        (!cwd || t.cwd === cwd) &&
        t.tabId === props.store.activeTabId
    )
  }

  function isPtActive(ptId: string): boolean {
    return props.store.tabs.some(
      (t) =>
        t.type === 'persistent' &&
        t.persistentTerminalId === ptId &&
        t.tabId === props.store.activeTabId
    )
  }

  function isOcInstanceActive(instanceId: string): boolean {
    return props.store.tabs.some(
      (t) =>
        t.type === 'opencode' &&
        t.opencodeInstanceId === instanceId &&
        t.tabId === props.store.activeTabId
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

    await refreshWorktrees(project)
  }

  async function syncWorktreeFiles(project: Project, wt: WorktreeInfo): Promise<void> {
    const files = project.syncFiles ?? []
    if (files.length === 0) return
    await window.worktreeAPI.syncFiles(project.path, wt.path, [...files])
  }

  function createProjectContext(project: Project): ProjectContextValue {
    return {
      project: () => project,
      onOpenScript: (scriptName, cwd) => openScript(project, scriptName, cwd),
      onRunScript: (scriptName, cwd) => openScript(project, scriptName, cwd, false, true),
      onCreateTerminal: (wtp) => createTerminal(project, wtp),
      onOpenTerminal: (pt) => openPersistentTerminal(project, pt),
      onRemoveTerminal: (ptId) => removePersistentTerminal(project, ptId),
      onStartRename: (ptId, label) => setState({ renamingTerminalId: ptId, renameValue: label }),
      onConfirmRename: (ptId) => confirmRename(project, ptId),
      onRenameInput: (value) => setState('renameValue', value),
      onCancelRename: () => setState({ renamingTerminalId: null, renameValue: '' }),
      isScriptActive: (scriptName, cwd) => isScriptActive(project, scriptName, cwd),
      scriptStatus: (scriptName, cwd) => scriptStatus(project, scriptName, cwd),
      getScriptTab: (scriptName, cwd) => getScriptTab(project, scriptName, cwd),
      isPtActive,
      onCreateOpencodeInstance: (wtp) => createOpencodeInstance(project, wtp),
      onOpenOpencodeInstance: (instance) => openOpencodeInstance(project, instance),
      onRemoveOpencodeInstance: (instanceId) => removeOpencodeInstance(project, instanceId),
      isOcInstanceActive,
      getOcSessionId: (instanceId) => {
        const inst = (project.opencodeInstances ?? []).find((i) => i.id === instanceId)
        return inst?.sessionId
      },
      isOcGenerating: (sessionId) => opencodeState.isGenerating[sessionId] ?? false,
      ocNeedsAttention: (sessionId) =>
        (opencodeState.pendingPermissions[sessionId]?.length ?? 0) > 0 ||
        (opencodeState.pendingQuestions[sessionId]?.length ?? 0) > 0,
      ocActivity: (sessionId) => getOcActivity(sessionId),
      renamingTerminalId: () => state.renamingTerminalId,
      renameValue: () => state.renameValue
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
            <ProjectProvider value={createProjectContext(project)}>
              <div>
                <ProjectHeader
                  project={project}
                  isGit={project.isGit ?? false}
                  onToggleCollapse={() => toggleCollapse(project.id)}
                  onSettings={() => setState('settingsProjectId', project.id)}
                  onRemove={() => removeProject(project.id)}
                  onNewWorktree={() => setState('createWorktreeProjectId', project.id)}
                />

                <Show when={!project.collapsed}>
                  <div class="border-b border-border">
                    <Show
                      when={project.isGit}
                      fallback={
                        <ScriptsAndTerminals
                          scripts={allScripts(project)}
                          customScriptNames={new Set(Object.keys(project.customScripts ?? {}))}
                          cwd={project.path}
                          indent={24}
                        />
                      }
                    >
                      <WorktreeList
                        project={project}
                        worktrees={project.worktrees ?? []}
                        onToggleExpanded={(wtPath) => toggleWorktreeExpanded(project.id, wtPath)}
                        onRemoveWorktree={(wt) => removeWorktree(project, wt)}
                        onSyncFiles={(wt) => syncWorktreeFiles(project, wt)}
                      />
                    </Show>
                  </div>
                </Show>
              </div>
            </ProjectProvider>
          )}
        </For>
      </div>

      <AddProjectButton onClick={addProject} />

      {/* Project settings modal */}
      <Show when={state.settingsProjectId}>
        {(id) => {
          const project = props.store.projects.find((p) => p.id === id())
          return (
            <Show when={project}>
              {(proj) => (
                <ProjectSettings
                  project={proj()}
                  isGitProject={proj().isGit ?? false}
                  onClose={() => setState('settingsProjectId', null)}
                  onUpdate={(updates) => {
                    props.setStore(
                      'projects',
                      (p) => p.id === id(),
                      (prev) => ({ ...prev, ...updates })
                    )
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
