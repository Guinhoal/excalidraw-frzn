import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableUpdate, checkUpdate } from '../src/main/updates.ts'

test('aviso aponta para uma versão publicada com instalador mais novo', () => {
  const release = { tag_name: 'desktop-18', assets: [{ name: 'Excalidraw-FRZN-build-18.exe', state: 'uploaded' }] }
  assert.equal(availableUpdate(12, release).state, 'available')
  assert.equal(availableUpdate(18, release).state, 'current')
  assert.equal(availableUpdate(19, release).state, 'current')
  assert.equal(availableUpdate(0, { ...release, assets: [] }).state, 'unavailable')
  assert.equal(availableUpdate(0, { ...release, assets: [{ ...release.assets[0], state: 'open' }] }).state, 'unavailable')
})

test('repositório acessível sem release mostra o motivo, inclusive na primeira consulta', async () => {
  const response = await checkUpdate(0, async url => String(url).endsWith('/latest') ? new Response(null, { status: 404 }) : new Response('{}'))
  assert.deepEqual(response, { state: 'unavailable', message: 'Aguardando a primeira release estável no GitHub.' })
})

test('falha de rede e limite do GitHub não indicam que o aplicativo está atualizado', async () => {
  assert.equal((await checkUpdate(4, async () => { throw new Error('offline') })).state, 'unavailable')
  const limited = await checkUpdate(4, async () => new Response(null, { status: 429 }))
  assert.ok(limited.state === 'unavailable' && limited.message.includes('Limite'))
})
