import React, { useState } from 'react'

export default function StepProvider({ value, onNext, disabled }) {
  const [provider, setProvider] = useState(value?.provider || 'lets-encrypt')
  const [email, setEmail] = useState(value?.email || '')
  const [keyType, setKeyType] = useState(value?.keyType || 'EC256')
  const [challenge, setChallenge] = useState(value?.challenge || 'HTTP-01')

  return (
    <div className="card">
      <strong>Provider & Contact</strong>
      <div className="row">
        <label style={{minWidth:120}}>Provider</label>
        <select disabled={disabled} value={provider} onChange={e=>setProvider(e.target.value)}>
          <option value="lets-encrypt">lets-encrypt</option>
          <option value="google">google</option>
          <option value="zerossl">zerossl</option>
          <option value="sectigo">sectigo</option>
          <option value="digicert">digicert</option>
          <option value="custom">custom (set URL later)</option>
        </select>
      </div>
      <div className="row">
        <label style={{minWidth:120}}>Email</label>
        <input disabled={disabled} value={email} onChange={e=>setEmail(e.target.value)} placeholder="noc@your-domain.com" />
      </div>
      <div className="row">
        <label style={{minWidth:120}}>Key Type</label>
        <select disabled={disabled} value={keyType} onChange={e=>setKeyType(e.target.value)}>
          <option>EC256</option><option>EC384</option>
          <option>RSA2048</option><option>RSA3072</option><option>RSA4096</option>
        </select>
      </div>
      <div className="row">
        <label style={{minWidth:120}}>Challenge</label>
        <select disabled value={challenge} onChange={e=>setChallenge(e.target.value)}>
          <option>HTTP-01</option>
        </select>
      </div>
      <div className="row" style={{marginTop:8}}>
        <button disabled={disabled || !email} onClick={()=>onNext({provider, email, keyType, challenge})}>Save</button>
      </div>
    </div>
  )
}
