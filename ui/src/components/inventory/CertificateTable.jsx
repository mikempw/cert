import React from 'react';
import './CertificateTable.css';

const CertificateTable = ({ certificates, selectedCerts, onSelectCert, onSelectAll, onCertAction }) => {
  const allSelected = certificates.length > 0 && selectedCerts.length === certificates.length;
  const someSelected = selectedCerts.length > 0 && selectedCerts.length < certificates.length;

  const getStatusBadge = (status) => {
    const statusClasses = {
      'active': 'status-badge status-active',
      'expiring-soon': 'status-badge status-warning',
      'expired': 'status-badge status-error',
      'revoked': 'status-badge status-revoked',
      'pending': 'status-badge status-pending'
    };
    
    const statusLabels = {
      'active': 'Active',
      'expiring-soon': 'Expiring Soon',
      'expired': 'Expired',
      'revoked': 'Revoked',
      'pending': 'Pending'
    };

    return (
      <span className={statusClasses[status] || 'status-badge'}>
        <span className="status-dot"></span>
        {statusLabels[status] || status}
      </span>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getDaysRemainingBadge = (days) => {
    let className = 'days-badge';
    if (days <= 0) {
      className += ' days-expired';
    } else if (days <= 30) {
      className += ' days-critical';
    } else if (days <= 60) {
      className += ' days-warning';
    } else {
      className += ' days-good';
    }

    return (
      <span className={className}>
        {days <= 0 ? 'Expired' : `${days} days`}
      </span>
    );
  };

  return (
    <div className="certificate-table-container">
      <table className="certificate-table">
        <thead>
          <tr>
            <th className="checkbox-column">
              <input
                type="checkbox"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
              />
            </th>
            <th>Domain</th>
            <th>SANs</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Issued</th>
            <th>Expires</th>
            <th>Days Remaining</th>
            <th>BIG-IP</th>
            <th>Profile</th>
            <th>Tags</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {certificates.map(cert => (
            <tr key={cert.id} className={selectedCerts.includes(cert.id) ? 'selected' : ''}>
              <td className="checkbox-column">
                <input
                  type="checkbox"
                  checked={selectedCerts.includes(cert.id)}
                  onChange={() => onSelectCert(cert.id)}
                />
              </td>
              <td className="domain-cell">
                <span className="primary-domain">{cert.primaryDomain}</span>
              </td>
              <td className="sans-cell">
                {cert.sans.length > 0 ? (
                  <div className="sans-list">
                    {cert.sans.slice(0, 2).map((san, idx) => (
                      <span key={idx} className="san-item">{san}</span>
                    ))}
                    {cert.sans.length > 2 && (
                      <span className="san-more">+{cert.sans.length - 2} more</span>
                    )}
                  </div>
                ) : (
                  <span className="no-sans">-</span>
                )}
              </td>
              <td className="provider-cell">
                <span className={`provider-badge provider-${cert.provider}`}>
                  {cert.provider}
                </span>
              </td>
              <td>{getStatusBadge(cert.status)}</td>
              <td className="date-cell">{formatDate(cert.issueDate)}</td>
              <td className="date-cell">{formatDate(cert.expiryDate)}</td>
              <td className="days-cell">{getDaysRemainingBadge(cert.daysRemaining)}</td>
              <td className="bigip-cell">{cert.bigipHost}</td>
              <td className="profile-cell">
                <span className="profile-name">{cert.profile}</span>
              </td>
              <td className="tags-cell">
                {cert.tags.map((tag, idx) => (
                  <span key={idx} className="tag-badge">{tag}</span>
                ))}
              </td>
              <td className="actions-cell">
                <div className="table-actions">
                  <button 
                    className="action-btn action-view" 
                    onClick={() => onCertAction(cert.id, 'view')}
                    title="View Details"
                  >
                    👁️
                  </button>
                  <button 
                    className="action-btn action-renew" 
                    onClick={() => onCertAction(cert.id, 'renew')}
                    title="Renew"
                  >
                    🔄
                  </button>
                  <button 
                    className="action-btn action-download" 
                    onClick={() => onCertAction(cert.id, 'download')}
                    title="Download"
                  >
                    ⬇️
                  </button>
                  <div className="dropdown">
                    <button className="action-btn action-more" title="More Actions">
                      ⋯
                    </button>
                    <div className="dropdown-menu">
                      <button onClick={() => onCertAction(cert.id, 'redeploy')}>
                        🚀 Redeploy
                      </button>
                      <button onClick={() => onCertAction(cert.id, 'revoke')}>
                        ❌ Revoke
                      </button>
                      <button onClick={() => onCertAction(cert.id, 'copy')}>
                        📋 Copy Details
                      </button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {certificates.length === 0 && (
        <div className="empty-table">
          <span className="empty-icon">📋</span>
          <p>No certificates found matching your filters</p>
        </div>
      )}
    </div>
  );
};

export default CertificateTable;
