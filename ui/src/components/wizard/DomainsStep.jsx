import React, { useState, useEffect } from 'react'
import { WizardStep, FormField, WizardActions, InfoCard, TagInput } from './WizardStep'
import './DomainsStep.css'

export default function DomainsStep({ 
  value = [], 
  onNext, 
  onValidate,
  disabled = false 
}) {
  const [domains, setDomains] = useState(value)
  const [primaryDomain, setPrimaryDomain] = useState(value[0] || '')
  const [additionalDomains, setAdditionalDomains] = useState(value.slice(1) || [])
  const [errors, setErrors] = useState({})
  const [validationStatus, setValidationStatus] = useState({})
  const [isValidating, setIsValidating] = useState(false)

  useEffect(() => {
    // Update domains array when primary or additional domains change
    const allDomains = [primaryDomain, ...additionalDomains].filter(Boolean)
    setDomains(allDomains)
  }, [primaryDomain, additionalDomains])

  const validateDomain = (domain) => {
    // Basic domain validation
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/
    
    if (!domain) {
      return 'Domain is required'
    }
    
    if (domain.startsWith('*.')) {
      return 'Wildcard domains require DNS-01 validation (not supported in HTTP-01)'
    }
    
    if (!domainRegex.test(domain)) {
      return 'Invalid domain format'
    }
    
    if (domain.length > 253) {
      return 'Domain name too long (max 253 characters)'
    }
    
    return null
  }

  const handlePrimaryDomainChange = (e) => {
    const value = e.target.value.toLowerCase().trim()
    setPrimaryDomain(value)
    
    // Clear error when user starts typing
    if (errors.primary) {
      setErrors({ ...errors, primary: null })
    }
  }

  const handleValidation = async () => {
    setIsValidating(true)
    const newErrors = {}
    const newStatus = {}

    // Validate primary domain
    const primaryError = validateDomain(primaryDomain)
    if (primaryError) {
      newErrors.primary = primaryError
      newStatus.primary = 'error'
    } else {
      newStatus.primary = 'success'
    }

    // Validate additional domains
    additionalDomains.forEach((domain, index) => {
      const error = validateDomain(domain)
      if (error) {
        newErrors[`additional_${index}`] = error
        newStatus[`additional_${index}`] = 'error'
      } else {
        newStatus[`additional_${index}`] = 'success'
      }
    })

    // Check for duplicates
    const allDomains = [primaryDomain, ...additionalDomains].filter(Boolean)
    const uniqueDomains = new Set(allDomains)
    if (uniqueDomains.size !== allDomains.length) {
      newErrors.duplicate = 'Duplicate domains detected'
    }

    setErrors(newErrors)
    setValidationStatus(newStatus)
    setIsValidating(false)

    // If no errors, proceed
    if (Object.keys(newErrors).length === 0) {
      if (onValidate) {
        const validationResult = await onValidate(allDomains)
        if (validationResult.success) {
          onNext(allDomains)
        } else {
          setErrors({ validation: validationResult.message })
        }
      } else {
        onNext(allDomains)
      }
    }
  }

  const handleAddDomain = (newDomains) => {
    setAdditionalDomains(newDomains)
  }

  const getDomainInfo = (domain) => {
    if (!domain) return null
    
    const parts = domain.split('.')
    const isSubdomain = parts.length > 2
    const isWildcard = domain.startsWith('*.')
    
    return {
      isSubdomain,
      isWildcard,
      tld: parts[parts.length - 1],
      sld: parts[parts.length - 2]
    }
  }

  const primaryInfo = getDomainInfo(primaryDomain)

  return (
    <WizardStep
      title="Domain Configuration"
      subtitle="Specify the domains for which you want to request certificates"
      icon="🌐"
    >
      <div className="domains-step">
        {/* Primary Domain Section */}
        <div className="domain-section">
          <FormField
            label="Primary Domain"
            required
            error={errors.primary}
            helpText="This will be the main domain for your certificate (e.g., example.com)"
          >
            <div className="input-with-status">
              <input
                type="text"
                className="input"
                value={primaryDomain}
                onChange={handlePrimaryDomainChange}
                placeholder="example.com"
                disabled={disabled}
                autoFocus
              />
              {validationStatus.primary === 'success' && (
                <span className="input-status-icon success">✓</span>
              )}
            </div>
          </FormField>

          {primaryInfo && !errors.primary && (
            <div className="domain-info">
              <div className="info-item">
                <span className="info-label">Type:</span>
                <span className="info-value">
                  {primaryInfo.isWildcard ? 'Wildcard' : primaryInfo.isSubdomain ? 'Subdomain' : 'Root domain'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">TLD:</span>
                <span className="info-value">.{primaryInfo.tld}</span>
              </div>
            </div>
          )}
        </div>

        {/* Additional Domains Section */}
        <div className="domain-section">
          <FormField
            label="Additional Domains (SANs)"
            helpText="Add alternative domain names to include in the certificate"
          >
            <TagInput
              value={additionalDomains}
              onChange={handleAddDomain}
              placeholder="Type domain and press Enter"
            />
          </FormField>

          {additionalDomains.length > 0 && (
            <div className="domains-summary">
              <div className="summary-title">Certificate will include:</div>
              <ul className="domain-list">
                <li className="domain-item primary">
                  <span className="domain-badge">Primary</span>
                  {primaryDomain || '(not set)'}
                </li>
                {additionalDomains.map((domain, index) => (
                  <li key={index} className="domain-item">
                    <span className="domain-badge alt">SAN</span>
                    {domain}
                    {errors[`additional_${index}`] && (
                      <span className="domain-error">{errors[`additional_${index}`]}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="summary-stats">
                Total domains: {domains.filter(Boolean).length}
              </div>
            </div>
          )}
        </div>

        {/* Validation Tips */}
        <InfoCard type="info" title="Domain Requirements">
          <ul className="tips-list">
            <li>Use your registered domain name (e.g., example.com)</li>
            <li>Subdomains are supported (e.g., www.example.com, api.example.com)</li>
            <li>Wildcard certificates (*.example.com) require DNS-01 validation</li>
            <li>Maximum 100 domains per certificate</li>
            <li>Domain must be publicly accessible for HTTP-01 validation</li>
          </ul>
        </InfoCard>

        {/* Error Display */}
        {errors.duplicate && (
          <InfoCard type="error" title="Validation Error">
            {errors.duplicate}
          </InfoCard>
        )}

        {errors.validation && (
          <InfoCard type="error" title="Validation Failed">
            {errors.validation}
          </InfoCard>
        )}

        {/* Common Domains Quick Add */}
        <div className="quick-add-section">
          <div className="quick-add-title">Quick add common subdomains:</div>
          <div className="quick-add-buttons">
            {primaryDomain && !primaryDomain.startsWith('www.') && (
              <button
                className="quick-add-btn"
                onClick={() => setAdditionalDomains([...additionalDomains, `www.${primaryDomain}`])}
                disabled={additionalDomains.includes(`www.${primaryDomain}`)}
              >
                + www.{primaryDomain}
              </button>
            )}
            {primaryDomain && (
              <>
                <button
                  className="quick-add-btn"
                  onClick={() => setAdditionalDomains([...additionalDomains, `api.${primaryDomain}`])}
                  disabled={additionalDomains.includes(`api.${primaryDomain}`)}
                >
                  + api.{primaryDomain}
                </button>
                <button
                  className="quick-add-btn"
                  onClick={() => setAdditionalDomains([...additionalDomains, `mail.${primaryDomain}`])}
                  disabled={additionalDomains.includes(`mail.${primaryDomain}`)}
                >
                  + mail.{primaryDomain}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <WizardActions
        onNext={handleValidation}
        canNext={!!primaryDomain}
        nextLabel={isValidating ? 'Validating...' : 'Continue'}
        loading={isValidating}
      />
    </WizardStep>
  )
}
