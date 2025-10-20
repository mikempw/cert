import React, { useState, useEffect } from 'react'
import { api } from '../../api'
import SearchPanel from './SearchPanel'
import CertificateGrid from './CertificateGrid'
import CertificateTable from './CertificateTable'
import CertificateDetails from './CertificateDetails'
import BulkActions from './BulkActions'
import ExportModal from './ExportModal'
import './CertificateInventory.css'

export default function CertificateInventory() {
  // State management
  const [certificates, setCertificates] = useState([])
  const [filteredCerts, setFilteredCerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' or 'table'
  const [selectedCerts, setSelectedCerts] = useState([])
  const [detailsCert, setDetailsCert] = useState(null)
  const [showExport, setShowExport] = useState(false)
  const [syncStatus, setSyncStatus] = useState({})
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({
    status: 'all', // all, active, expiring, expired, revoked
    provider: 'all',
    tags: [],
    bigipHost: 'all',
    expirationRange: 'all' // all, 30days, 60days, 90days, expired
  })
  
  // Statistics
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    expiringSoon: 0,
    expired: 0,
    revoked: 0
  })

  // Initial load
  useEffect(() => {
    fetchCertificates()
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      checkSyncStatus()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Apply filters whenever certificates or filters change
  useEffect(() => {
    applyFilters()
  }, [certificates, searchQuery, filters])

  // Calculate statistics
  useEffect(() => {
    calculateStats()
  }, [filteredCerts])

  const fetchCertificates = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const data = await api.certsList(null, 9999, null)
      const certsWithStatus = data.items.map(cert => ({
        ...cert,
        ...calculateCertStatus(cert)
      }))
      setCertificates(certsWithStatus)
      checkSyncStatus(certsWithStatus)
    } catch (err) {
      setError(`Failed to fetch certificates: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const calculateCertStatus = (cert) => {
    const now = new Date()
    const expiry = cert.not_after ? new Date(cert.not_after) : null
    
    if (!expiry) {
      return { healthStatus: 'unknown', daysUntilExpiry: null }
    }
    
    const daysUntilExpiry = Math.floor((expiry - now) / (1000 * 60 * 60 * 24))
    
    let healthStatus = 'healthy'
    if (cert.status === 'revoked') {
      healthStatus = 'revoked'
    } else if (daysUntilExpiry < 0) {
      healthStatus = 'expired'
    } else if (daysUntilExpiry <= 30) {
      healthStatus = 'critical'
    } else if (daysUntilExpiry <= 60) {
      healthStatus = 'warning'
    }
    
    return {
      healthStatus,
      daysUntilExpiry,
      expiryDate: expiry
    }
  }

  const checkSyncStatus = async (certs = certificates) => {
    const statusMap = {}
    
    // Simulate checking sync status with BIG-IP devices
    for (const cert of certs) {
      if (cert.deployed?.bigip?.host) {
        // In real implementation, this would check actual BIG-IP status
        statusMap[cert.cert_id] = {
          synced: Math.random() > 0.1, // 90% synced for demo
          lastCheck: new Date().toISOString(),
          message: Math.random() > 0.1 ? 'Synced' : 'Out of sync'
        }
      }
    }
    
    setSyncStatus(statusMap)
  }

  const applyFilters = () => {
    let filtered = [...certificates]
    
    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(cert => {
        const domains = cert.san || []
        return domains.some(d => d.toLowerCase().includes(query)) ||
               cert.cert_id.toLowerCase().includes(query) ||
               cert.provider?.toLowerCase().includes(query)
      })
    }
    
    // Apply status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(cert => {
        switch (filters.status) {
          case 'active':
            return cert.healthStatus === 'healthy' || cert.healthStatus === 'warning'
          case 'expiring':
            return cert.healthStatus === 'warning' || cert.healthStatus === 'critical'
          case 'expired':
            return cert.healthStatus === 'expired'
          case 'revoked':
            return cert.status === 'revoked'
          default:
            return true
        }
      })
    }
    
    // Apply provider filter
    if (filters.provider !== 'all') {
      filtered = filtered.filter(cert => cert.provider === filters.provider)
    }
    
    // Apply tag filter
    if (filters.tags.length > 0) {
      filtered = filtered.filter(cert => {
        const certTags = cert.tags || []
        return filters.tags.some(tag => certTags.includes(tag))
      })
    }
    
    // Apply BIG-IP host filter
    if (filters.bigipHost !== 'all') {
      filtered = filtered.filter(cert => 
        cert.deployed?.bigip?.host === filters.bigipHost
      )
    }
    
    // Apply expiration range filter
    if (filters.expirationRange !== 'all') {
      filtered = filtered.filter(cert => {
        const days = cert.daysUntilExpiry
        if (days === null) return false
        
        switch (filters.expirationRange) {
          case '30days':
            return days >= 0 && days <= 30
          case '60days':
            return days >= 0 && days <= 60
          case '90days':
            return days >= 0 && days <= 90
          case 'expired':
            return days < 0
          default:
            return true
        }
      })
    }
    
    // Sort by expiry date (soonest first)
    filtered.sort((a, b) => {
      if (!a.expiryDate) return 1
      if (!b.expiryDate) return -1
      return a.expiryDate - b.expiryDate
    })
    
    setFilteredCerts(filtered)
  }

  const calculateStats = () => {
    const stats = {
      total: filteredCerts.length,
      active: 0,
      expiringSoon: 0,
      expired: 0,
      revoked: 0
    }
    
    filteredCerts.forEach(cert => {
      if (cert.status === 'revoked') {
        stats.revoked++
      } else if (cert.healthStatus === 'expired') {
        stats.expired++
      } else if (cert.healthStatus === 'warning' || cert.healthStatus === 'critical') {
        stats.expiringSoon++
      } else if (cert.healthStatus === 'healthy') {
        stats.active++
      }
    })
    
    setStats(stats)
  }

  const handleSelectCert = (certId, selected) => {
    if (selected) {
      setSelectedCerts([...selectedCerts, certId])
    } else {
      setSelectedCerts(selectedCerts.filter(id => id !== certId))
    }
  }

  const handleSelectAll = (selected) => {
    if (selected) {
      setSelectedCerts(filteredCerts.map(cert => cert.cert_id))
    } else {
      setSelectedCerts([])
    }
  }

  const handleBulkAction = async (action, params) => {
    switch (action) {
      case 'renew':
        // Navigate to bulk renewal with selected certs
        console.log('Bulk renew:', selectedCerts)
        break
      case 'revoke':
        // Bulk revoke selected certs
        console.log('Bulk revoke:', selectedCerts)
        break
      case 'tag':
        // Apply tags to selected certs
        console.log('Bulk tag:', selectedCerts, params.tags)
        break
      case 'export':
        setShowExport(true)
        break
      default:
        break
    }
  }

  const handleCertAction = async (certId, action) => {
    const cert = certificates.find(c => c.cert_id === certId)
    if (!cert) return
    
    switch (action) {
      case 'view':
        setDetailsCert(cert)
        break
      case 'renew':
        // Navigate to renewal wizard with this cert
        window.location.href = `/renew?cert_id=${certId}`
        break
      case 'revoke':
        if (confirm(`Are you sure you want to revoke certificate for ${cert.san[0]}?`)) {
          // Call revoke API
          console.log('Revoking cert:', certId)
        }
        break
      case 'download':
        // Download certificate bundle
        console.log('Downloading cert:', certId)
        break
      case 'deploy':
        // Re-deploy to BIG-IP
        console.log('Re-deploying cert:', certId)
        break
      default:
        break
    }
  }

  // Initial search screen
  if (certificates.length === 0 && !loading && !searchQuery && filters.status === 'all') {
    return (
      <div className="cert-inventory">
        <div className="inventory-header">
          <h1>Certificate Inventory</h1>
          <div className="header-actions">
            <button 
              className="btn btn-primary"
              onClick={() => window.location.href = '/issue'}
            >
              <span>+</span>
              Issue New Certificate
            </button>
          </div>
        </div>
        
        <SearchPanel
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filters}
          onFilterChange={setFilters}
          onSearch={fetchCertificates}
          stats={stats}
        />
        
        {loading && (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Loading certificates...</span>
          </div>
        )}
        
        {!loading && certificates.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🔐</div>
            <h2>No Certificates Found</h2>
            <p>Start by searching for certificates or issuing a new one.</p>
            <button 
              className="btn btn-primary"
              onClick={fetchCertificates}
            >
              Load All Certificates
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="cert-inventory">
      {/* Header */}
      <div className="inventory-header">
        <div className="header-title-section">
          <h1>Certificate Inventory</h1>
          <div className="sync-status">
            <span className="sync-indicator">
              <span className="sync-dot"></span>
              Last sync: {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className="btn btn-secondary"
            onClick={fetchCertificates}
          >
            <span>🔄</span>
            Refresh
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => window.location.href = '/issue'}
          >
            <span>+</span>
            Issue New Certificate
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <SearchPanel
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filters={filters}
        onFilterChange={setFilters}
        onSearch={fetchCertificates}
        stats={stats}
      />

      {/* Bulk Actions Bar */}
      {selectedCerts.length > 0 && (
        <BulkActions
          selectedCount={selectedCerts.length}
          onAction={handleBulkAction}
          onClear={() => setSelectedCerts([])}
        />
      )}

      {/* View Mode Toggle */}
      <div className="view-controls">
        <div className="view-toggle">
          <button 
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <span>⊞</span> Grid
          </button>
          <button 
            className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            <span>☰</span> Table
          </button>
        </div>
        <div className="results-info">
          Showing {filteredCerts.length} of {certificates.length} certificates
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error">
          <span>⚠️</span>
          {error}
        </div>
      )}

      {/* Certificate Display */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <span>Loading certificates...</span>
        </div>
      ) : viewMode === 'grid' ? (
        <CertificateGrid
          certificates={filteredCerts}
          selectedCerts={selectedCerts}
          syncStatus={syncStatus}
          onSelectCert={handleSelectCert}
          onCertAction={handleCertAction}
        />
      ) : (
        <CertificateTable
          certificates={filteredCerts}
          selectedCerts={selectedCerts}
          syncStatus={syncStatus}
          onSelectCert={handleSelectCert}
          onSelectAll={handleSelectAll}
          onCertAction={handleCertAction}
        />
      )}

      {/* Empty State */}
      {!loading && filteredCerts.length === 0 && (
        <div className="empty-results">
          <div className="empty-icon">🔍</div>
          <h3>No certificates match your search</h3>
          <p>Try adjusting your filters or search terms.</p>
          <button 
            className="btn btn-secondary"
            onClick={() => {
              setSearchQuery('')
              setFilters({
                status: 'all',
                provider: 'all',
                tags: [],
                bigipHost: 'all',
                expirationRange: 'all'
              })
            }}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Certificate Details Modal */}
      {detailsCert && (
        <CertificateDetails
          certificate={detailsCert}
          syncStatus={syncStatus[detailsCert.cert_id]}
          onClose={() => setDetailsCert(null)}
          onAction={handleCertAction}
        />
      )}

      {/* Export Modal */}
      {showExport && (
        <ExportModal
          certificates={selectedCerts.length > 0 ? 
            filteredCerts.filter(c => selectedCerts.includes(c.cert_id)) : 
            filteredCerts
          }
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
