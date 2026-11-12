import { forwardRef, lazy, memo, Suspense, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, FONT_FAMILY, MainMenu, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, AppState, BinaryFiles, DataURL } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement, ExcalidrawImageElement, FileId } from '@excalidraw/excalidraw/element/types'
import { Code2, Maximize2, Minimize2, Pencil, StickyNote, Type } from 'lucide-react'
import { NoteDialog, noteInk, type NoteOptions } from './NoteDialog'
import { isCodeData, renderCode, type CodeData } from './code'
import { serialize } from './projects'
import { useProjects } from './store'

const CodeDialog = lazy(() => import('./CodeDialog').then(module => ({ default: module.CodeDialog })))
export interface CanvasHandle { addCode(): void }

interface CanvasProps {
  tabId: string
  title: string
  theme: 'light' | 'dark'
  fullscreen: boolean
  onToggleFullscreen(): void
}

export const Canvas = memo(forwardRef<CanvasHandle, CanvasProps>(function Canvas({ tabId, title, theme, fullscreen, onToggleFullscreen }, ref) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null)
  const [dialog, setDialog] = useState<{ elementId?: string; initial?: CodeData } | null>(null)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const pointerCode = useRef<string | null>(null)
  const [initialScene] = useState(() => useProjects.getState().tabs.find(tab => tab.id === tabId)!.scene)
  const firstChange = useRef(true)
  const [noteOpen, setNoteOpen] = useState(false)
  const insertNote = ({ text, background, font, size }: NoteOptions) => {
    const editor = api.current
    if (!editor) return
    const state = editor.getAppState()
    const center = viewportCoordsToSceneCoords({ clientX: state.offsetLeft + state.width / 2, clientY: state.offsetTop + state.height / 2 }, state)
    const ink = noteInk(background)
    const elements = convertToExcalidrawElements([{
      type: 'rectangle', x: center.x - 150, y: center.y - 65, width: 300, height: 130,
      backgroundColor: background, fillStyle: 'solid', roughness: 0, strokeColor: 'transparent',
      label: { text, fontFamily: FONT_FAMILY[font], fontSize: size, strokeColor: ink, textAlign: 'left', verticalAlign: 'middle' }
    }])
    editor.setActiveTool({ type: 'selection' })
    editor.updateScene({ elements: [...editor.getSceneElementsIncludingDeleted(), ...elements],
      appState: { selectedElementIds: { [elements[0].id]: true } }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
  }

  useImperativeHandle(ref, () => ({ addCode: () => setDialog({}) }), [])

  const editCode = useCallback((elementId: string) => {
    const element = api.current?.getSceneElements().find(item => item.id === elementId)
    if (element && isCodeData(element.customData)) setDialog({ elementId, initial: element.customData })
  }, [])

  const onChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    const scene = { elements, appState, files }
    if (firstChange.current) {
      firstChange.current = false
      useProjects.getState().patch(tabId, { scene, serialized: serialize(scene) })
    } else {
      useProjects.getState().update(tabId, scene, serialize(scene))
    }
    const selected = elements.filter(element => appState.selectedElementIds[element.id])
    setSelectedCode(selected.length === 1 && isCodeData(selected[0].customData) ? selected[0].id : null)
  }, [tabId])

  const insertCode = async (data: CodeData) => {
    const editor = api.current
    if (!editor) throw new Error('O canvas ainda está carregando.')
    const card = await renderCode(data)
    const fileId = crypto.randomUUID() as FileId
    const fileData = `data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(card.svg), byte => String.fromCharCode(byte)).join(''))}` as DataURL
    const elements = editor.getSceneElementsIncludingDeleted()
    const existing = elements.find(element => !element.isDeleted && element.id === dialog?.elementId && element.type === 'image') as ExcalidrawImageElement | undefined
    editor.addFiles([{ id: fileId, dataURL: fileData, mimeType: 'image/svg+xml', created: Date.now(), lastRetrieved: Date.now() }])
    let element: ExcalidrawImageElement
    if (existing) {
      const ratio = existing.width / card.width
      element = { ...existing, fileId, height: card.height * ratio, customData: { ...data }, version: existing.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() }
    } else {
      const state = editor.getAppState()
      const center = viewportCoordsToSceneCoords({ clientX: state.offsetLeft + state.width / 2, clientY: state.offsetTop + state.height / 2 }, state)
      // Convert a base shape to obtain all Excalidraw bookkeeping fields.
      const [base] = convertToExcalidrawElements([{ type: 'rectangle', x: center.x - card.width / 2, y: center.y - card.height / 2, width: card.width, height: card.height }])
      element = { ...base, type: 'image', fileId, status: 'saved', scale: [1, 1], crop: null, customData: { ...data } } as ExcalidrawImageElement
    }
    editor.updateScene({
      elements: existing ? elements.map(item => item.id === existing.id ? element : item) : [...elements, element],
      appState: { selectedElementIds: { [element.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })
    editor.setActiveTool({ type: 'selection' })
  }

  return <div className="canvas-container" onPointerDownCapture={event => {
    const editor = api.current
    if (event.button !== 0 || !(event.target instanceof HTMLCanvasElement) || !editor) return
    const state = editor.getAppState()
    if (state.activeTool.type === 'text' && !state.editingTextElement && Object.keys(state.selectedElementIds).length) {
      // Excalidraw prioritizes the previous selection over the location of a new text click.
      flushSync(() => editor.updateScene({ appState: { selectedElementIds: {} }, captureUpdate: CaptureUpdateAction.NEVER }))
    }
  }} onDoubleClickCapture={event => {
    if (event.target instanceof HTMLCanvasElement && pointerCode.current) { event.preventDefault(); event.stopPropagation(); editCode(pointerCode.current) }
  }}>
    <Excalidraw
      excalidrawAPI={instance => { api.current = instance }}
      initialData={initialScene}
      onChange={onChange}
      onPointerDown={(_tool, state) => { pointerCode.current = state.hit.element && isCodeData(state.hit.element.customData) ? state.hit.element.id : null }}
      theme={theme}
      langCode="pt-BR"
      name={title}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, export: { saveFileToDisk: true } } }}
      renderTopRightUI={() => (
        <div className="canvas-actions">
          <button className="canvas-button" aria-label="Nova nota" title="Nova nota" onClick={() => setNoteOpen(true)}><StickyNote size={16}/></button>
          {selectedCode && <button className="canvas-button" onClick={() => editCode(selectedCode)}><Pencil size={15}/> Editar código</button>}
          <button className="canvas-button" onClick={() => setDialog({})}><Code2 size={16}/> Código</button>
          <button className="canvas-button" aria-label={fullscreen ? 'Sair da tela cheia' : 'Ampliar área de desenho'} title={fullscreen ? 'Sair da tela cheia (Esc)' : 'Ampliar área de desenho'} onClick={onToggleFullscreen}>
            {fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
          </button>
        </div>
      )}
    >
      <MainMenu>
        <MainMenu.Item icon={<Type size={16}/>} onSelect={() => api.current?.setActiveTool({ type: 'text', locked: true })}>Escrever vários textos</MainMenu.Item>
        <MainMenu.DefaultItems.Export/>
        <MainMenu.DefaultItems.SaveAsImage/>
        <MainMenu.DefaultItems.Help/>
        <MainMenu.DefaultItems.ClearCanvas/>
        <MainMenu.Separator/>
        <MainMenu.DefaultItems.ChangeCanvasBackground/>
      </MainMenu>
    </Excalidraw>
    {noteOpen && <NoteDialog onInsert={insertNote} onClose={() => setNoteOpen(false)}/>}
    {dialog && <Suspense fallback={<div className="loading-overlay">Carregando editor de código…</div>}><CodeDialog initial={dialog.initial} editing={!!dialog.elementId} onClose={() => setDialog(null)} onSave={insertCode}/></Suspense>}
  </div>
}))
