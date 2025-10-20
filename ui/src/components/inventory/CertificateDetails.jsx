import React, { useState } from 'react';
import './CertificateDetails.css';

const CertificateDetails = ({ certificate, isOpen, onClose, onAction }) => {
  const [activeTab, setActiveTab] = useState('overview');
  
  if (!isOpen || !certificate) return null;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  };

  const getStatusColor = (status) => {
    const colors = {
      'active': '#10b981',
      'expiring-soon': '#f59e0b',
      'expired': '#ef4444',
      'revoked': '#6b7280',
      'pending': '#6366f1'
    };
    return colors[status] || '#6b7280';
  };

  return (
    <>
      {/* Backdrop */}
      <div className="details-backdrop" onClick={onClose} />
      
      {/* Modal */}
      <div className="certificate-details-modal">
        <div className="details-header">
          <div className="details-title-section">
            <h2 className="details-title">Certificate Details</h2>
            <span className="details-domain">{certificate.primaryDomain}</span>
          </div>
          <button className="details-close" onClick={onClose}>✕</button>
        </div>

        {/* Quick Status Bar */}
        <div className="details-status-bar">
          <div className="status-item">
            <span className="status-label">Status</span>
            <span 
              className="status-value" 
              style={{ color: getStatusColor(certificate.status) }}
            >
              {certificate.status}
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Provider</span>
            <span className="status-value">{certificate.provider}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Days Remaining</span>
            <span className="status-value">
              {certificate.daysRemaining > 0 
                ? `${certificate.daysRemaining} days`
                : 'Expired'
              }
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Certificate ID</span>
            <span className="status-value mono">{certificate.id.substring(0, 8)}...</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="details-tabs">
          <button 
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`tab ${activeTab === 'domains' ? 'active' : ''}`}
            onClick={() => setActiveTab('domains')}
          >
            Domains
          </button>
          <button 
            className={`tab ${activeTab === 'deployment' ? 'active' : ''}`}
            onClick={() => setActiveTab('deployment')}
          >
            Deployment
          </button>
          <button 
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
        </div>

        {/* Tab Content */}
        <div className="details-content">
          {activeTab === 'overview' && (
            <div className="tab-content">
              <div className="detail-section">
                <h3>Certificate Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Certificate ID</label>
                    <div className="detail-value-with-action">
                      <span className="mono">{certificate.id}</span>
                      <button 
                        className="copy-btn"
                        onClick={() => copyToClipboard(certificate.id, 'Certificate ID')}
                      >
                        📋
                      </button>
                    </div>
                  </div>
                  <div className="detail-item">
                    <label>Issue Date</label>
                    <span>{formatDate(certificate.issueDate)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Expiry Date</label>
                    <span>{formatDate(certificate.expiryDate)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Key Type</label>
                    <span>{certificate.keyType || 'EC256'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Vault Path</label>
                    <span className="mono">secret/data/tls/{certificate.primaryDomain}</span>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Tags</h3>
                <div className="tags-list">
                  {certificate.tags.map((tag, idx) => (
                    <span key={idx} className="tag-item">{tag}</span>
                  ))}
                  <button className="add-tag-btn">+ Add Tag</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'domains' && (
            <div className="tab-content">
              <div className="detail-section">
                <h3>Primary Domain</h3>
                <div className="domain-card primary">
                  <span className="domain-name">{certificate.primaryDomain}</span>
                  <button 
                    className="copy-btn"
                    onClick={() => copyToClipboard(certificate.primaryDomain, 'Domain')}
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="detail-section">
                <h3>Subject Alternative Names (SANs)</h3>
                <div className="sans-grid">
                  {certificate.sans.map((san, idx) => (
                    <div key={idx} className="domain-card">
                      <span className="domain-name">{san}</span>
                      <button 
                        className="copy-btn"
                        onClick={() => copyToClipboard(san, 'SAN')}
                      >
                        Copy
                      </button>
                    </div>
                  ))}
                </div>
                <p className="detail-note">
                  Total domains covered: {certificate.sans.length + 1}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'deployment' && (
            <div className="tab-content">
              <div className="detail-section">
                <h3>BIG-IP Configuration</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Host</label>
                    <span className="mono">{certificate.bigipHost}</span>
                  </div>
                  <div className="detail-item">
                    <label>Partition</label>
                    <span className="mono">{certificate.partition}</span>
                  </div>
                  <div className="detail-item">
                    <label>Client SSL Profile</label>
                    <span className="mono">{certificate.profile}</span>
                  </div>
                  <div className="detail-item">
                    <label>Virtual Server</label>
                    <span className="mono">{certificate.virtualServer || 'Not attached'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Last Deployed</label>
                    <span>{formatDate(certificate.lastDeployed || certificate.issueDate)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Deployment Status</label>
                    <span className="deployment-status success">✅ Active</span>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Quick Actions</h3>
                <div className="deployment-actions">
                  <button 
                    className="deploy-btn"
                    onClick={() => onAction('redeploy', certificate.id)}
                  >
                    🚀 Redeploy to BIG-IP
                  </button>
                  <button 
                    className="deploy-btn"
                    onClick={() => onAction('sync', certificate.id)}
                  >
                    🔄 Sync Status
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="tab-content">
              <div className="detail-section">
                <h3>Certificate History</h3>
                <div className="history-timeline">
                  <div className="history-item">
                    <div className="history-date">Today</div>
                    <div className="history-event">
                      <span className="history-icon">👁️</span>
                      <span className="history-text">Certificate viewed</span>
                      <span className="history-time">Just now</span>
                    </div>
                  </div>
                  <div className="history-item">
                    <div className="history-date">{certificate.issueDate}</div>
                    <div className="history-event">
                      <span className="history-icon">📜</span>
                      <span className="history-text">Certificate issued</span>
                      <span className="history-time">10:30 AM</span>
                    </div>
                  </div>
                  <div className="history-item">
                    <div className="history-date">{certificate.issueDate}</div>
                    <div className="history-event">
                      <span className="history-icon">🚀</span>
                      <span className="history-text">Deployed to BIG-IP</span>
                      <span className="history-time">10:35 AM</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="details-footer">
          <div className="footer-actions-left">
            <button 
              className="action-btn action-danger"
              onClick={() => onAction('revoke', certificate.id)}
            >
              ❌ Revoke Certificate
            </button>
          </div>
          <div className="footer-actions-right">
            <button 
              className="action-btn action-secondary"
              onClick={() => onAction('download', certificate.id)}
            >
              ⬇️ Download
            </button>
            <button 
              className="action-btn action-primary"
              onClick={() => onAction('renew', certificate.id)}
            >
              🔄 Renew Now
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CertificateDetails;
