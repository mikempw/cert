import React, { useState, useEffect } from 'react'
import { WizardStep, FormField, WizardActions, InfoCard, StatusIndicator } from './WizardStep'
import './VaultStep.css'

const PATH_TEMPLATES = [
  { 
    value: 'secret/data/tls/{domain}',
    label: 'Standard TLS Path',
    description: 'Organized by domain under TLS folder',
    example: 'secret/data/tls/example.com'
  },
  {
    value: 'secret/data/certs/{env}/{domain}',
    label: 'Environment-based',
    description: 'Separated by environment (prod/dev/test)',
    example: 'secret/data/certs/prod/example.com'
  },
  {
    value: 'secret/data/{domain}/tls',
    label: 'Domain-first',
    description: 'Domain as primary folder',
    example: 'secret/data/example.com/tls'
  },
  {
    value: 'custom',
    label: 'Custom Path',
    description: 'Define your own path structure',
    example: null
  }
]

export default function VaultStep({
  value = '',
  onNext,
  onPrevious,
  onValidate,
  disabled = false,
  domains = [],
  mode = 'issue'
}) {
  const [pathTemplate, setPathTemplate] = useState('secret/data/tls/{domain}')
  const [customPath, setCustomPath] = useState('')
  const [environment, setEnvironment] = useState('prod')
  const [finalPath, setFinalPath] = useState(value || '')
  const [errors, setErrors] = useState({})
  const [isValidating, setIsValidating] = useState(false)
  const [vaultStatus, setVaultStatus] = useState(null)
  const [existingSecret, setExistingSecret] = useState(null)
  const [showPreview, setShowPreview] = useState(true)

  const primaryDomain = domains[0] || 'example.com'

  useEffect(() => {
    // Generate final path based on template
    if (pathTemplate !== 'custom') {
      let path = pathTemplate
        .replace('{domain}', primaryDomain)
        .replace('{env}', environment)
      setFinalPath(path)
    } else {
      setFinalPath(customPath)
    }
  }, [pathTemplate, customPath, environment, primaryDomain])

  useEffect(() => {
    // Check vault connectivity
    checkVaultConnection()
  }, [])

  useEffect(() => {
    // Check if path already exists when it changes
    if (finalPath && vaultStatus?.status === 'success') {
      checkExistingSecret()
    }
  }, [finalPath])

  const checkVaultConnection = async () => {
    setVaultStatus({ status: 'pending', message: 'Checking Vault connection...' })
    
    // Simulate vault check - replace with actual API call
    setTimeout(() => {
      setVaultStatus({
        status: 'success',
        message: 'Connected to Vault',
        details: {
          version: '1.16.0',
          backend: 'KV v2',
          mount: 'secret/',
          sealed: false
        }
      })
    }, 1000)
  }

  const checkExistingSecret = async () => {
    // Simulate checking if secret already exists
    setTimeout(() => {
      if (finalPath.includes('example.com') && mode === 'renew') {
        setExistingSecret({
          exists: true,
          created: '2024-01-15T10:30:00Z',
          updated: '2024-10-01T14:22:00Z',
          version: 3,
          metadata: {
            'cert_id': 'abc123',
            'issuer': 'Let\'s Encrypt',
            'expiry': '2025-01-15T10:30:00Z'
          }
        })
      } else {
        setExistingSecret({ exists: false })
      }
    }, 500)
  }

  const validatePath = (path) => {
    if (!path) return 'Vault path is required'
    
    // Check for invalid characters
    if (!/^[a-zA-Z0-9/_\-\.]+$/.test(path)) {
      return 'Path contains invalid characters'
    }
    
    // Check if path starts with secret/data for KV v2
    if (!path.startsWith('secret/data/')) {
      return 'Path must start with secret/data/ for KV v2'
    }
    
    // Check path length
    if (path.length > 255) {
      return 'Path is too long (max 255 characters)'
    }
    
    return null
  }

  const handleValidation = async () => {
    setIsValidating(true)
    const newErrors = {}

    // Validate the path
    const pathError = validatePath(finalPath)
    if (pathError) {
      newErrors.path = pathError
    }

    // Check vault connectivity
    if (vaultStatus?.status === 'error') {
      newErrors.vault = 'Unable to connect to Vault'
    }

    // Warn about existing secret
    if (existingSecret?.exists && mode === 'issue') {
      newErrors.existing = 'A secret already exists at this path. It will be overwritten.'
    }

    setErrors(newErrors)
    setIsValidating(false)

    // Only block on critical errors
    if (!newErrors.path && !newErrors.vault) {
      onNext(finalPath)
    }
  }

  const getSecretPreview = () => {
    return {
      private_key_pem: '-----BEGIN EC PRIVATE KEY-----\n[Key will be stored here]\n-----END EC PRIVATE KEY-----',
      certificate_pem: '-----BEGIN CERTIFICATE-----\n[Certificate will be stored here]\n-----END CERTIFICATE-----',
      chain_pem: '-----BEGIN CERTIFICATE-----\n[Chain will be stored here]\n-----END CERTIFICATE-----',
      metadata: {
        cert_id: '[Generated UUID]',
        domains: domains,
        issuer: '[ACME Provider]',
        created: new Date().toISOString(),
        expiry: '[Certificate Expiry]'
      }
    }
  }

  return (
    <WizardStep
      title="Vault Storage Configuration"
      subtitle={mode === 'renew' ? 
        "Update the Vault path for storing renewed certificate" :
        "Configure where to securely store the certificate private key"}
      icon="🔐"
    >
      <div className="vault-step">
        {/* Vault Connection Status */}
        <div className="vault-status-section">
          <div className="status-header">
            <h3 className="section-title">Vault Connection</h3>
            {vaultStatus && (
              <StatusIndicator
                status={vaultStatus.status}
                message={vaultStatus.message}
              />
            )}
          </div>
          
          {vaultStatus?.status === 'success' && vaultStatus.details && (
            <div className="vault-info">
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Version:</span>
                  <span className="info-value">{vaultStatus.details.version}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Backend:</span>
                  <span className="info-value">{vaultStatus.details.backend}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Mount:</span>
                  <span className="info-value">{vaultStatus.details.mount}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Status:</span>
                  <span className="info-value status-active">Unsealed</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Path Template Selection */}
        <div className="template-section">
          <h3 className="section-title">Storage Path Template</h3>
          
          <div className="template-grid">
            {PATH_TEMPLATES.map((template) => (
              <div
                key={template.value}
                className={`template-card ${pathTemplate === template.value ? 'selected' : ''}`}
                onClick={() => !disabled && setPathTemplate(template.value)}
              >
                <div className="template-header">
                  <input
                    type="radio"
                    name="pathTemplate"
                    value={template.value}
                    checked={pathTemplate === template.value}
                    onChange={() => setPathTemplate(template.value)}
                    disabled={disabled}
                  />
                  <div className="template-content">
                    <div className="template-label">{template.label}</div>
                    <div className="template-description">{template.description}</div>
                    {template.example && (
                      <div className="template-example">
                        <code>{template.example}</code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pathTemplate === 'secret/data/certs/{env}/{domain}' && (
            <FormField
              label="Environment"
              helpText="Select the environment for this certificate"
            >
              <select
                className="select"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                disabled={disabled}
              >
                <option value="prod">Production</option>
                <option value="staging">Staging</option>
                <option value="dev">Development</option>
                <option value="test">Test</option>
              </select>
            </FormField>
          )}

          {pathTemplate === 'custom' && (
            <FormField
              label="Custom Path"
              required
              helpText="Enter your custom Vault path (must start with secret/data/)"
            >
              <input
                type="text"
                className="input"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="secret/data/your/custom/path"
                disabled={disabled}
              />
            </FormField>
          )}
        </div>

        {/* Final Path Display */}
        <div className="path-preview-section">
          <FormField
            label="Final Vault Path"
            error={errors.path}
            helpText="This is the complete path where the private key will be stored"
          >
            <div className="path-preview">
              <input
                type="text"
                className="input mono"
                value={finalPath}
                onChange={(e) => setFinalPath(e.target.value)}
                disabled={disabled || pathTemplate !== 'custom'}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigator.clipboard.writeText(finalPath)}
                title="Copy to clipboard"
              >
                📋 Copy
              </button>
            </div>
          </FormField>

          {/* Existing Secret Warning */}
          {existingSecret?.exists && (
            <InfoCard 
              type={mode === 'renew' ? 'info' : 'warning'} 
              title="Existing Secret Found"
            >
              <div className="existing-secret-info">
                <div className="secret-details">
                  <div className="detail-item">
                    <span className="detail-label">Created:</span>
                    <span className="detail-value">
                      {new Date(existingSecret.created).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Last Updated:</span>
                    <span className="detail-value">
                      {new Date(existingSecret.updated).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Version:</span>
                    <span className="detail-value">{existingSecret.version}</span>
                  </div>
                </div>
                {mode === 'issue' ? (
                  <p className="warning-text">
                    ⚠️ This secret will be overwritten with the new certificate.
                  </p>
                ) : (
                  <p className="info-text">
                    ✓ This secret will be updated with the renewed certificate.
                  </p>
                )}
              </div>
            </InfoCard>
          )}

          {errors.existing && (
            <InfoCard type="warning" title="Path Already Exists">
              {errors.existing}
            </InfoCard>
          )}
        </div>

        {/* Secret Preview */}
        <div className="preview-section">
          <button
            type="button"
            className="preview-toggle"
            onClick={() => setShowPreview(!showPreview)}
          >
            <span>{showPreview ? '▼' : '▶'}</span>
            Preview Secret Structure
          </button>
          
          {showPreview && (
            <div className="secret-preview">
              <div className="preview-header">
                <span className="preview-title">Secret Contents Preview</span>
                <span className="preview-note">This shows the structure that will be stored</span>
              </div>
              <pre className="preview-content">
                {JSON.stringify(getSecretPreview(), null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Best Practices */}
        <InfoCard type="info" title="Vault Storage Best Practices">
          <ul className="practices-list">
            <li>Use a consistent naming convention across all certificates</li>
            <li>Include environment in the path for better organization</li>
            <li>Enable versioning to track certificate history</li>
            <li>Set up appropriate ACL policies for certificate paths</li>
            <li>Consider using separate mounts for different environments</li>
            <li>Regularly backup Vault data</li>
          </ul>
        </InfoCard>
      </div>

      <WizardActions
        onPrevious={onPrevious}
        onNext={handleValidation}
        canNext={!!finalPath && !errors.path}
        nextLabel={mode === 'renew' ? 'Review & Renew' : 'Review & Issue'}
        loading={isValidating}
      />
    </WizardStep>
  )
}
