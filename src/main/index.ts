import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { atomicWrite, authorizeWorkspaceFile, createProject, readTree, safeTitle } from './storage'
import { MAX_SCENE_BYTES, validateScene } from '../shared/scene'
import type { OpenedProject, Session } from '../shared/contracts'

let window: BrowserWindow | null = null
let root: string
let preferencesPath: string
let session: Session = { paths: [] }
let allowClose = false
let closing = false
let rendererReady = false
let closeTimer: ReturnType<typeof setTimeout> | undefined
const authorized = new Set<string>()
const pendingFiles: string[] = []
let preferencesQueue = Promise.resolve()

function persistPreferences(): Promise<void> {
  const data = JSON.stringify({ root, session })
  const task = preferencesQueue.catch(() => undefined).then(() => atomicWrite(preferencesPath, data))
  preferencesQueue = task
  return task
}

async function readProject(filePath: string): Promise<OpenedProject> {
  if (!/\.excalidraw$/i.test(filePath)) throw new Error('Selecione um arquivo .excalidraw.')
  const stat = await fs.stat(filePath)
  if (!stat.isFile() || stat.size > MAX_SCENE_BYTES) throw new Error('Arquivo inválido ou maior que 100 MB.')
  const content = await fs.readFile(filePath, 'utf8')
  validateScene(content)
  const canonical = await fs.realpath(filePath)
  authorized.add(canonical)
  return { path: canonical, content }
}

async function deliverFiles(paths: string[]): Promise<void> {
  const projects: OpenedProject[] = []
  for (const file of paths) {
    try { projects.push(await readProject(file)) }
    catch (error) { dialog.showErrorBox('Não foi possível abrir o projeto', String(error)) }
  }
  if (projects.length) window?.webContents.send('projects:opened', projects)
}

