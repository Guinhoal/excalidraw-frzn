import { useEffect, useRef, useState } from 'react'
import { FONT_FAMILY } from '@excalidraw/excalidraw'

export interface NoteOptions { text: string; background: string; font: keyof typeof FONT_FAMILY; size: number }
const fonts: NoteOptions['font'][] = ['Excalifont', 'Nunito', 'Comic Shanns', 'Lilita One', 'Cascadia']

export function NoteDialog({ onInsert, onClose }: { onInsert(note: NoteOptions): void; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  const [background, setBackground] = useState('#fff3bf')
  const [font, setFont] = useState<NoteOptions['font']>('Excalifont')
  const [size, setSize] = useState(20)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="workspace-dialog" onCancel={onClose} aria-labelledby="note-heading">
    <form onSubmit={e => { e.preventDefault(); if (text.trim()) { onInsert({ text, background, font, size }); onClose() } }}>
      <h2 id="note-heading">Nova nota</h2>
      <label>Texto<textarea autoFocus rows={5} required maxLength={10000} value={text} onChange={e => setText(e.target.value)}/></label>
      <div className="note-format">
        <label>Fonte<select value={font} onChange={e => setFont(e.target.value as NoteOptions['font'])}>{fonts.map(f => <option key={f}>{f}</option>)}</select></label>
        <label>Tamanho<select value={size} onChange={e => setSize(Number(e.target.value))}>{[16, 20, 28, 36].map(n => <option key={n} value={n}>{n} px</option>)}</select></label>
        <label>Cor do papel<input type="color" value={background} onChange={e => setBackground(e.target.value)}/></label>
      </div>
      <div className="form-actions"><button className="button secondary" type="button" onClick={onClose}>Cancelar</button>
        <button className="button primary" disabled={!text.trim()}>Inserir nota</button></div>
    </form>
  </dialog>
}
