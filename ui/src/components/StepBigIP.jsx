import React, { useState } from 'react'

export default function StepBigIP({ value, onNext, disabled }) {
  const [host, setHost] = useState(value?.host || '')
  const [partition, setPartition] = useState(value?.partition || '/Common')
  const [profile, setProfile] = useState(value?.profile ?? '')
  const [vs, setVs] = useState(value?.vs || '')

  return (
    <div className="card">
      <strong>BIG-IP Target</strong>
      <div className="row">
        <label style={{minWidth:120}}>Mgmt Host</label>
        <input disabled={disabled} value={host} onChange={e=>setHost(e.target.value)} placeholder="192.168.3.55" />
      </div>
      <div className="row">
        <label style={{minWidth:120}}>Partition</label>
        <input disabled={disabled} value={partition} onChange={e=>setPartition(e.target.value)} placeholder="/Common" />
      </div>
      <div className="row">
        <label style={{minWidth:120}}>Client-SSL Profile</label>
        <input disabled={disabled} value={profile} onChange={e=>setProfile(e.target.value)} placeholder="(leave blank to auto-create per host)" />
      </div>
      <div className="row">
        <label style={{minWidth:120}}>Virtual Server</label>
        <input disabled={disabled} value={vs} onChange={e=>setVs(e.target.value)} placeholder="/Common/https_vs (optional)" />
      </div>
      <div className="row" style={{marginTop:8}}>
        <button disabled={disabled || !host || !partition} onClick={()=>onNext({host, partition, profile, vs})}>Save</button>
      </div>
    </div>
  )
}
