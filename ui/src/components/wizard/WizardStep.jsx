import React from 'react'
import './WizardStep.css'

// Base wrapper component for all wizard steps
export function WizardStep({ children, title, subtitle, icon }) {
  return (
    <div className="wizard-step">
      {(title || subtitle) && (
        <div className="wizard-step-header">
          {icon && <div className="wizard-step-icon">{icon}</div>}
          <div className="wizard-step-header-text">
            {title && <h3 className="wizard-step-title">{title}</h3>}
            {subtitle && <p className="wizard-step-subtitle">{subtitle}</p>}
          </div>
        </div>
      )}
      <div className="wizard-step-content">
        {children}
      </div>
    </div>
  )
}

// Form field wrapper with consistent styling
export function FormField({ 
  label, 
  required, 
  error, 
  helpText, 
  children, 
  className = '' 
}) {
  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className="form-label">
          {label}
          {required && <span className="required-mark">*</span>}
        </label>
      )}
      <div className="form-input-wrapper">
        {children}
      </div>
      {helpText && !error && (
        <div className="form-help-text">{helpText}</div>
      )}
      {error && (
        <div className="form-error-text">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}
    </div>
  )
}

// Action buttons for wizard steps
export function WizardActions({ 
  onPrevious, 
  onNext, 
  onSave,
  previousLabel = 'Previous',
  nextLabel = 'Next',
  saveLabel = 'Save',
  canPrevious = true,
  canNext = true,
  canSave = false,
  loading = false 
}) {
  return (
    <div className="wizard-actions">
      <div className="actions-left">
        {onPrevious && canPrevious && (
          <button 
            className="btn btn-secondary"
            onClick={onPrevious}
            disabled={loading}
          >
            <span>←</span>
            {previousLabel}
          </button>
        )}
      </div>
      <div className="actions-right">
        {onSave && canSave && (
          <button 
            className="btn btn-success"
            onClick={onSave}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="btn-spinner"></div>
                Processing...
              </>
            ) : (
              <>
                <span>💾</span>
                {saveLabel}
              </>
            )}
          </button>
        )}
        {onNext && canNext && (
          <button 
            className="btn btn-primary"
            onClick={onNext}
            disabled={loading}
          >
            {nextLabel}
            <span>→</span>
          </button>
        )}
      </div>
    </div>
  )
}

// Info card for displaying important information
export function InfoCard({ type = 'info', title, children }) {
  const getTypeClass = () => {
    switch (type) {
      case 'success': return 'info-card-success'
      case 'warning': return 'info-card-warning'
      case 'error': return 'info-card-error'
      default: return 'info-card-info'
    }
  }

  const getTypeIcon = () => {
    switch (type) {
      case 'success': return '✅'
      case 'warning': return '⚠️'
      case 'error': return '❌'
      default: return 'ℹ️'
    }
  }

  return (
    <div className={`info-card ${getTypeClass()}`}>
      <div className="info-card-icon">{getTypeIcon()}</div>
      <div className="info-card-content">
        {title && <div className="info-card-title">{title}</div>}
        <div className="info-card-body">{children}</div>
      </div>
    </div>
  )
}

// Tag input component
export function TagInput({ value = [], onChange, placeholder }) {
  const [inputValue, setInputValue] = React.useState('')

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputValue.trim()) {
        onChange([...value, inputValue.trim()])
        setInputValue('')
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const removeTag = (index) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="tag-input">
      <div className="tag-input-container">
        {value.map((tag, index) => (
          <span key={index} className="tag">
            {tag}
            <button
              type="button"
              className="tag-remove"
              onClick={() => removeTag(index)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="tag-input-field"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
        />
      </div>
    </div>
  )
}

// Status indicator component
export function StatusIndicator({ status, message }) {
  const getStatusClass = () => {
    switch (status) {
      case 'success': return 'status-success'
      case 'error': return 'status-error'
      case 'warning': return 'status-warning'
      case 'pending': return 'status-pending'
      default: return 'status-info'
    }
  }

  return (
    <div className={`status-indicator ${getStatusClass()}`}>
      <div className="status-indicator-dot"></div>
      <span className="status-indicator-text">{message}</span>
    </div>
  )
}
