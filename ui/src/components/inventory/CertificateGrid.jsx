import React from 'react'
import CertificateCard from './CertificateCard'
import './CertificateGrid.css'

export default function CertificateGrid({
  certificates,
  selectedCerts,
  syncStatus,
  onSelectCert,
  onCertAction
}) {
  return (
    <div className="certificate-grid">
      {certificates.map(cert => (
        <CertificateCard
          key={cert.cert_id}
          certificate={cert}
          isSelected={selectedCerts.includes(cert.cert_id)}
          syncStatus={syncStatus[cert.cert_id]}
          onSelect={(selected) => onSelectCert(cert.cert_id, selected)}
          onAction={(action) => onCertAction(cert.cert_id, action)}
        />
      ))}
    </div>
  )
}
