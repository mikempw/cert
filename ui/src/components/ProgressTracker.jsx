import React from 'react'
import './ProgressTracker.css'

export default function ProgressTracker({ steps, currentStep, mode }) {
  // Calculate progress percentage
  const progressPercentage = currentStep === 0 ? 0 : ((currentStep) / (steps.length - 1)) * 100

  const getStepStatus = (index) => {
    if (index < currentStep) return 'completed'
    if (index === currentStep) return 'active'
    return 'pending'
  }

  const getStepNumber = (index, status) => {
    if (status === 'completed') {
      return '✓'
    }
    return index + 1
  }

  return (
    <div className="progress-tracker">
      <div className="progress-header">
        <h3 className="progress-title">
          {mode === 'issue' ? 'Issue New Certificate' : 'Renew Certificate'}
        </h3>
        <div className="progress-stats">
          <span className="progress-step-count">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="progress-percentage">{Math.round(progressPercentage)}% Complete</span>
        </div>
      </div>

      <div className="progress-steps">
        <div className="progress-line">
          <div 
            className="progress-line-active" 
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        
        {steps.map((step, index) => {
          const status = getStepStatus(index)
          return (
            <div 
              key={index} 
              className={`step ${status}`}
              onClick={() => step.clickable && step.onClick && step.onClick()}
            >
              <div className="step-number-container">
                <div className="step-number">
                  {getStepNumber(index, status)}
                </div>
                {status === 'active' && <div className="step-pulse" />}
              </div>
              <div className="step-content">
                <div className="step-label">{step.label}</div>
                {step.description && (
                  <div className="step-description">{step.description}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Optional: Add a summary card for current step */}
      {steps[currentStep] && steps[currentStep].summary && (
        <div className="step-summary-card">
          <div className="summary-icon">
            {steps[currentStep].icon || '📝'}
          </div>
          <div className="summary-content">
            <h4>{steps[currentStep].label}</h4>
            <p>{steps[currentStep].summary}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper component for step status indicator
export function StepStatusIndicator({ status, message }) {
  const getStatusClass = () => {
    switch (status) {
      case 'success': return 'status-success'
      case 'error': return 'status-error'
      case 'warning': return 'status-warning'
      case 'pending': return 'status-pending'
      default: return 'status-info'
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'success': return '✅'
      case 'error': return '❌'
      case 'warning': return '⚠️'
      case 'pending': return '⏳'
      default: return 'ℹ️'
    }
  }

  return (
    <div className={`step-status-indicator ${getStatusClass()}`}>
      <span className="status-icon">{getStatusIcon()}</span>
      <span className="status-message">{message}</span>
    </div>
  )
}
