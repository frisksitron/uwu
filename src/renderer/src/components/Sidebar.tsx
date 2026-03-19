import { FolderPlus } from 'lucide-solid'
import { createEffect, For, type JSX, onMount, Show } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import { createStore, produce } from 'solid-js/store'
import { type ProjectContextValue, ProjectProvider } from '../context/ProjectContext'
import { getOcActivity, opencodeState, startServer } from '../opencodeStore'
import { runScript } from '../scriptActions'
import { closeTab as closeTabRuntime, isOpen, openTab, removeTab, tabRuntime } from '../tabRuntime'
import type {
  AppState,
  OpencodeTab,
  Project,
  TerminalTab,
  WorkspaceTab,
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
  onCloseView: (id: string) => void
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

      // Ensure worktree has workspace items (reconcile scripts for worktrees)
      const proj = props.store.projects.find((p) => p.id === project.id)
      if (proj && !proj.workspaces[wt.path]) {
        const items: WorkspaceTab[] = []
        for (const name of Object.keys(wt.scripts ?? {})) {
          items.push({ id: crypto.randomUUID(), type: 'script', name })
        }
        props.setStore('projects', (p) => p.id === project.id, 'workspaces', wt.path, items)
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

    const scripts = meta?.scripts || {}
    const items: WorkspaceTab[] = Object.keys(scripts).map((name) => ({
      id: crypto.randomUUID(),
      type: 'script' as const,
      name
    }))

    const project: Project = {
      id: crypto.randomUUID(),
      name: meta?.name || folderPath.split(/[\\/]/).pop() || 'Project',
      path: folderPath,
      scripts,
      projectType: meta?.projectType || 'unknown',
      collapsed: false,
      workspaces: { [folderPath]: items }
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
    // Close all open views for this project
    for (const [, items] of Object.entries(project.workspaces ?? {})) {
      for (const item of items) {
        if (isOpen(item.id)) {
          props.onCloseView(item.id)
          removeTab(item.id)
        }
      }
    }
    props.setStore('projects', (ps) => ps.filter((p) => p.id !== projectId))
  }

  // --- Workspace item operations ---

  function openItem(_project: Project, item: WorkspaceTab, _cwd: string): void {
    if (isOpen(item.id)) {
      props.setStore('activeTabId', item.id)
      return
    }
    openTab(item.id)
    props.setStore('activeTabId', item.id)
  }

  function runScriptItem(_project: Project, item: WorkspaceTab, _cwd: string): void {
    if (isOpen(item.id)) {
      runScript(item.id)
    } else {
      openTab(item.id)
      props.setStore('activeTabId', item.id)
      queueMicrotask(() => runScript(item.id))
    }
  }

  function closeItem(id: string): void {
    closeTabRuntime(id)
    if (props.store.activeTabId === id) {
      // Find next open tab
      const nextId = findNextOpenTab(id)
      props.setStore('activeTabId', nextId)
    }
  }

  function removeItem(project: Project, id: string, cwd: string): void {
    // Close the view first
    if (isOpen(id)) {
      props.onCloseView(id)
      removeTab(id)
    }
    // Remove from workspace
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'workspaces',
      cwd,
      (items) => (items ?? []).filter((i) => i.id !== id)
    )
    if (props.store.activeTabId === id) {
      props.setStore('activeTabId', findNextOpenTab(id))
    }
  }

  function hideScript(project: Project, id: string, cwd: string): void {
    if (isOpen(id)) {
      props.onCloseView(id)
      removeTab(id)
    }
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'workspaces',
      cwd,
      (items) =>
        (items ?? []).map((i) => (i.id === id && i.type === 'script' ? { ...i, hidden: true } : i))
    )
    if (props.store.activeTabId === id) {
      props.setStore('activeTabId', findNextOpenTab(id))
    }
  }

  function findNextOpenTab(excludeId: string): string | null {
    for (const project of props.store.projects) {
      for (const [, items] of Object.entries(project.workspaces ?? {})) {
        for (const item of items) {
          if (item.id !== excludeId && isOpen(item.id)) return item.id
        }
      }
    }
    return null
  }

  function createTerminal(project: Project, worktreePath?: string): void {
    const cwd = worktreePath || project.path
    const items = project.workspaces?.[cwd] ?? []
    const terminalsInCwd = items.filter((i) => i.type === 'terminal')
    const count = terminalsInCwd.length
    const label = count === 0 ? 'Terminal' : `Terminal ${count + 1}`
    const tab: TerminalTab = { id: crypto.randomUUID(), type: 'terminal', label }

    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'workspaces',
      cwd,
      (items) => [...(items ?? []), tab]
    )
    openTab(tab.id)
    props.setStore('activeTabId', tab.id)
  }

  async function createOpencodeInstance(project: Project, worktreePath?: string): Promise<void> {
    const cwd = worktreePath || project.path
    const started = await startServer(cwd)
    if (!started) return

    const items = project.workspaces?.[cwd] ?? []
    const ocInCwd = items.filter((i) => i.type === 'opencode')
    const count = ocInCwd.length
    const label = count === 0 ? 'AI Chat' : `AI Chat ${count + 1}`
    const tab: OpencodeTab = { id: crypto.randomUUID(), type: 'opencode', label }

    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'workspaces',
      cwd,
      (items) => [...(items ?? []), tab]
    )
    openTab(tab.id)
    props.setStore('activeTabId', tab.id)
  }

  function renameTerminal(project: Project, id: string, cwd: string, name: string): void {
    props.setStore(
      'projects',
      (p) => p.id === project.id,
      'workspaces',
      cwd,
      (items) =>
        (items ?? []).map((i) =>
          i.id === id && i.type === 'terminal' ? { ...i, label: name, customLabel: true } : i
        )
    )
  }

  function confirmRename(project: Project, id: string, cwd: string): void {
    const name = state.renameValue.trim()
    setState({ renamingTerminalId: null, renameValue: '' })
    if (name) renameTerminal(project, id, cwd, name)
  }

  function openDiff(project: Project, worktreePath?: string): void {
    const cwd = worktreePath || project.path
    const diffId = `diff:${project.id}:${cwd}`
    if (isOpen(diffId)) {
      props.setStore('activeTabId', diffId)
    } else {
      openTab(diffId)
      props.setStore('activeTabId', diffId)
    }
  }

  function isDiffActive(project: Project, cwd: string): boolean {
    const diffId = `diff:${project.id}:${cwd}`
    return props.store.activeTabId === diffId
  }

  function reorderItems(project: Project, cwd: string, newOrder: WorkspaceTab[]): void {
    // Use produce to sort in-place, preserving store proxy identity so <For> reuses components
    const idOrder = newOrder.map((i) => i.id)
    props.setStore(
      produce((s) => {
        const proj = s.projects.find((p) => p.id === project.id)
        if (!proj?.workspaces?.[cwd]) return
        proj.workspaces[cwd].sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id))
      })
    )
  }

  function isItemActive(id: string): boolean {
    return props.store.activeTabId === id
  }

  function getItemStatus(id: string): 'idle' | 'running' | 'success' | 'error' {
    const rt = tabRuntime[id]
    if (!rt?.status || rt.status === 'idle') return 'idle'
    if (rt.status === 'running') return 'running'
    if (rt.status === 'exited') return rt.exitCode === 0 ? 'success' : 'error'
    return 'idle'
  }

  async function removeWorktree(project: Project, wt: WorktreeInfo): Promise<void> {
    const result = await window.worktreeAPI.remove(project.path, wt.path, false)
    if (!result.success) {
      const forceResult = await window.worktreeAPI.remove(project.path, wt.path, true)
      if (!forceResult.success) return
    }

    // Close all open views for this worktree
    const items = project.workspaces?.[wt.path] ?? []
    for (const item of items) {
      if (isOpen(item.id)) {
        props.onCloseView(item.id)
        removeTab(item.id)
      }
    }

    // Remove workspace
    // biome-ignore lint/style/noNonNullAssertion: removing key from store requires undefined
    props.setStore('projects', (p) => p.id === project.id, 'workspaces', wt.path, undefined!)

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
      onOpenItem: (item, cwd) => openItem(project, item, cwd),
      onRunScript: (item, cwd) => runScriptItem(project, item, cwd),
      onCloseItem: (id) => closeItem(id),
      onRemoveItem: (id, cwd) => removeItem(project, id, cwd),
      onHideScript: (id, cwd) => hideScript(project, id, cwd),
      onCreateTerminal: (wtp) => createTerminal(project, wtp),
      onCreateOpencodeInstance: (wtp) => createOpencodeInstance(project, wtp),
      onStartRename: (id, label) => setState({ renamingTerminalId: id, renameValue: label }),
      onConfirmRename: (id, cwd) => confirmRename(project, id, cwd),
      onRenameInput: (value) => setState('renameValue', value),
      onCancelRename: () => setState({ renamingTerminalId: null, renameValue: '' }),
      onReorderItems: (cwd, newItems) => reorderItems(project, cwd, newItems),
      isItemActive,
      getItemStatus,
      getOcSessionId: (id) => {
        const items = Object.values(project.workspaces ?? {}).flat()
        const item = items.find((i) => i.id === id)
        if (item?.type === 'opencode') return item.sessionId
        return undefined
      },
      isOcGenerating: (sessionId) => opencodeState.isGenerating[sessionId] ?? false,
      ocNeedsAttention: (sessionId) =>
        (opencodeState.pendingPermissions[sessionId]?.length ?? 0) > 0 ||
        (opencodeState.pendingQuestions[sessionId]?.length ?? 0) > 0,
      ocActivity: (sessionId) => getOcActivity(sessionId),
      onOpenDiff: (wtp) => openDiff(project, wtp),
      isDiffActive: (cwd) => isDiffActive(project, cwd),
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
                          items={project.workspaces?.[project.path] ?? []}
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
