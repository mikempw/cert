import React, { useState, useEffect } from 'react'
import { WizardStep, FormField, WizardActions, InfoCard, StatusIndicator } from './WizardStep'
import './BigIPStep.css'

const DEFAULT_PARTITIONS = [
  { value: '/Common', label: 'Common', description: 'Default partition for shared objects' },
  { value: '/Prod', label: 'Production', description: 'Production environment resources' },
  { value: '/Dev', label: 'Development', description: 'Development environment resources' },
  { value: '/Test', label: 'Test', description: 'Test environment resources' }
]

export default function BigIPStep({
  value = {},
  onNext,
  onPrevious,
  onValidate,
  disabled = false
}) {
  const [host, setHost] = useState(value.host || '')
  const [partition, setPartition] = useState(value.partition || '/Common')
  const [profile, setProfile] = useState(value.profile || '')
  const [virtualServer, setVirtualServer] = useState(value.vs || '')
  const [autoCreateProfile, setAutoCreateProfile] = useState(!value.profile)
  const [errors, setErrors] = useState({})
  const [connectionStatus, setConnectionStatus] = useState(null)
  const [isValidating, setIsValidating] = useState(false)
  const [vsDetails, setVsDetails] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Test connection when host changes
  useEffect(() => {
    if (host && isValidIp(host)) {
      testConnection()
    }
  }, [host])

  const isValidIp = (ip) => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/
    return ipRegex.test(ip) || hostnameRegex.test(ip)
  }

  const testConnection = async () => {
    setConnectionStatus({ status: 'pending', message: 'Testing connection...' })
    
    // Simulate connection test - replace with actual API call
    setTimeout(() => {
      if (host === '192.168.3.55' || host.includes('bigip')) {
        setConnectionStatus({ 
          status: 'success', 
          message: 'Connected successfully',
          details: {
            version: 'BIG-IP 16.1.3',
            hostname: 'bigip1.example.com',
            uptime: '45 days'
          }
        })
      } else {
        setConnectionStatus({ 
          status: 'error', 
          message: 'Connection failed - Check host and credentials' 
        })
      }
    }, 1500)
  }

  const checkVirtualServer = async () => {
    if (!virtualServer) {
      setVsDetails(null)
      return
    }

    setIsValidating(true)
    
    // Simulate VS check - replace with actual API call
    setTimeout(() => {
      if (virtualServer.includes('https')) {
        setVsDetails({
          exists: true,
          address: '10.0.0.100:443',
          pool: '/Common/web_pool',
          profiles: ['/Common/clientssl', '/Common/http'],
          status: 'enabled'
        })
      } else if (virtualServer.includes('http')) {
        setVsDetails({
          exists: true,
          address: '10.0.0.100:80',
          pool: '/Common/web_pool',
          profiles: ['/Common/http'],
          status: 'enabled'
        })
      } else {
        setVsDetails({ exists: false })
      }
      setIsValidating(false)
    }, 1000)
  }

  const handleValidation = async () => {
    const newErrors = {}

    if (!host) {
      newErrors.host = 'BIG-IP host is required'
    } else if (!isValidIp(host)) {
      newErrors.host = 'Invalid IP address or hostname format'
    }

    if (!partition) {
      newErrors.partition = 'Partition is required'
    }

    if (!autoCreateProfile && !profile) {
      newErrors.profile = 'Profile name is required when not auto-creating'
    }

    if (virtualServer && vsDetails && !vsDetails.exists) {
      newErrors.virtualServer = 'Virtual server not found on BIG-IP'
    }

    if (connectionStatus && connectionStatus.status === 'error') {
      newErrors.host = 'Unable to connect to BIG-IP host'
    }

    setErrors(newErrors)

    if (Object.keys(newErrors).length === 0) {
      onNext({
        host,
        partition,
        profile: autoCreateProfile ? '' : profile,
        vs: virtualServer
      })
    }
  }

  const getProfileName = () => {
    if (autoCreateProfile) {
      return `clientssl_${value.primaryDomain || 'auto'}_${Date.now()}`
    }
    return profile
  }

  return (
    <WizardStep
      title="BIG-IP Configuration"
      subtitle="Configure BIG-IP device settings for certificate deployment"
      icon="🖥️"
    >
      <div className="bigip-step">
        {/* Connection Section */}
        <div className="connection-section">
          <h3 className="section-title">Device Connection</h3>
          
          <div className="connection-grid">
            <FormField
              label="Management Host"
              required
              error={errors.host}
              helpText="IP address or hostname of BIG-IP management interface"
            >
              <div className="input-with-status">
                <input
                  type="text"
                  className="input"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.1.100 or bigip.example.com"
                  disabled={disabled}
                />
                {connectionStatus && (
                  <StatusIndicator
                    status={connectionStatus.status}
                    message=""
                  />
                )}
              </div>
            </FormField>

            {connectionStatus && connectionStatus.status === 'success' && connectionStatus.details && (
              <div className="connection-info">
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Version:</span>
                    <span className="info-value">{connectionStatus.details.version}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Hostname:</span>
                    <span className="info-value">{connectionStatus.details.hostname}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Uptime:</span>
                    <span className="info-value">{connectionStatus.details.uptime}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <FormField
            label="Partition"
            required
            error={errors.partition}
            helpText="BIG-IP partition where certificate objects will be created"
          >
            <select
              className="select"
              value={partition}
              onChange={(e) => setPartition(e.target.value)}
              disabled={disabled}
            >
              {DEFAULT_PARTITIONS.map(part => (
                <option key={part.value} value={part.value}>
                  {part.label} ({part.value})
                </option>
              ))}
              <option value="custom">Custom Partition...</option>
            </select>
          </FormField>

          {partition === 'custom' && (
            <FormField label="Custom Partition Name" required>
              <input
                type="text"
                className="input"
                placeholder="/CustomPartition"
                onChange={(e) => setPartition(e.target.value)}
                disabled={disabled}
              />
            </FormField>
          )}
        </div>

        {/* SSL Profile Section */}
        <div className="profile-section">
          <h3 className="section-title">Client SSL Profile</h3>
          
          <div className="profile-options">
            <label className="option-card">
              <input
                type="radio"
                name="profileOption"
                checked={autoCreateProfile}
                onChange={() => setAutoCreateProfile(true)}
                disabled={disabled}
              />
              <div className="option-content">
                <div className="option-header">
                  <span className="option-icon">🔄</span>
                  <span className="option-title">Auto-create Profile</span>
                </div>
                <div className="option-description">
                  Automatically create a new client-ssl profile with generated name
                </div>
                {autoCreateProfile && (
                  <div className="option-preview">
                    Profile name: <code>{getProfileName()}</code>
                  </div>
                )}
              </div>
            </label>

            <label className="option-card">
              <input
                type="radio"
                name="profileOption"
                checked={!autoCreateProfile}
                onChange={() => setAutoCreateProfile(false)}
                disabled={disabled}
              />
              <div className="option-content">
                <div className="option-header">
                  <span className="option-icon">📝</span>
                  <span className="option-title">Specify Profile</span>
                </div>
                <div className="option-description">
                  Use an existing profile or specify a custom name
                </div>
              </div>
            </label>
          </div>

          {!autoCreateProfile && (
            <FormField
              label="Profile Name"
              required
              error={errors.profile}
              helpText="Name of the client-ssl profile to create or update"
            >
              <input
                type="text"
                className="input"
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder="clientssl_example_com"
                disabled={disabled}
              />
            </FormField>
          )}
        </div>

        {/* Virtual Server Section */}
        <div className="vs-section">
          <h3 className="section-title">Virtual Server (Optional)</h3>
          
          <FormField
            label="Virtual Server Path"
            error={errors.virtualServer}
            helpText="Optionally attach the certificate to a virtual server"
          >
            <div className="input-with-action">
              <input
                type="text"
                className="input"
                value={virtualServer}
                onChange={(e) => setVirtualServer(e.target.value)}
                onBlur={checkVirtualServer}
                placeholder="/Common/https_vs (optional)"
                disabled={disabled}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={checkVirtualServer}
                disabled={disabled || !virtualServer || isValidating}
              >
                {isValidating ? 'Checking...' : 'Check'}
              </button>
            </div>
          </FormField>

          {vsDetails && (
            <div className={`vs-details ${vsDetails.exists ? 'found' : 'not-found'}`}>
              {vsDetails.exists ? (
                <>
                  <div className="vs-status success">
                    <span className="status-icon">✓</span>
                    Virtual Server Found
                  </div>
                  <div className="vs-info">
                    <div className="vs-info-item">
                      <span className="label">Address:</span>
                      <span className="value">{vsDetails.address}</span>
                    </div>
                    <div className="vs-info-item">
                      <span className="label">Pool:</span>
                      <span className="value">{vsDetails.pool}</span>
                    </div>
                    <div className="vs-info-item">
                      <span className="label">Status:</span>
                      <span className={`value status-${vsDetails.status}`}>
                        {vsDetails.status}
                      </span>
                    </div>
                    {vsDetails.profiles && (
                      <div className="vs-info-item">
                        <span className="label">Current Profiles:</span>
                        <div className="profile-list">
                          {vsDetails.profiles.map((prof, idx) => (
                            <span key={idx} className="profile-tag">
                              {prof}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {vsDetails.profiles?.some(p => p.includes('clientssl')) && (
                    <InfoCard type="warning" title="Existing SSL Profile">
                      This virtual server already has a client-ssl profile attached. 
                      The deployment will update the existing profile.
                    </InfoCard>
                  )}
                </>
              ) : (
                <div className="vs-status error">
                  <span className="status-icon">✗</span>
                  Virtual Server Not Found
                </div>
              )}
            </div>
          )}
        </div>

        {/* Advanced Settings */}
        <div className="advanced-section">
          <button
            type="button"
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>{showAdvanced ? '▼' : '▶'}</span>
            Advanced Settings
          </button>
          
          {showAdvanced && (
            <div className="advanced-content">
              <FormField 
                label="SNI Server Name" 
                helpText="Server Name Indication for multi-domain support"
              >
                <input
                  type="text"
                  className="input"
                  placeholder="Auto-detect from primary domain"
                  disabled={disabled}
                />
              </FormField>
              
              <FormField 
                label="Replace Existing Profiles" 
                helpText="Remove existing client-ssl profiles before attaching new one"
              >
                <label className="checkbox-label">
                  <input type="checkbox" disabled={disabled} />
                  <span>Replace existing client-ssl profiles on virtual server</span>
                </label>
              </FormField>
            </div>
          )}
        </div>

        {/* Help Section */}
        <InfoCard type="info" title="BIG-IP Requirements">
          <ul className="requirements-list">
            <li>BIG-IP version 12.1 or later</li>
            <li>Management interface accessible from this server</li>
            <li>Admin credentials configured in environment</li>
            <li>Target partition must exist</li>
            <li>HTTP virtual server for ACME validation (port 80)</li>
          </ul>
        </InfoCard>
      </div>

      <WizardActions
        onPrevious={onPrevious}
        onNext={handleValidation}
        canNext={!!host && !!partition}
        nextLabel="Continue"
      />
    </WizardStep>
  )
}
