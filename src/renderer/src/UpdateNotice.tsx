import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { UpdateStatus } from '../../shared/contracts'

export function UpdateNotice() {
  const [result, setResult] = useState<UpdateStatus>()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  async function check() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try { setResult(await window.desktop.checkUpdate()) }
    catch { setResult({ state: 'unavailable', message: 'Falha na consulta de atualizações.' }) }
    finally { pending.current = false; setBusy(false) }
  }
  useEffect(() => {
    void check()
    const timer = window.setInterval(check, 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])
  const status = result?.state === 'unavailable' ? result.message : result?.state === 'current' ? `Em dia · build ${result.build}` : ''
  return <div className="release-notice">
    <span role="status">{busy ? 'Consultando atualizações…' : status}</span>
    {result?.state === 'available' && <a className="button secondary" href={result.url} target="_blank" rel="noreferrer"><Download size={15}/>Atualização disponível · build {result.build}</a>}
    <button className="button secondary" disabled={busy} title="Verificar atualizações" aria-label="Verificar atualizações" onClick={check}><RefreshCw size={14}/>Verificar atualizações</button>
  </div>
}
