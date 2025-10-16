import React, { useState } from 'react'

export default function StepDomains({ value = [], onNext, disabled }) {
  const [input, setInput] = useState(value?.join(',') || '')
  return (
    <div className="card">
      <strong>Domains (comma-separated)</strong>
      <p className="small">Primary domain first (e.g., <span className="mono">mpwlabs.com</span>)</p>
      <input disabled={disabled} value={input} onChange={e=>setInput(e.target.value)} placeholder="example.com, www.example.com" />
      <div className="row" style={{marginTop:8}}>
        <button disabled={disabled} onClick={()=>onNext(input.split(',').map(s=>s.trim()).filter(Boolean))}>Save</button>
      </div>
    </div>
  )
}
