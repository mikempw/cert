import React, { useState, useEffect } from 'react'
import ProgressTracker from '../ProgressTracker'
import DomainsStep from './DomainsStep'
import ProviderStep from './ProviderStep'
import BigIPStep from './BigIPStep'
import VaultStep from './VaultStep'
import ReviewStep from './ReviewStep'
import { WizardStep, InfoCard } from './WizardStep'
import './CertificateWizard.css'

const WIZARD_STEPS = {
  issue: [
    { id: 'domains', label: 'Domains', icon: '🌐', description: 'Configure certificate domains' },
    { id: 'provider', label: 'Provider', icon: '🔧', description: 'Select ACME provider' },
    { id: 'bigip', label: 'BIG-IP', icon: '🖥️', description: 'Configure deployment' },
    { id: 'vault', label: 'Vault', icon: '🔐', description: 'Set storage path' },
    { id: 'review', label: 'Review', icon: '✓', description: 'Confirm and issue' }
  ],
  renew: [
    { id: 'select', label: 'Select', icon: '📋', description: 'Choose certificate' },
    { id: 'provider', label: 'Provider', icon: '🔧', description: 'Update provider' },
    { id: 'bigip', label: 'BIG-IP', icon: '🖥️', description: 'Update deployment' },
    { id: 'vault', label: 'Vault', icon: '🔐', description: 'Update storage' },
    { id: 'review', label: 'Review', icon: '✓', description: 'Confirm and renew' }
  ]
}

