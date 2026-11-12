import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { atomicWrite, authorizeWorkspaceFile, createFolder, createProject, readTree, safeTitle, workspaceDirectory } from './storage'
import { documentFormat, validateDocument, sizeLimit } from './documents'
import { checkUpdate } from './updates'
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
const rendererAddress = (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) || pathToFileURL(path.join(__dirname, '../renderer/index.html')).href

function trustedRenderer(address?: string): boolean {
  if (!address) return false
  try {
    const current = new URL(address)
    current.hash = ''
    return current.href === new URL(rendererAddress).href
  } catch { return false }
}

function persistPreferences(): Promise<void> {
  const data = JSON.stringify({ root, session })
  const task = preferencesQueue.catch(() => undefined).then(() => atomicWrite(preferencesPath, data))
  preferencesQueue = task
  return task
}

async function readProject(filePath: string): Promise<OpenedProject> {
  const canonical = await fs.realpath(filePath)
  const format = documentFormat(canonical)
  const stat = await fs.stat(canonical)
  if (!stat.isFile() || stat.size > sizeLimit(format)) throw new Error('Arquivo inválido ou acima do limite de tamanho.')
  const bytes = await fs.readFile(canonical)
  const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: format !== 'excalidraw' }).decode(bytes)
  validateDocument(format, content)
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
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !trustedRenderer(event.senderFrame.url)) {
        throw new Error('Origem não autorizada.')
      }
      return listener(...args)
    })
  }
  handle('workspace:get', async () => ({ root, entries: await readTree(root) }))
  handle('workspace:mkdir', (parent: string, name: string) => createFolder(root, parent, name))
  handle('release:check', async () => {
    const metadata = JSON.parse(await fs.readFile(path.join(app.getAppPath(), 'package.json'), 'utf8'))
    return checkUpdate(Number(metadata.frznBuild || 0))
  })
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
      if (path.relative(canonical, await fs.realpath(canonical)) !== '') throw new Error('O arquivo foi movido. Abra-o novamente.')
      return [await readProject(canonical)]
    }
    const result = await dialog.showOpenDialog(window!, { title: 'Abrir desenhos ou anotações', defaultPath: root, filters: [{ name: 'Desenhos e notas', extensions: ['excalidraw', 'md', 'txt'] }], properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    return Promise.all(result.filePaths.map(readProject))
  })
  handle('project:save', async (input: { format?: 'excalidraw' | 'md' | 'txt'; previousText?: string; path?: string; directory?: string; title: string; content: string; saveAs?: boolean }) => {
    if (!input || typeof input.content !== 'string' || typeof input.title !== 'string') throw new Error('Dados de projeto inválidos.')
    const format = input.format ?? 'excalidraw'
    validateDocument(format, input.content)
    if (input.path && documentFormat(input.path) !== format) throw new Error('O formato do arquivo é incompatível.')
    let target = input.path
    if (input.saveAs) {
      const result = await dialog.showSaveDialog(window!, { title: 'Salvar como', defaultPath: target || path.join(root, `${safeTitle(input.title)}.${format}`), filters: [{ name: format, extensions: [format] }] })
      if (result.canceled || !result.filePath) return null
      target = result.filePath.toLowerCase().endsWith('.' + format) ? result.filePath : `${result.filePath}.${format}`
      // This path has been explicitly approved in the native save dialog.
      await atomicWrite(target, input.content)
      authorized.add(target)
    } else if (target) {
      if (!authorized.has(target)) throw new Error('Abra o arquivo antes de salvá-lo.')
      if (path.relative(target, await fs.realpath(target)) !== '') throw new Error('O destino do arquivo foi alterado. Abra-o novamente.')
      if (format !== 'excalidraw' && await fs.readFile(target, 'utf8') !== input.previousText) {
        throw new Error('Esta nota mudou no disco. Use Salvar como para preservar as duas versões.')
      }
      await atomicWrite(target, input.content)
    } else {
      const directory = input.directory ? await workspaceDirectory(root, input.directory) : root
      target = await createProject(directory, input.title, input.content, format)
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
  const allowedPermissions = new Set(['fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'pointerLock'])
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === window?.webContents && details.isMainFrame && trustedRenderer(contents.getURL()) && allowedPermissions.has(permission))
  })
  window.webContents.session.setPermissionCheckHandler((contents, permission) =>
    Boolean(contents && contents === window?.webContents && trustedRenderer(contents.getURL()) && allowedPermissions.has(permission)))
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openWebLink(url).catch(() => {})
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
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(path.join(__dirname, '../renderer/index.html'))
}

async function openWebLink(raw: string): Promise<void> {
  const url = new URL(raw)
  if (!window || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) return
  const release = url.origin === 'https://github.com' && url.pathname.startsWith('/Guinhoal/excalidraw-frzn/releases/tag/')
  if (!release) {
    const result = await dialog.showMessageBox(window, {
      message: 'Abrir este link no navegador?', detail: url.href,
      buttons: ['Cancelar', 'Abrir link'], defaultId: 0, cancelId: 0
    })
    if (result.response !== 1) return
  }
  await shell.openExternal(url.href)
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
    if (!app.isPackaged && process.env.FRZN_TEST_DATA) app.setPath('userData', process.env.FRZN_TEST_DATA)
    preferencesPath = path.join(app.getPath('userData'), 'workspace.json')
    root = (!app.isPackaged && process.env.FRZN_TEST_WORKSPACE) || path.join(app.getPath('documents'), 'ExcalidrawProjects')
    try {
      const prefs = JSON.parse(await fs.readFile(preferencesPath, 'utf8'))
      if (typeof prefs.root === 'string') root = prefs.root
      if (Array.isArray(prefs.session?.paths)) session = prefs.session
    } catch { /* First launch or damaged preferences: use default workspace. */ }
    await fs.mkdir(root, { recursive: true })
    for (const file of session.paths) {
      try { const canonical = await fs.realpath(file); documentFormat(canonical); authorized.add(canonical) } catch { /* Missing files are skipped during restore. */ }
    }
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    registerIPC()
    Menu.setApplicationMenu(null)
    createWindow()
    pendingFiles.push(...process.argv.filter(p => /\.excalidraw$/i.test(p)))
    ipcMain.on('renderer:ready', event => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !trustedRenderer(event.senderFrame.url)) return
      rendererReady = true
      void deliverFiles(pendingFiles.splice(0))
    })
    app.on('activate', () => { if (!window) createWindow() })
  }).catch(error => { dialog.showErrorBox('Falha ao iniciar Excalidraw FRZN', String(error)); app.exit(1) })
  app.on('window-all-closed', () => app.quit())
}
