import React, { useState, useEffect } from 'react'
import { WizardStep, FormField, WizardActions, InfoCard } from './WizardStep'
import './ProviderStep.css'

const PROVIDERS = {
  'lets-encrypt': {
    name: "Let's Encrypt",
    description: 'Free, automated, and open certificate authority',
    logo: '🔒',
    color: '#ff6b35',
    requiresEab: false,
    requiresCustomUrl: false,
    defaultUrl: 'https://acme-v02.api.letsencrypt.org/directory',
    features: ['Free SSL/TLS certificates', '90-day validity', 'Automated renewal', 'No EAB required'],
    limitations: ['90-day certificate lifetime', 'Rate limits apply', 'No wildcard via HTTP-01'],
    setupUrl: null
  },
  'google': {
    name: 'Google Public CA',
    description: 'Google Cloud managed certificate authority',
    logo: '🔷',
    color: '#4285f4',
    requiresEab: true,
    requiresCustomUrl: false,
    defaultUrl: 'https://dv.acme-v02.api.pki.goog/directory',
    features: ['90-day validity', 'Google Cloud integration', 'High reliability'],
    limitations: ['Requires Google Cloud account', 'EAB credentials required'],
    setupUrl: 'https://console.cloud.google.com/security/publicca'
  },
  'zerossl': {
    name: 'ZeroSSL',
    description: 'Free and paid SSL certificates with advanced features',
    logo: '🛡️',
    color: '#00a859',
    requiresEab: true,
    requiresCustomUrl: false,
    defaultUrl: 'https://acme.zerossl.com/v2/DV90',
    features: ['90-day free certificates', 'Paid options available', 'REST API access'],
    limitations: ['Account required', 'EAB credentials required'],
    setupUrl: 'https://zerossl.com/dashboard'
  },
  'sectigo': {
    name: 'Sectigo',
    description: 'Commercial certificate authority with enterprise features',
    logo: '🏢',
    color: '#ff7c00',
    requiresEab: true,
    requiresCustomUrl: true,
    defaultUrl: 'https://acme.sectigo.com/v2/keyCompromise',
    features: ['Enterprise support', 'Extended validation', 'Warranty included'],
    limitations: ['Paid service', 'Account setup required', 'EAB required'],
    setupUrl: 'https://sectigo.com/acme'
  },
  'digicert': {
    name: 'DigiCert',
    description: 'Enterprise-grade certificates with premium support',
    logo: '🔐',
    color: '#0054a6',
    requiresEab: true,
    requiresCustomUrl: true,
    defaultUrl: 'https://acme.digicert.com/v2/directory',
    features: ['Enterprise features', 'Premium support', 'CertCentral integration'],
    limitations: ['Enterprise account required', 'Premium pricing', 'EAB required'],
    setupUrl: 'https://www.digicert.com/account'
  },
  'custom': {
    name: 'Custom Provider',
    description: 'Configure your own ACME provider',
    logo: '⚙️',
    color: '#6b7280',
    requiresEab: false,
    requiresCustomUrl: true,
    defaultUrl: '',
    features: ['Flexible configuration', 'Any ACME-compatible CA'],
    limitations: ['Manual configuration required'],
    setupUrl: null
  }
}

const KEY_TYPES = {
  'EC256': { name: 'ECDSA P-256', description: 'Recommended - Best performance and security', icon: '⚡' },
  'EC384': { name: 'ECDSA P-384', description: 'Higher security elliptic curve', icon: '🔒' },
  'RSA2048': { name: 'RSA 2048-bit', description: 'Legacy compatibility', icon: '🔑' },
  'RSA3072': { name: 'RSA 3072-bit', description: 'Enhanced RSA security', icon: '🗝️' },
  'RSA4096': { name: 'RSA 4096-bit', description: 'Maximum RSA security', icon: '🛡️' }
}

