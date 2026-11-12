import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Circle, Code2, File, FilePlus2, Folder, FolderOpen, HardDrive, Layers3, Moon, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Save, Search, Sun, X } from 'lucide-react'
import brandLogo from './assets/brand/frzn-lockup-horizontal.svg'
import { Canvas, type CanvasHandle } from './Canvas'
import { flushProjects, isDirty, newProject, openProjects, persistSession, saveProject } from './projects'
import { useProjects } from './store'
import type { ProjectEntry, WorkspaceInfo } from '../../shared/contracts'

function Tree({ entries, filter, activePath, open }: { entries: ProjectEntry[]; filter: string; activePath?: string; open(path: string): void }) {
  return <>{entries.map(entry => {
    if (entry.kind === 'folder') return <FolderBranch key={entry.path} entry={entry} filter={filter} activePath={activePath} open={open}/>
    if (filter && !entry.name.toLowerCase().includes(filter.toLowerCase())) return null
    return <button key={entry.path} className={`tree-file ${entry.path === activePath ? 'selected' : ''}`} title={entry.path} onClick={() => open(entry.path)}><File size={15}/><span>{entry.name.replace(/\.excalidraw$/i, '')}</span>{entry.path === activePath && <span className="active-dot"/>}</button>
  })}</>
}
function FolderBranch({ entry, ...props }: { entry: ProjectEntry; filter: string; activePath?: string; open(path: string): void }) {
  const [expanded, setExpanded] = useState(false)
  const hasMatch = (entries: ProjectEntry[]): boolean => entries.some(item => item.kind === 'folder' ? hasMatch(item.children || []) : item.name.toLowerCase().includes(props.filter.toLowerCase()))
  if (props.filter && !hasMatch(entry.children || [])) return null
  return <div className="tree-folder"><button onClick={() => setExpanded(!expanded)}>{expanded || props.filter ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<Folder size={15}/><span>{entry.name}</span></button>{(expanded || props.filter) && <div className="tree-children"><Tree entries={entry.children || []} {...props}/></div>}</div>
}

export function App() {
  const { tabs, activeId, activate, remove } = useProjects()
  const active = tabs.find(tab => tab.id === activeId)
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [sidebar, setSidebar] = useState(true)
  const workspaceElement = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [filter, setFilter] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [closingTab, setClosingTab] = useState<string | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const canvas = useRef<CanvasHandle>(null)
  const shuttingDown = useRef(false)

  const run = useCallback(async (action: () => Promise<unknown>) => {
    try { await action() } catch (error) { setMessage(String(error)) }
  }, [])
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === workspaceElement.current)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  const toggleFullscreen = useCallback(() => {
    void run(async () => {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await workspaceElement.current?.requestFullscreen()
    })
  }, [run])

  const refresh = useCallback(async () => { setWorkspace(await window.desktop.workspace()) }, [])
  const open = useCallback(async (path?: string) => { await openProjects(await window.desktop.open(path)) }, [])

  useEffect(() => {
    const removeOpen = window.desktop.onOpenFiles(projects => { void run(() => openProjects(projects)) })
    const removeClose = window.desktop.onClosing(async () => {
      shuttingDown.current = true
      setIsClosing(true)
      try { await flushProjects() } catch (error) { shuttingDown.current = false; setIsClosing(false); throw error }
    })
    void (async () => {
      try {
        await refresh()
        const session = await window.desktop.session()
        const errors: string[] = []
        for (const path of session.paths) {
          try { await open(path) } catch { errors.push(path) }
        }
        const restored = useProjects.getState().tabs.find(tab => tab.path === session.activePath)
        if (restored) activate(restored.id)
        if (errors.length) setMessage(`Alguns projetos não puderam ser restaurados. Verifique se os arquivos ainda existem: ${errors.join(', ')}`)
      } catch (error) { setMessage(String(error)) }
      finally {
        if (!useProjects.getState().tabs.length) newProject()
        setReady(true)
      }
    })()
    return () => { removeOpen(); removeClose() }
  }, [activate, open, refresh, run])

  const revisions = tabs.map(tab => `${tab.id}:${tab.revision}:${tab.savedRevision}:${!!tab.error}`).join('|')
  useEffect(() => {
    if (!ready || shuttingDown.current) return
    const timers = useProjects.getState().tabs.filter(tab => isDirty(tab) && !tab.error).map(tab => setTimeout(() => {
      void run(async () => { await saveProject(tab.id); await refresh() })
    }, 1000))
    return () => timers.forEach(clearTimeout)
  }, [revisions, ready, refresh, run])

  const sessionKey = tabs.map(tab => `${tab.id}:${tab.path}`).join('|') + activeId
  useEffect(() => {
    if (ready && !shuttingDown.current) void run(persistSession)
  }, [sessionKey, ready, run])

  const save = useCallback(async (saveAs = false) => {
    const id = useProjects.getState().activeId
    if (!id) return
    await saveProject(id, saveAs)
    await refresh()
  }, [refresh])

  const closeTab = useCallback(async (id: string) => {
    const tab = useProjects.getState().tabs.find(tab => tab.id === id)
    if (!tab || closingTab) return
    setClosingTab(id)
    try {
      if (isDirty(tab) || tab.saving || tab.error) {
        if (!await saveProject(id)) return
      }
      remove(id)
      if (!useProjects.getState().tabs.length) newProject()
      await refresh()
    } finally { setClosingTab(null) }
  }, [closingTab, remove, refresh])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      // Monaco owns shortcuts while its modal is open.
      if (document.querySelector('dialog[open]')) return
      const key = event.key.toLowerCase()
      if (['s', 'o', 'n', 'w', 'tab'].includes(key)) event.preventDefault()
      if (key === 's') void run(() => save(event.shiftKey))
      if (key === 'o') void run(() => open())
      if (key === 'n') newProject()
      if (key === 'w') void run(() => closeTab(useProjects.getState().activeId))
      if (key === 'tab') {
        const state = useProjects.getState()
        const index = state.tabs.findIndex(tab => tab.id === state.activeId)
        const next = (index + (event.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length
        if (state.tabs[next]) activate(state.tabs[next].id)
      }
    }
    window.addEventListener('keydown', keydown, true)
    const focus = () => { void run(refresh) }
    window.addEventListener('focus', focus)
    return () => { window.removeEventListener('keydown', keydown, true); window.removeEventListener('focus', focus) }
  }, [activate, closeTab, open, refresh, run, save])

  return <div className="app-shell" inert={isClosing}>
    <header className="app-header">
      <div className="brand">
        <img src={brandLogo} alt="FRZN" />
        <span>Excalidraw</span>
      </div>
      <button className="icon-button" aria-label={theme === 'light' ? 'Ativar canvas escuro' : 'Ativar canvas claro'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        {theme === 'light' ? <Moon size={17}/> : <Sun size={17}/>}
      </button>
    </header>
    <div className="app-body">
      {sidebar && <aside className="sidebar"><div className="workspace-heading"><span>ESPAÇO DE TRABALHO</span><button className="icon-button" aria-label="Recolher projetos" onClick={() => setSidebar(false)}><PanelLeftClose size={16}/></button></div><button className="workspace-picker" title={workspace?.root} onClick={() => void run(async () => { const selected = await window.desktop.chooseWorkspace(); if (selected) setWorkspace(selected) })}><span className="folder-badge"><FolderOpen size={19}/></span><div><strong>{workspace?.root.split(/[\\/]/).at(-1) || 'Meus projetos'}</strong><small>Pasta local <ArrowUpRight size={11}/></small></div><ChevronDown size={14}/></button>
        <button className="button new-project" onClick={newProject}><Plus size={17}/> Novo desenho<span>Ctrl N</span></button>
        <label className="search-box"><Search size={15}/><input aria-label="Buscar projetos" placeholder="Buscar um projeto…" value={filter} onChange={event => setFilter(event.target.value)}/></label>
        <div className="project-list-heading"><span>PROJETOS</span><div><button className="icon-button" aria-label="Abrir projeto" title="Abrir projeto (Ctrl+O)" onClick={() => void run(() => open())}><FolderOpen size={15}/></button><button className="icon-button" aria-label="Atualizar projetos" onClick={() => void run(refresh)}><RefreshCw size={14}/></button></div></div>
        <nav className="project-tree" aria-label="Projetos locais"><Tree entries={workspace?.entries || []} filter={filter} activePath={active?.path} open={path => void run(() => open(path))}/>{!workspace?.entries.length && <div className="empty-projects"><FilePlus2 size={26}/><p>Ideias merecem espaço.</p><span>Crie seu primeiro desenho.<br/>Ele será salvo nesta pasta.</span></div>}</nav>
        <div className="sidebar-bottom"><div><HardDrive size={17}/><strong>Local por natureza</strong><span className="status-dot"/></div><p>Desenhos e código juntos.<br/>Sem conta, prontos para ficar com você.</p></div>
      </aside>}
      <main ref={workspaceElement} className="main-workspace"><div className="tabbar">{!sidebar && <button className="icon-button sidebar-toggle" aria-label="Mostrar projetos" onClick={() => setSidebar(true)}><PanelLeftOpen size={17}/></button>}<div className="tabs" role="tablist" aria-label="Desenhos abertos">{tabs.map(tab => <div key={tab.id} className={`tab ${activeId === tab.id ? 'active' : ''}`}><button role="tab" aria-selected={activeId === tab.id} onClick={() => activate(tab.id)} title={tab.path || tab.title}><File size={14}/><span>{tab.title}</span>{isDirty(tab) && <Circle size={7} fill="currentColor"/>}</button><button className="close-tab" aria-label={`Fechar ${tab.title}`} disabled={closingTab === tab.id} onClick={() => void run(() => closeTab(tab.id))}><X size={13}/></button></div>)}</div><button className="icon-button add-tab" aria-label="Nova aba" onClick={newProject}><Plus size={17}/></button></div>
        <div className="document-toolbar"><div className="document-title"><span className="document-symbol"><Layers3 size={17}/></span><div><strong>{active?.title || 'Carregando espaço…'}</strong><span>{active?.path ? '.excalidraw · Salvo no computador' : 'Novo desenho · Salvamento automático ao editar'}</span></div></div><div className="document-actions"><button className="button secondary" disabled={!active} onClick={() => canvas.current?.addCode()}><Code2 size={16}/>Bloco de código</button><button className="button ghost" disabled={!active || active.saving} onClick={() => void run(() => save(true))}>Salvar como</button><button className="button primary" disabled={!active || active.saving} onClick={() => void run(() => save())}><Save size={15}/>{active?.saving ? 'Salvando…' : 'Salvar'}</button></div></div>
        {message && <div className="error-banner" role="alert"><span>{message}</span><button className="icon-button" aria-label="Dispensar aviso" onClick={() => setMessage('')}><X size={16}/></button></div>}
        {active?.error && <div className="error-banner" role="alert"><span>Falha ao salvar: {active.error}</span><button className="button ghost" onClick={() => void run(() => save())}>Tentar novamente</button></div>}
        <div className="canvas-wrap">{ready && active ? <Canvas ref={canvas} key={active.id} tabId={active.id} title={active.title} theme={theme} fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen}/> : <div className="loading-overlay">Preparando seu espaço de trabalho…</div>}</div>
        <footer className="statusbar"><div className={active?.error ? 'save-error' : ''}>{active?.error ? <Circle size={9}/> : active?.saving ? <RefreshCw size={12} className="spinning"/> : <Check size={13}/>}<span>{active?.error ? 'Alterações pendentes' : active?.saving ? 'Salvando no computador…' : active && isDirty(active) ? 'Salvamento automático em instantes' : active?.path ? 'Todas as alterações salvas' : 'Pronto para desenhar'}</span></div><div><span>{tabs.length} {tabs.length === 1 ? 'aba aberta' : 'abas abertas'}</span><span className="status-divider"/><span>Duplo clique para editar blocos de código</span></div></footer>
      </main>
    </div>
  </div>
}
