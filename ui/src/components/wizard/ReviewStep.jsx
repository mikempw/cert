import React, { useState } from 'react'
import { WizardStep, WizardActions, InfoCard } from './WizardStep'
import './ReviewStep.css'

export default function ReviewStep({
  data,
  slots,
  onCommit,
  onPrevious,
  disabled = false,
  mode = 'issue'
}) {
  const [isCommitting, setIsCommitting] = useState(false)
  const [agreementChecked, setAgreementChecked] = useState(false)

  const handleCommit = async () => {
    setIsCommitting(true)
    try {
      await onCommit()
    } finally {
      setIsCommitting(false)
    }
  }

  // Extract data for display
  const domains = data.domains || []
  const provider = data.provider || {}
  const bigip = data.bigip || {}
  const vaultPath = data.vault || ''

  const getProviderName = () => {
    const providerMap = {
      'lets-encrypt': "Let's Encrypt",
      'google': 'Google Public CA',
      'zerossl': 'ZeroSSL',
      'sectigo': 'Sectigo',
      'digicert': 'DigiCert',
      'custom': 'Custom Provider'
    }
    return providerMap[provider.provider] || provider.provider
  }

  return (
    <WizardStep
      title={`Review & ${mode === 'issue' ? 'Issue' : 'Renew'} Certificate`}
      subtitle="Please review your configuration before proceeding"
      icon="📋"
    >
      <div className="review-step">
        {/* Summary Cards */}
        <div className="review-grid">
          {/* Domains Summary */}
          <div className="review-section">
            <div className="section-header">
              <div className="section-icon">🌐</div>
              <div className="section-title">Certificate Domains</div>
            </div>
            <div className="section-content">
              <div className="review-item">
                <span className="review-label">Primary Domain:</span>
                <span className="review-value primary">{domains[0] || 'Not set'}</span>
              </div>
              {domains.slice(1).length > 0 && (
                <div className="review-item">
                  <span className="review-label">Additional SANs:</span>
                  <div className="san-list">
                    {domains.slice(1).map((domain, idx) => (
                      <span key={idx} className="san-tag">{domain}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="review-item">
                <span className="review-label">Total Domains:</span>
                <span className="review-value">{domains.length}</span>
              </div>
            </div>
          </div>

          {/* Provider Summary */}
          <div className="review-section">
            <div className="section-header">
              <div className="section-icon">🔧</div>
              <div className="section-title">ACME Provider</div>
            </div>
            <div className="section-content">
              <div className="review-item">
                <span className="review-label">Provider:</span>
                <span className="review-value">{getProviderName()}</span>
              </div>
              <div className="review-item">
                <span className="review-label">Contact Email:</span>
                <span className="review-value">{provider.email || 'Not set'}</span>
              </div>
              <div className="review-item">
                <span className="review-label">Key Type:</span>
                <span className="review-value">{provider.keyType || 'EC256'}</span>
              </div>
              {provider.eabSecret && (
                <div className="review-item">
                  <span className="review-label">EAB Path:</span>
                  <span className="review-value mono">{provider.eabSecret}</span>
                </div>
              )}
            </div>
          </div>

          {/* BIG-IP Summary */}
          <div className="review-section">
            <div className="section-header">
              <div className="section-icon">🖥️</div>
              <div className="section-title">BIG-IP Configuration</div>
            </div>
            <div className="section-content">
              <div className="review-item">
                <span className="review-label">Host:</span>
                <span className="review-value">{bigip.host || 'Not set'}</span>
              </div>
              <div className="review-item">
                <span className="review-label">Partition:</span>
                <span className="review-value mono">{bigip.partition || '/Common'}</span>
              </div>
              {bigip.profile && (
                <div className="review-item">
                  <span className="review-label">SSL Profile:</span>
                  <span className="review-value mono">{bigip.profile}</span>
                </div>
              )}
              {bigip.vs && (
                <div className="review-item">
                  <span className="review-label">Virtual Server:</span>
                  <span className="review-value mono">{bigip.vs}</span>
                </div>
              )}
            </div>
          </div>

          {/* Vault Summary */}
          <div className="review-section">
            <div className="section-header">
              <div className="section-icon">🔐</div>
              <div className="section-title">Vault Storage</div>
            </div>
            <div className="section-content">
              <div className="review-item">
                <span className="review-label">Secret Path:</span>
                <span className="review-value mono">{vaultPath || 'Not set'}</span>
              </div>
              <div className="review-item">
                <span className="review-label">Storage Type:</span>
                <span className="review-value">KV v2</span>
              </div>
            </div>
          </div>
        </div>

        {/* Warnings and Notices */}
        {mode === 'issue' && (
          <InfoCard type="warning" title="Important Notice">
            <ul className="notice-list">
              <li>The certificate will be valid for 90 days</li>
              <li>HTTP-01 challenge will be used for domain validation</li>
              <li>The BIG-IP device must be accessible from this server</li>
              <li>Ensure port 80 is accessible for ACME validation</li>
            </ul>
          </InfoCard>
        )}

        {mode === 'renew' && (
          <InfoCard type="info" title="Renewal Information">
            <ul className="notice-list">
              <li>The existing certificate will be replaced</li>
              <li>Private key will be regenerated</li>
              <li>Virtual servers will be updated automatically</li>
              <li>Previous certificate will be backed up in Vault</li>
            </ul>
          </InfoCard>
        )}

        {/* Terms Agreement */}
        <div className="agreement-section">
          <label className="agreement-checkbox">
            <input
              type="checkbox"
              checked={agreementChecked}
              onChange={(e) => setAgreementChecked(e.target.checked)}
              disabled={disabled}
            />
            <div className="agreement-text">
              I confirm that the configuration above is correct and I'm authorized to request 
              this certificate for the specified domains.
            </div>
          </label>
        </div>

        {/* Final Actions */}
        <div className="final-actions">
          <div className="action-summary">
            <div className="action-icon">
              {mode === 'issue' ? '🚀' : '🔄'}
            </div>
            <div className="action-text">
              <div className="action-title">
                Ready to {mode === 'issue' ? 'Issue' : 'Renew'} Certificate
              </div>
              <div className="action-description">
                This will {mode === 'issue' ? 'request a new' : 'renew the'} certificate 
                from {getProviderName()} and deploy it to your BIG-IP device.
              </div>
            </div>
          </div>
        </div>
      </div>

      <WizardActions
        onPrevious={onPrevious}
        onNext={handleCommit}
        canNext={agreementChecked && !isCommitting}
        nextLabel={isCommitting ? 'Processing...' : mode === 'issue' ? 'Issue Certificate' : 'Renew Certificate'}
        loading={isCommitting}
      />
    </WizardStep>
  )
}