function registerIPC(): void {
  const handle = (name: string, listener: (...args: any[]) => unknown) => {
    ipcMain.handle(name, (event, ...args) => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
        throw new Error('Origem não autorizada.')
      }
      return listener(...args)
    })
  }
  handle('workspace:get', async () => ({ root, entries: await readTree(root) }))
  handle('workspace:choose', async () => {
    const result = await dialog.showOpenDialog(window!, { title: 'Escolher pasta de projetos', defaultPath: root, properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled) return null
    root = await fs.realpath(result.filePaths[0])
    await persistPreferences()
    return { root, entries: await readTree(root) }
  })
  handle('project:open', async (requested?: string) => {
    if (requested) {
      const candidate = path.resolve(requested)
      const canonical = authorized.has(candidate) ? candidate : await authorizeWorkspaceFile(root, candidate)
      return [await readProject(canonical)]
    }
    const result = await dialog.showOpenDialog(window!, { title: 'Abrir desenhos', defaultPath: root, filters: [{ name: 'Excalidraw', extensions: ['excalidraw'] }], properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    return Promise.all(result.filePaths.map(readProject))
  })
  handle('project:save', async (input: { path?: string; title: string; content: string; saveAs?: boolean }) => {
    if (!input || typeof input.content !== 'string' || typeof input.title !== 'string') throw new Error('Dados de projeto inválidos.')
    validateScene(input.content)
    let target = input.path
    if (input.saveAs) {
      const result = await dialog.showSaveDialog(window!, { title: 'Salvar desenho como', defaultPath: target || path.join(root, `${safeTitle(input.title)}.excalidraw`), filters: [{ name: 'Excalidraw', extensions: ['excalidraw'] }] })
      if (result.canceled || !result.filePath) return null
      target = result.filePath.toLowerCase().endsWith('.excalidraw') ? result.filePath : `${result.filePath}.excalidraw`
      // This path has been explicitly approved in the native save dialog.
      await atomicWrite(target, input.content)
      authorized.add(target)
    } else if (target) {
      if (!authorized.has(target)) throw new Error('Abra o arquivo antes de salvá-lo.')
      await atomicWrite(target, input.content)
    } else {
      target = await createProject(root, input.title, input.content)
      authorized.add(target)
    }
    return target
  })
  handle('session:get', () => session)
  handle('session:save', async (value: Session) => {
    if (!value || !Array.isArray(value.paths)) throw new Error('Sessão inválida.')
    session = { paths: value.paths.filter(p => typeof p === 'string' && authorized.has(p)).slice(0, 50), activePath: value.activePath && authorized.has(value.activePath) ? value.activePath : undefined }
    await persistPreferences()
  })
  handle('app:close-ready', async (error?: string) => {
    clearTimeout(closeTimer)
    closing = false
    if (error) {
      await dialog.showMessageBox(window!, { type: 'error', message: 'Não foi possível salvar todos os projetos.', detail: `${error}\nA janela continuará aberta para você tentar salvar novamente.`, buttons: ['Voltar ao aplicativo'] })
      return
    }
    allowClose = true
    window?.close()
  })
}

function createWindow(): void {
  allowClose = false
  rendererReady = false
  window = new BrowserWindow({
    title: 'Excalidraw FRZN', width: 1440, height: 940, minWidth: 960, minHeight: 650,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'frzn.ico') : path.join(app.getAppPath(), 'build', 'frzn.ico'),
    backgroundColor: '#141414', show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  window.once('ready-to-show', () => window?.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', event => event.preventDefault())
  const recoverClose = async () => {
    if (!window || allowClose) return
    const result = await dialog.showMessageBox(window, {
      type: 'warning', message: 'O editor não respondeu ao pedido de salvar.',
      detail: 'Você pode continuar no aplicativo ou fechar sem salvar as alterações pendentes. Os arquivos já gravados serão mantidos.',
      buttons: ['Continuar no aplicativo', 'Fechar sem salvar'], defaultId: 0, cancelId: 0
    })
    closing = false
    if (result.response === 1) { allowClose = true; window?.close() }
  }
  window.webContents.on('render-process-gone', () => { rendererReady = false })
  window.on('close', event => {
    if (allowClose) return
    event.preventDefault()
    if (!closing) {
      closing = true
      if (!rendererReady) { void recoverClose(); return }
      window?.webContents.send('app:closing')
      closeTimer = setTimeout(() => { void recoverClose() }, 15000)
    }
  })
  window.on('closed', () => { clearTimeout(closeTimer); window = null })
  window.webContents.on('did-finish-load', () => {
    // Renderer asks for session after registering its event listeners.
    closing = false
  })
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(path.join(__dirname, '../renderer/index.html'))
}

const locked = app.requestSingleInstanceLock()
if (process.platform === 'win32') app.setAppUserModelId('com.frzn.excalidraw')
if (!locked) app.quit()
else {
  app.on('second-instance', (_event, argv) => {
    window?.restore(); window?.focus()
    void deliverFiles(argv.filter(p => /\.excalidraw$/i.test(p)))
  })
  app.on('open-file', (event, filePath) => { event.preventDefault(); if (window) void deliverFiles([filePath]); else pendingFiles.push(filePath) })
  void app.whenReady().then(async () => {
    if (process.env.FRZN_TEST_DATA) app.setPath('userData', process.env.FRZN_TEST_DATA)
    preferencesPath = path.join(app.getPath('userData'), 'workspace.json')
    root = process.env.FRZN_TEST_WORKSPACE || path.join(app.getPath('documents'), 'ExcalidrawProjects')
    try {
      const prefs = JSON.parse(await fs.readFile(preferencesPath, 'utf8'))
      if (typeof prefs.root === 'string') root = prefs.root
      if (Array.isArray(prefs.session?.paths)) session = prefs.session
    } catch { /* First launch or damaged preferences: use default workspace. */ }
    await fs.mkdir(root, { recursive: true })
    for (const file of session.paths) {
      try { authorized.add(await fs.realpath(file)) } catch { /* Missing files are skipped during restore. */ }
    }
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    registerIPC()
    Menu.setApplicationMenu(null)
    createWindow()
    pendingFiles.push(...process.argv.filter(p => /\.excalidraw$/i.test(p)))
    ipcMain.on('renderer:ready', event => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
      rendererReady = true
      void deliverFiles(pendingFiles.splice(0))
    })
    app.on('activate', () => { if (!window) createWindow() })
  }).catch(error => { dialog.showErrorBox('Falha ao iniciar Excalidraw FRZN', String(error)); app.exit(1) })
  app.on('window-all-closed', () => app.quit())
}