export default function ProviderStep({
  value = {},
  onNext,
  onPrevious,
  disabled = false,
  mode = 'issue'
}) {
  const [provider, setProvider] = useState(value.provider || 'lets-encrypt')
  const [email, setEmail] = useState(value.email || '')
  const [keyType, setKeyType] = useState(value.keyType || 'EC256')
  const [eabSecret, setEabSecret] = useState(value.eabSecret || '')
  const [directoryUrl, setDirectoryUrl] = useState(value.directoryUrl || '')
  const [errors, setErrors] = useState({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isValidating, setIsValidating] = useState(false)

  const selectedProvider = PROVIDERS[provider]

  useEffect(() => {
    // Auto-fill directory URL for known providers
    if (provider !== 'custom' && PROVIDERS[provider].defaultUrl) {
      setDirectoryUrl(PROVIDERS[provider].defaultUrl)
    }
  }, [provider])

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email) return 'Contact email is required'
    if (!emailRegex.test(email)) return 'Invalid email format'
    return null
  }

  const handleValidation = async () => {
    setIsValidating(true)
    const newErrors = {}

    // Validate email
    const emailError = validateEmail(email)
    if (emailError) newErrors.email = emailError

    // Check EAB requirement
    if (selectedProvider.requiresEab && !eabSecret) {
      newErrors.eabSecret = `EAB credentials required for ${selectedProvider.name}`
    }

    // Check directory URL for custom provider
    if (selectedProvider.requiresCustomUrl && !directoryUrl) {
      newErrors.directoryUrl = 'Directory URL is required'
    }

    setErrors(newErrors)
    setIsValidating(false)

    if (Object.keys(newErrors).length === 0) {
      onNext({
        provider,
        email,
        keyType,
        challenge: 'HTTP-01',
        eabSecret: selectedProvider.requiresEab ? eabSecret : '',
        directoryUrl
      })
    }
  }

  return (
    <WizardStep
      title="Provider Configuration"
      subtitle={mode === 'renew' ? 
        "Update provider settings for certificate renewal" : 
        "Select and configure your ACME certificate provider"}
      icon="🔧"
    >
      <div className="provider-step">
        {/* Provider Selection Grid */}
        <FormField label="Select ACME Provider" required>
          <div className="provider-grid">
            {Object.entries(PROVIDERS).map(([key, providerInfo]) => (
              <div
                key={key}
                className={`provider-card ${provider === key ? 'selected' : ''}`}
                onClick={() => !disabled && setProvider(key)}
              >
                <div className="provider-card-header">
                  <div className="provider-logo" style={{ backgroundColor: `${providerInfo.color}20` }}>
                    <span style={{ fontSize: '24px' }}>{providerInfo.logo}</span>
                  </div>
                  <div className="provider-check">
                    {provider === key && '✓'}
                  </div>
                </div>
                <div className="provider-card-body">
                  <div className="provider-name">{providerInfo.name}</div>
                  <div className="provider-description">{providerInfo.description}</div>
                  <div className="provider-badges">
                    {!providerInfo.requiresEab && <span className="badge badge-success">No EAB</span>}
                    {providerInfo.requiresEab && <span className="badge badge-warning">EAB Required</span>}
                    {key === 'lets-encrypt' && <span className="badge badge-info">Free</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </FormField>

        {/* Provider Details */}
        {selectedProvider && (
          <div className="provider-details">
            <div className="details-grid">
              <div className="details-section">
                <h4>Features</h4>
                <ul className="feature-list">
                  {selectedProvider.features.map((feature, idx) => (
                    <li key={idx}>
                      <span className="feature-icon">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="details-section">
                <h4>Limitations</h4>
                <ul className="limitation-list">
                  {selectedProvider.limitations.map((limitation, idx) => (
                    <li key={idx}>
                      <span className="limitation-icon">!</span>
                      {limitation}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* EAB Configuration */}
        {selectedProvider.requiresEab && (
          <div className="eab-section">
            <InfoCard type="warning" title="External Account Binding Required">
              <p>
                {selectedProvider.name} requires EAB credentials. 
                {selectedProvider.setupUrl && (
                  <> Get them from <a href={selectedProvider.setupUrl} target="_blank" rel="noopener noreferrer">
                    {selectedProvider.setupUrl}
                  </a></>
                )}
              </p>
              <p style={{ marginTop: '8px' }}>
                Store your EAB credentials in Vault as: <code>{`{"kid":"...", "hmac_key":"..."}`}</code>
              </p>
            </InfoCard>
            
            <FormField
              label="EAB Secret Path"
              required
              error={errors.eabSecret}
              helpText={`Vault KV path containing EAB credentials (e.g., secret/data/eab/${provider})`}
            >
              <input
                type="text"
                className="input"
                value={eabSecret}
                onChange={(e) => setEabSecret(e.target.value)}
                placeholder={`secret/data/eab/${provider}`}
                disabled={disabled}
              />
            </FormField>
          </div>
        )}

        {/* Directory URL for custom providers */}
        {selectedProvider.requiresCustomUrl && (
          <FormField
            label="ACME Directory URL"
            required
            error={errors.directoryUrl}
            helpText="The ACME directory endpoint URL for your provider"
          >
            <input
              type="url"
              className="input"
              value={directoryUrl}
              onChange={(e) => setDirectoryUrl(e.target.value)}
              placeholder={selectedProvider.defaultUrl || 'https://acme.example.com/directory'}
              disabled={disabled}
            />
          </FormField>
        )}

        {/* Contact Configuration */}
        <div className="contact-section">
          <FormField
            label="Contact Email"
            required
            error={errors.email}
            helpText="Email address for certificate expiry notifications and account recovery"
          >
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              disabled={disabled}
            />
          </FormField>
        </div>

        {/* Key Type Selection */}
        <div className="key-type-section">
          <FormField
            label="Key Type"
            helpText="Select the cryptographic algorithm for your certificate key"
          >
            <div className="key-type-grid">
              {Object.entries(KEY_TYPES).map(([key, info]) => (
                <div
                  key={key}
                  className={`key-type-option ${keyType === key ? 'selected' : ''}`}
                  onClick={() => !disabled && setKeyType(key)}
                >
                  <div className="key-type-header">
                    <span className="key-type-icon">{info.icon}</span>
                    <span className="key-type-name">{info.name}</span>
                    {keyType === key && <span className="key-type-check">✓</span>}
                  </div>
                  <div className="key-type-description">{info.description}</div>
                </div>
              ))}
            </div>
          </FormField>
        </div>

        {/* Advanced Settings */}
        <div className="advanced-section">
          <button
            type="button"
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>{showAdvanced ? '▼' : '▶'}</span>
            Advanced Settings
          </button>
          
          {showAdvanced && (
            <div className="advanced-content">
              <FormField label="Challenge Type" helpText="HTTP-01 is currently the only supported challenge type">
                <select className="select" value="HTTP-01" disabled>
                  <option value="HTTP-01">HTTP-01 (Port 80 validation)</option>
                  <option value="DNS-01" disabled>DNS-01 (DNS TXT record) - Coming soon</option>
                </select>
              </FormField>
            </div>
          )}
        </div>
      </div>

      <WizardActions
        onPrevious={onPrevious}
        onNext={handleValidation}
        canNext={!!email}
        nextLabel={isValidating ? 'Validating...' : 'Continue'}
        loading={isValidating}
      />
    </WizardStep>
  )
}
