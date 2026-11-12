import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, label: string): Promise<T> {
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    const result = await read()
    if (accept(result)) return result
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Tempo excedido: ${label}`)
}

async function addCode(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Bloco de código', exact: true }).click()
  await page.locator('.monaco-editor').waitFor()
  await page.getByPlaceholder('Ex.: api.ts').fill(title)
  await page.getByRole('button', { name: 'Inserir no canvas', exact: true }).click()
  await page.locator('dialog').waitFor({ state: 'detached', timeout: 30000 })
}

async function close(app: ElectronApplication): Promise<void> {
  const exited = new Promise<void>(resolve => app.once('close', () => resolve()))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([exited, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Aplicativo não fechou após salvar.')), 25000) })])
  } finally { clearTimeout(timer) }
}

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'frzn-smoke-'))
  const workspace = path.join(root, 'projects')
  const userData = path.join(root, 'settings')
  await fs.mkdir(workspace)
  const env: Record<string, string | undefined> = { ...process.env, FRZN_TEST_DATA: userData, FRZN_TEST_WORKSPACE: workspace }
  delete env.ELECTRON_RUN_AS_NODE
  const errors: string[] = []
  let app: ElectronApplication | undefined
  const launch = async () => {
    const instance = await electron.launch({ args: [path.resolve('out/main/index.js')], env })
    const page = await instance.firstWindow()
    page.on('pageerror', error => errors.push(error.message))
    await page.route(/^https?:/, route => route.abort())
    await page.getByRole('tab').first().waitFor()
    await page.locator('.excalidraw canvas').first().waitFor()
    return { instance, page }
  }
  try {
    let launched = await launch(); app = launched.instance
    let page = launched.page
    await addCode(page, 'primeiro.ts')
    const readScenes = async () => Promise.all((await fs.readdir(workspace)).filter(name => name.endsWith('.excalidraw')).map(async name => ({ name, scene: JSON.parse(await fs.readFile(path.join(workspace, name), 'utf8')) })))
    let scenes = await waitFor(readScenes, files => files.length === 1 && files[0].scene.elements.length === 1, 'primeiro autosave')
    const image = scenes[0].scene.elements[0]
    assert.equal(image.customData.title, 'primeiro.ts')
    assert.ok(scenes[0].scene.files[image.fileId].dataURL.startsWith('data:image/svg+xml;base64,'))
    await page.getByRole('button', { name: 'Nova aba', exact: true }).click()
    await addCode(page, 'segundo.ts')
    scenes = await waitFor(readScenes, files => files.length === 2 && files.every(file => file.scene.elements.length === 1), 'segundo autosave')
    assert.deepEqual(new Set(scenes.map(file => file.scene.elements[0].customData.title)), new Set(['primeiro.ts', 'segundo.ts']))
    await page.getByRole('tab').first().click()
    const bounds = await page.locator('.excalidraw canvas').first().boundingBox()
    assert.ok(bounds)
    await page.mouse.dblclick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.getByRole('heading', { name: 'Editar bloco de código' }).waitFor()
    await page.getByPlaceholder('Ex.: api.ts').fill('editado.ts')
    await page.getByRole('button', { name: 'Atualizar bloco', exact: true }).click()
    await page.locator('dialog').waitFor({ state: 'detached' })
    // Close immediately: this exercises flushing before the autosave timer.
    await close(app); app = undefined
    scenes = await readScenes()
    assert.ok(scenes.some(file => file.scene.elements[0].customData.title === 'editado.ts'))
    launched = await launch(); app = launched.instance; page = launched.page
    await waitFor(() => page.getByRole('tab').count(), count => count === 2, 'restauração das abas')
    await fs.mkdir('test-results', { recursive: true })
    await page.screenshot({ path: 'test-results/workspace.png' })
    assert.deepEqual(errors, [], 'O renderer não deve produzir erros JavaScript.')
    await close(app); app = undefined
    console.log('Smoke OK: canvas, Monaco offline, código SVG, autosave, abas, edição e restauração.')
  } finally {
    if (app) await app.close()
    // The test owns this freshly created temporary directory only.
    await fs.rm(root, { recursive: true, force: true })
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
