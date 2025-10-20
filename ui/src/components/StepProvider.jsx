import React, { useState } from 'react'

export default function StepProvider({ value, onNext, disabled }) {
  const [provider, setProvider] = useState(value?.provider || 'lets-encrypt')
  const [email, setEmail] = useState(value?.email || '')
  const [keyType, setKeyType] = useState(value?.keyType || 'EC256')
  const [challenge, setChallenge] = useState(value?.challenge || 'HTTP-01')
  const [eabSecret, setEabSecret] = useState(value?.eabSecret || '')
  const [directoryUrl, setDirectoryUrl] = useState(value?.directoryUrl || '')

  const requiresEab = ['google', 'zerossl', 'sectigo', 'digicert'].includes(provider)
  const requiresCustomUrl = provider === 'custom' || ['sectigo', 'digicert'].includes(provider)

  // Provider-specific help text
  const getProviderHelp = () => {
    switch(provider) {
      case 'google':
        return 'Get EAB from https://console.cloud.google.com/security/publicca'
      case 'zerossl':
        return 'Get EAB from https://zerossl.com (Developer section)'
      case 'sectigo':
        return 'Get EAB from https://sectigo.com/acme - URL: https://acme.sectigo.com/v2/keyCompromise'
      case 'digicert':
        return 'Enterprise account required - contact DigiCert for ACME access'
      case 'custom':
        return 'Provide your ACME directory URL and EAB if required'
      default:
        return null
    }
  }

  const providerHelp = getProviderHelp()

  return (
    <div className="card">
      <strong>Provider & Contact</strong>
      <div className="row">
        <label style={{minWidth:120}}>Provider</label>
        <select disabled={disabled} value={provider} onChange={e=>setProvider(e.target.value)}>
          <option value="lets-encrypt">Let's Encrypt (free, no EAB)</option>
          <option value="google">Google Public CA</option>
          <option value="zerossl">ZeroSSL</option>
          <option value="sectigo">Sectigo</option>
          <option value="digicert">DigiCert</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      
      {providerHelp && (
        <p className="small" style={{marginLeft:120, marginTop:4, color:'#9aa4b2'}}>
          ℹ️ {providerHelp}
        </p>
      )}
      
      {requiresCustomUrl && (
        <div className="row">
          <label style={{minWidth:120}}>Directory URL</label>
          <input 
            disabled={disabled} 
            value={directoryUrl} 
            onChange={e=>setDirectoryUrl(e.target.value)} 
            placeholder={
              provider === 'sectigo' ? 'https://acme.sectigo.com/v2/keyCompromise' :
              provider === 'digicert' ? 'https://acme.digicert.com/v2/directory' :
              'https://acme.example.com/directory'
            }
          />
        </div>
      )}
      
      {requiresEab && (
        <>
          <div className="row">
            <label style={{minWidth:120}}>EAB Secret Path</label>
            <input 
              disabled={disabled} 
              value={eabSecret} 
              onChange={e=>setEabSecret(e.target.value)} 
              placeholder={`secret/data/eab/${provider}`}
            />
          </div>
          <p className="small" style={{marginLeft:120, marginTop:4, color:'#ffcc66'}}>
            ⚠️ Store EAB in Vault as: {`{"kid":"your-kid-here", "hmac_key":"your-hmac-key"}`}
          </p>
        </>
      )}
      
      <div className="row">
        <label style={{minWidth:120}}>Contact Email</label>
        <input 
          disabled={disabled} 
          value={email} 
          onChange={e=>setEmail(e.target.value)} 
          placeholder="noc@your-domain.com" 
        />
      </div>
      
      <div className="row">
        <label style={{minWidth:120}}>Key Type</label>
        <select disabled={disabled} value={keyType} onChange={e=>setKeyType(e.target.value)}>
          <option value="EC256">EC256 (Recommended)</option>
          <option value="EC384">EC384</option>
          <option value="RSA2048">RSA2048</option>
          <option value="RSA3072">RSA3072</option>
          <option value="RSA4096">RSA4096</option>
        </select>
      </div>
      
      <div className="row">
        <label style={{minWidth:120}}>Challenge Type</label>
        <select disabled value={challenge} onChange={e=>setChallenge(e.target.value)}>
          <option value="HTTP-01">HTTP-01</option>
        </select>
      </div>
      
      <div className="row" style={{marginTop:8}}>
        <button 
          disabled={
            disabled || 
            !email || 
            (requiresEab && !eabSecret) || 
            (requiresCustomUrl && !directoryUrl)
          } 
          onClick={()=>onNext({provider, email, keyType, challenge, eabSecret, directoryUrl})}
        >
          Save
        </button>
      </div>
    </div>
  )
}
