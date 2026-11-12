import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { DesktopAPI } from '../../shared/contracts'

export function UpdateNotice() {
  const [update, setUpdate] = useState<Awaited<ReturnType<DesktopAPI['checkUpdate']>>>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  async function check(manual: boolean) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const latest = await window.desktop.checkUpdate()
      setUpdate(latest)
      setStatus(manual && !latest ? 'Você está em dia.' : '')
    } catch (error) {
      if (manual) setStatus(String(error).includes('Nenhuma versão') ? 'Nenhuma versão acessível no GitHub.' : 'Não foi possível consultar o GitHub.')
    } finally { pending.current = false; setBusy(false) }
  }
  useEffect(() => {
    void check(false)
    const timer = window.setInterval(() => void check(false), 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <div className="release-notice">
    {update && <a className="button secondary" href={update.url} target="_blank" rel="noreferrer"><Download size={15}/>Atualização disponível · {update.build}</a>}
    <span role="status">{status}</span>
    <button className="icon-button" disabled={busy} title="Verificar atualizações" aria-label="Verificar atualizações" onClick={() => void check(true)}><RefreshCw size={15}/></button>
  </div>
}
