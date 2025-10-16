const BASE = import.meta.env.VITE_API || 'http://localhost:7000'

async function j(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const ct = res.headers.get('content-type') || ''
  const data = ct.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) {
    const msg = typeof data === 'string' ? data : (data.detail || JSON.stringify(data))
    throw new Error(msg)
  }
  return data
}

export const api = {
  ready: () => j('GET', '/readyz'),
  start: (mode, slots={}) => j('POST', '/guided/start', { mode, slots }),
  answer: (session_id, question_id, value) => j('POST', '/guided/answer', { session_id, question_id, value }),
  commit: (session_id, replace=false) => j('POST', '/guided/commit', { session_id, replace_existing_clientssl: replace }),
  vsCheck: (bigip_host, virtual_server, partition='/Common') => j('POST', '/bigip/virtual_server/check', { bigip_host, virtual_server, partition }),
  templatesList: () => j('POST', '/templates/list'),
  templatesCreate: (tpl) => j('POST', '/templates/create', tpl),
  certsList: (query=null, days=45, tag=null) => j('POST', '/acme/list_certificates', { query, expiring_within_days: days, tag }),
}
