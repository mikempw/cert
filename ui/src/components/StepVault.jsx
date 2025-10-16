import React, { useState } from 'react'

export default function StepVault({ value, onNext, disabled }) {
  const [path, setPath] = useState(value || '')
  return (
    <div className="card">
      <strong>Vault Key Path</strong>
      <p className="small">KV v2 path for private key (e.g., <span className="mono">secret/data/tls/mpwlabs.com</span>)</p>
      <input disabled={disabled} value={path} onChange={e=>setPath(e.target.value)} placeholder="secret/data/tls/example.com" />
      <div className="row" style={{marginTop:8}}>
        <button disabled={disabled || !path} onClick={()=>onNext(path)}>Save</button>
      </div>
    </div>
  )
}