export default function CertificateWizard({ mode = 'issue' }) {
  // Session management
  const [sessionId, setSessionId] = useState(null)
  const [slots, setSlots] = useState({})
  const [nextQuestion, setNextQuestion] = useState(null)
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState([])
  const [wizardData, setWizardData] = useState({})
  
  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  
  const steps = WIZARD_STEPS[mode]

  // Initialize session when component mounts
  useEffect(() => {
    initializeSession()
  }, [mode])

  const initializeSession = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/guided/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Use session_id instead of sid (matching backend response)
      setSessionId(data.session_id)
      setSlots(data.slots || {})
      setNextQuestion(data.next_question)
      setIsLoading(false)
    } catch (err) {
      setError(`Failed to initialize session: ${err.message}`)
      setIsLoading(false)
    }
  }

  const answerQuestion = async (question, value) => {
    if (!sessionId) return
    
    try {
      const response = await fetch(`/api/guided/answer/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          answer: value
        })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      setSlots(data.slots || {})
      setNextQuestion(data.next_question)
      
      return data
    } catch (err) {
      setError(`Failed to save answer: ${err.message}`)
      throw err
    }
  }

  const handleStepComplete = async (stepId, data) => {
    // Store step data
    setWizardData(prev => ({
      ...prev,
      [stepId]: data
    }))
    
    // Mark step as completed
    setCompletedSteps(prev => [...prev, stepId])
    
    // Submit to backend based on step
    try {
      switch(stepId) {
        case 'domains':
        case 'select':
          await answerQuestion('domains', data)
          break
        case 'provider':
          await answerQuestion('provider', data.provider)
          await answerQuestion('contact_emails', [data.email])
          await answerQuestion('key_type', data.keyType)
          if (data.eabSecret) await answerQuestion('eab_secret', data.eabSecret)
          if (data.directoryUrl) await answerQuestion('directory_url', data.directoryUrl)
          break
        case 'bigip':
          await answerQuestion('bigip_host', data.host)
          await answerQuestion('bigip_partition', data.partition)
          if (data.profile) await answerQuestion('bigip_profile', data.profile)
          if (data.vs) await answerQuestion('bigip_vs', data.vs)
          break
        case 'vault':
          await answerQuestion('vault_private_key', data)
          break
      }
      
      // Move to next step
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1)
      }
    } catch (err) {
      console.error('Error completing step:', err)
    }
  }

  const handleStepBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleCommit = async () => {
    if (!sessionId) {
      setError('No session ID available. Please restart the wizard.')
      return
    }
    
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/guided/commit/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      setResult(data)
      
      // Show success message
      setTimeout(() => {
        setCurrentStep(steps.length) // Move to completion state
      }, 1500)
    } catch (err) {
      setError(`Failed to ${mode} certificate: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const renderCurrentStep = () => {
    const step = steps[currentStep]
    
    if (!step) {
      return renderCompletion()
    }
    
    switch (step.id) {
      case 'domains':
        return (
          <DomainsStep
            value={wizardData.domains || []}
            onNext={(data) => handleStepComplete('domains', data)}
            disabled={isLoading}
          />
        )
        
      case 'select':
        return (
          <SelectCertificateStep
            onNext={(data) => handleStepComplete('select', data)}
            disabled={isLoading}
          />
        )
        
      case 'provider':
        return (
          <ProviderStep
            value={wizardData.provider || {}}
            onNext={(data) => handleStepComplete('provider', data)}
            onPrevious={handleStepBack}
            disabled={isLoading}
            mode={mode}
          />
        )
        
      case 'bigip':
        return (
          <BigIPStep
            value={wizardData.bigip || {}}
            onNext={(data) => handleStepComplete('bigip', data)}
            onPrevious={handleStepBack}
            disabled={isLoading}
          />
        )
        
      case 'vault':
        return (
          <VaultStep
            value={wizardData.vault || ''}
            onNext={(data) => handleStepComplete('vault', data)}
            onPrevious={handleStepBack}
            disabled={isLoading}
            domains={wizardData.domains || []}
            mode={mode}
          />
        )
        
      case 'review':
        return (
          <ReviewStep
            data={wizardData}
            slots={slots}
            onCommit={handleCommit}
            onPrevious={handleStepBack}
            disabled={isLoading}
            mode={mode}
          />
        )
        
      default:
        return <div>Unknown step</div>
    }
  }

  const renderCompletion = () => {
    return (
      <WizardStep
        title={`Certificate ${mode === 'issue' ? 'Issued' : 'Renewed'} Successfully`}
        subtitle="Your certificate has been processed and deployed"
        icon="🎉"
      >
        <div className="completion-content">
          {result && (
            <div className="result-summary">
              <div className="result-card success">
                <div className="result-icon">✅</div>
                <div className="result-details">
                  <h3>Operation Completed</h3>
                  <p>Certificate ID: <code>{result.cert_id}</code></p>
                  <p>Domains: {wizardData.domains?.join(', ')}</p>
                </div>
              </div>
              
              <div className="result-actions">
                <button 
                  className="btn btn-primary"
                  onClick={() => window.location.href = '/inventory'}
                >
                  View in Inventory
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={initializeSession}
                >
                  {mode === 'issue' ? 'Issue Another' : 'Renew Another'}
                </button>
              </div>
            </div>
          )}
        </div>
      </WizardStep>
    )
  }

  if (error && !result) {
    return (
      <div className="wizard-container">
        <InfoCard type="error" title="Error">
          {error}
          <div className="error-actions">
            <button className="btn btn-primary" onClick={initializeSession}>
              Try Again
            </button>
          </div>
        </InfoCard>
      </div>
    )
  }

  return (
    <div className="certificate-wizard">
      {/* Debug info bar */}
      <div style={{background: '#f0f0f0', padding: '10px', marginBottom: '20px', fontSize: '12px', fontFamily: 'monospace'}}>
        Session ID: {sessionId || 'Not initialized'} | 
        Current Step: {currentStep} | 
        Mode: {mode}
      </div>
      
      {/* Progress Tracker */}
      <ProgressTracker
        steps={steps}
        currentStep={currentStep}
        mode={mode}
      />
      
      {/* Current Step Content */}
      <div className="wizard-content">
        {isLoading && currentStep === 0 ? (
          <div className="wizard-loading">
            <div className="spinner"></div>
            <span>Initializing wizard...</span>
          </div>
        ) : (
          renderCurrentStep()
        )}
      </div>
      
      {/* Debug Panel (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="debug-panel">
          <summary>Debug Info</summary>
          <pre>{JSON.stringify({ sessionId, slots, nextQuestion, wizardData }, null, 2)}</pre>
        </details>
      )}
    </div>
  )
}

// Placeholder for Select Certificate Step (for renewal mode)
function SelectCertificateStep({ onNext, disabled }) {
  const [selectedCert, setSelectedCert] = useState(null)
  const [certificates, setCertificates] = useState([
    { id: '1', domain: 'example.com', expires: '2025-03-15', issuer: 'Let\'s Encrypt' },
    { id: '2', domain: 'api.example.com', expires: '2025-02-10', issuer: 'ZeroSSL' },
    { id: '3', domain: 'www.example.com', expires: '2025-01-20', issuer: 'Google' }
  ])

  return (
    <WizardStep
      title="Select Certificate to Renew"
      subtitle="Choose from your existing certificates"
      icon="📋"
    >
      <div className="cert-selection">
        <div className="cert-grid">
          {certificates.map(cert => (
            <div
              key={cert.id}
              className={`cert-card ${selectedCert?.id === cert.id ? 'selected' : ''}`}
              onClick={() => setSelectedCert(cert)}
            >
              <div className="cert-domain">{cert.domain}</div>
              <div className="cert-details">
                <span className="cert-issuer">{cert.issuer}</span>
                <span className="cert-expiry">Expires: {cert.expires}</span>
              </div>
              {selectedCert?.id === cert.id && <span className="cert-check">✓</span>}
            </div>
          ))}
        </div>
        
        <div className="wizard-actions">
          <div className="actions-right">
            <button
              className="btn btn-primary"
              onClick={() => onNext([selectedCert.domain])}
              disabled={!selectedCert || disabled}
            >
              Continue
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </WizardStep>
  )
}
