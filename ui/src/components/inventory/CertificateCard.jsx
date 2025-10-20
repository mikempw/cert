import React, { useState } from 'react'
import './CertificateCard.css'

export default function CertificateCard({
  certificate,
  isSelected,
  syncStatus,
  onSelect,
  onAction
}) {
  const [showActions, setShowActions] = useState(false)
  
  const getStatusBadge = () => {
    switch (certificate.healthStatus) {
      case 'healthy':
        return { class: 'status-healthy', text: 'Active', icon: '✓' }
      case 'warning':
        return { class: 'status-warning', text: 'Expiring Soon', icon: '⚠' }
      case 'critical':
        return { class: 'status-critical', text: 'Critical', icon: '⚠' }
      case 'expired':
        return { class: 'status-expired', text: 'Expired', icon: '✗' }
      case 'revoked':
        return { class: 'status-revoked', text: 'Revoked', icon: '⊘' }
      default:
        return { class: 'status-unknown', text: 'Unknown', icon: '?' }
    }
  }
  
  const getProviderLogo = () => {
    const logos = {
      'lets-encrypt': '🔒',
      'google': '🔷',
      'zerossl': '🛡️',
      'sectigo': '🏢',
      'digicert': '🔐',
      'custom': '⚙️'
    }
    return logos[certificate.provider] || '🔒'
  }
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }
  
  const formatDaysUntilExpiry = () => {
    const days = certificate.daysUntilExpiry
    if (days === null) return 'Unknown'
    if (days < 0) return `Expired ${Math.abs(days)} days ago`
    if (days === 0) return 'Expires today'
    if (days === 1) return 'Expires tomorrow'
    return `${days} days`
  }
  
  const status = getStatusBadge()
  const primaryDomain = certificate.san?.[0] || certificate.cert_id
  const additionalDomains = (certificate.san || []).slice(1)
  
  return (
    <div className={`certificate-card ${isSelected ? 'selected' : ''} ${certificate.healthStatus}`}>
      {/* Card Header */}
      <div className="card-header">
        <div className="card-selection">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <div className={`status-badge ${status.class}`}>
          <span className="status-icon">{status.icon}</span>
          <span className="status-text">{status.text}</span>
        </div>
        <div className="card-menu">
          <button 
            className="menu-btn"
            onClick={(e) => {
              e.stopPropagation()
              setShowActions(!showActions)
            }}
          >
            ⋮
          </button>
          {showActions && (
            <div className="action-menu">
              <button onClick={() => onAction('view')}>
                <span>👁️</span> View Details
              </button>
              <button onClick={() => onAction('renew')}>
                <span>🔄</span> Renew
              </button>
              <button onClick={() => onAction('download')}>
                <span>⬇️</span> Download
              </button>
              <button onClick={() => onAction('deploy')}>
                <span>🚀</span> Re-deploy
              </button>
              <div className="menu-divider"></div>
              <button 
                className="danger"
                onClick={() => onAction('revoke')}
              >
                <span>⊘</span> Revoke
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="card-body" onClick={() => onAction('view')}>
        {/* Primary Domain */}
        <div className="primary-domain">
          <h3>{primaryDomain}</h3>
          {additionalDomains.length > 0 && (
            <span className="san-count">
              +{additionalDomains.length} SAN{additionalDomains.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Provider */}
        <div className="provider-info">
          <span className="provider-logo">{getProviderLogo()}</span>
          <span className="provider-name">
            {certificate.provider?.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </span>
        </div>

        {/* Expiration Info */}
        <div className="expiration-info">
          <div className="expiry-label">Expires:</div>
          <div className="expiry-date">{formatDate(certificate.not_after)}</div>
          <div className={`expiry-countdown ${certificate.healthStatus}`}>
            {formatDaysUntilExpiry()}
          </div>
        </div>

        {/* Deployment Info */}
        {certificate.deployed?.bigip && (
          <div className="deployment-info">
            <div className="deployment-item">
              <span className="deployment-icon">🖥️</span>
              <span className="deployment-text">{certificate.deployed.bigip.host}</span>
              {syncStatus && (
                <span className={`sync-indicator ${syncStatus.synced ? 'synced' : 'out-of-sync'}`}>
                  {syncStatus.synced ? '✓' : '⚠'}
                </span>
              )}
            </div>
            {certificate.deployed.bigip.profile && (
              <div className="deployment-item">
                <span className="deployment-icon">📋</span>
                <span className="deployment-text">{certificate.deployed.bigip.profile}</span>
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {certificate.tags && certificate.tags.length > 0 && (
          <div className="tags">
            {certificate.tags.map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}

        {/* Certificate ID (subtle) */}
        <div className="cert-id">
          ID: {certificate.cert_id.slice(0, 8)}...
        </div>
      </div>

      {/* Card Footer - Quick Actions */}
      <div className="card-footer">
        <button 
          className="quick-action"
          onClick={(e) => {
            e.stopPropagation()
            onAction('renew')
          }}
          disabled={certificate.healthStatus === 'revoked'}
        >
          <span>🔄</span>
          Renew
        </button>
        <button 
          className="quick-action"
          onClick={(e) => {
            e.stopPropagation()
            onAction('view')
          }}
        >
          <span>👁️</span>
          Details
        </button>
      </div>

      {/* Visual Health Indicator Bar */}
      <div className={`health-bar ${certificate.healthStatus}`}></div>
    </div>
  )
}
