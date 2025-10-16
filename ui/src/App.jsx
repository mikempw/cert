import React, { useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import StepDomains from './components/StepDomains.jsx'
import StepProvider from './components/StepProvider.jsx'
import StepBigIP from './components/StepBigIP.jsx'
import StepVault from './components/StepVault.jsx'
import Review from './components/Review.jsx'

export default function App() {
  const [status, setStatus] = useState('checking')
  const [err, setErr] = useState('')
  const [sid, setSid] = useState(null)
  const [slots, setSlots] = useState({})
  const [nextQ, setNextQ] = useState(null)
  const [replace, setReplace] = useState(false)
  const [log, setLog] = useState([])
  const [mode, setMode] = useState('issue') // 'issue' | 'renew'

  // Step order differs for renew (no provider/email/key_type)
  const STEP_ORDER = mode === 'renew'
    ? ['domains','bigip_host','bigip_partition','clientssl_profile','virtual_server','key_secret_path']
    : ['domains','provider','contact_emails','key_type','challenge_type','bigip_host','bigip_partition','clientssl_profile','virtual_server','key_secret_path']

  useEffect(() => {
    api.ready().then(()=>setStatus('ok')).catch(e=>{ setErr(e.message); setStatus('err') })
  }, [])

  async function start(modeToStart) {
    setErr('')
    try {
      const r = await api.start(modeToStart, { domains: slots.domains || [] })
      setSid(r.session_id); setNextQ(r.next_question); setSlots(r.slots); setMode(modeToStart)
      push(`Started ${modeToStart} session: ${r.session_id}`)
    } catch(e) { setErr(e.message) }
  }

  async function answer(qid, value) {
    if (!sid) return
    setErr('')
    try {
      const r = await api.answer(sid, qid, value)
      setSlots(r.slots); setNextQ(r.next_question || null)
      if (qid === 'virtual_server' && r.virtual_server_check) {
        const v = r.virtual_server_check
        if (!v.exists) push(`VS not found: ${value}`)
        else if (v.clientssl_profiles?.length) push(`VS has client-ssl: ${v.clientssl_profiles.join(', ')} (toggle "replace" if desired)`)
      }
    } catch(e) { setErr(e.message) }
  }

  async function commit() {
    if (!sid) return
    setErr('')
    try {
      push('Committing…')
      const r = await api.commit(sid, replace)
      push('✔ Completed')
      push(`cert_id: ${(r.cert && r.cert.cert_id) || r.deploy?.cert_id || 'n/a'}`)
      push(`profile: ${r.deploy?.profile || '(no deploy)'}`)
      alert('Done! Check BIG-IP.')
    } catch(e) { setErr(e.message); push('✖ Commit failed') }
  }

  function push(m) { setLog(x=>[...x, `[${new Date().toLocaleTimeString()}] ${m}`]) }

  const stepIndex = useMemo(()=>{
    if (!nextQ) return STEP_ORDER.length
    const idx = STEP_ORDER.indexOf(nextQ)
    return idx >=0 ? idx : 0
  }, [nextQ, STEP_ORDER])

  const canStart = status==='ok' && !sid
  const canCommit = !!sid && !nextQ

  return (
    <div className="container">
      <h1>ACME Wizard</h1>
      <p className="muted">Issue or Renew TLS certs (HTTP-01) and deploy to BIG-IP</p>

      <div className="row" style={{gap:8}}>
        <div className="row" style={{gap:8, alignItems:'center'}}>
          <label><input type="radio" name="mode" checked={mode==='issue'} onChange={()=>setMode('issue')} /> Issue</label>
          <label><input type="radio" name="mode" checked={mode==='renew'} onChange={()=>setMode('renew')} /> Renew</label>
        </div>
        <button onClick={()=>start(mode)} disabled={!canStart}>Start new {mode}</button>
        <label className="row"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)} /> Replace client-ssl on VS</label>
      </div>

      {err && <p className="err mono">{err}</p>}
      <hr className="hr" />

      {/* Steps */}
      <div className="grid">
        <StepDomains value={slots.domains} onNext={(v)=>answer('domains', v)} disabled={!sid}/>
        {mode === 'issue' && (
          <StepProvider
            value={{provider: slots.provider, email: slots.contact_emails?.[0] || '', keyType: slots.key_type || 'EC256', challenge: slots.challenge_type || 'HTTP-01'}}
            onNext={async (v)=>{ await answer('provider', v.provider); await answer('contact_emails',[v.email]); await answer('key_type', v.keyType); await answer('challenge_type', v.challenge) }}
            disabled={!sid}
          />
        )}
        <StepBigIP
          value={{ host: slots.bigip_host || '', partition: slots.bigip_partition || '/Common', profile: (slots.clientssl_profile ?? ''), vs: slots.virtual_server || '' }}
          onNext={async (v)=>{ await answer('bigip_host', v.host); await answer('bigip_partition', v.partition); await answer('clientssl_profile', v.profile); if (v.vs) await answer('virtual_server', v.vs) }}
          disabled={!sid}
        />
        <StepVault value={slots.key_secret_path || ''} onNext={(v)=>answer('key_secret_path', v)} disabled={!sid}/>
      </div>

      <div className="footer">
        <div className="small">Step {Math.min(stepIndex+1, STEP_ORDER.length)} / {STEP_ORDER.length} • mode: {mode}</div>
        <button onClick={commit} disabled={!canCommit}>Commit {mode === 'renew' ? 'Renew & Deploy' : 'Issue & Deploy'}</button>
      </div>

      <div className="card" style={{marginTop:16}}>
        <div className="row" style={{justifyContent:'space-between'}}>
          <strong>Review</strong>
          <span className="pill">{sid ? 'session: '+sid : 'no session'}</span>
        </div>
        <Review slots={{...slots, mode}}/>
      </div>

      <div className="card" style={{marginTop:16}}>
        <strong>Log</strong>
        <pre className="mono small">{log.join('\n') || '—'}</pre>
      </div>
    </div>
  )
}
