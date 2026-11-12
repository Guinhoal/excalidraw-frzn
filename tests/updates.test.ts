import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableUpdate } from '../src/main/updates.ts'

test('aviso aponta para uma versão publicada com instalador mais novo', () => {
  const release = { tag_name: 'desktop-18', assets: [{ name: 'Excalidraw-FRZN-build-18.exe', state: 'uploaded' }] }
  assert.equal(availableUpdate(12, release)?.build, 18)
  assert.equal(availableUpdate(18, release), null)
  assert.equal(availableUpdate(19, release), null)
  assert.equal(availableUpdate(0, { ...release, assets: [] }), null)
  assert.equal(availableUpdate(0, { ...release, assets: [{ ...release.assets[0], state: 'open' }] }), null)
})
