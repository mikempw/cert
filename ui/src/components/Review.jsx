import React from 'react'

export default function Review({ slots }) {
  const kv = (k,v) => (
    <div className="row" key={k} style={{justifyContent:'space-between'}}>
      <span className="small">{k}</span>
      <span className="mono">{Array.isArray(v)? v.join(', ') : (v ?? '—')}</span>
    </div>
  )
  const fields = [
    ['domains', slots.domains],
    ['provider', slots.provider],
    ['contact_emails', slots.contact_emails],
    ['key_type', slots.key_type],
    ['challenge_type', slots.challenge_type],
    ['bigip_host', slots.bigip_host],
    ['bigip_partition', slots.bigip_partition],
    ['clientssl_profile', (slots.clientssl_profile ?? '') || '(auto)'],
    ['virtual_server', slots.virtual_server || '(none)'],
    ['key_secret_path', slots.key_secret_path],
  ]
  return <div>{fields.map(([k,v])=>kv(k,v))}</div>
}
