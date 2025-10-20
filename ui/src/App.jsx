import React, { useState, useEffect } from 'react'
import { api } from './api.js'
import CertificateWizard from './components/wizard/CertificateWizard'
import './styles/App.css'
import CertificateInventory from './components/inventory/CertificateInventory'

export default function App() {
  const [status, setStatus] = useState('checking')
  const [err, setErr] = useState('')
  const [activeSection, setActiveSection] = useState('issue')
  const [mode, setMode] = useState('issue')
  
  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('configuration')

  useEffect(() => {
    api.ready()
      .then(() => setStatus('ok'))
      .catch(e => {
        setErr(e.message)
        setStatus('err')
      })
  }, [])

  // Navigation items for sidebar
  const navSections = [
    {
      title: 'Certificate Management',
      items: [
        { id: 'issue', label: 'Issue Certificate', icon: '📜' },
        { id: 'renew', label: 'Renew Certificate', icon: '🔄' },
        { id: 'inventory', label: 'Certificate Inventory', icon: '📋' }
      ]
    },
    {
      title: 'Configuration',
      items: [
        { id: 'providers', label: 'Providers', icon: '🔧' },
        { id: 'vault', label: 'Vault Secrets', icon: '🗝️' },
        { id: 'templates', label: 'Templates', icon: '📝' }
      ]
    },
    {
      title: 'Infrastructure',
      items: [
        { id: 'bigip', label: 'BIG-IP Devices', icon: '🖥️' },
        { id: 'monitoring', label: 'Monitoring', icon: '📊' }
      ]
    }
  ]

  const handleNavClick = (itemId) => {
    setActiveSection(itemId)
    if (itemId === 'issue' || itemId === 'renew') {
      setMode(itemId)
    }
  }

  const getBreadcrumb = () => {
    const sectionMap = {
      'issue': 'Certificate Management > Issue Certificate',
      'renew': 'Certificate Management > Renew Certificate',
      'inventory': 'Certificate Management > Certificate Inventory',
      'providers': 'Configuration > Providers',
      'vault': 'Configuration > Vault Secrets',
      'templates': 'Configuration > Templates',
      'bigip': 'Infrastructure > BIG-IP Devices',
      'monitoring': 'Infrastructure > Monitoring'
    }
    return sectionMap[activeSection] || 'Dashboard'
  }

  const getPageTitle = () => {
    const titleMap = {
      'issue': 'Issue New Certificate',
      'renew': 'Renew Certificate',
      'inventory': 'Certificate Inventory',
      'providers': 'ACME Providers',
      'vault': 'Vault Secret Management',
      'templates': 'Certificate Templates',
      'bigip': 'BIG-IP Device Management',
      'monitoring': 'System Monitoring'
    }
    return titleMap[activeSection] || 'Dashboard'
  }

  const getPageSubtitle = () => {
    const subtitleMap = {
      'issue': 'Request and deploy TLS certificates using ACME protocol',
      'renew': 'Renew existing certificates and redeploy to BIG-IP',
      'inventory': 'View and manage all certificates',
      'providers': 'Configure ACME providers and authentication',
      'vault': 'Manage secrets and credentials in Vault',
      'templates': 'Create reusable certificate configurations',
      'bigip': 'Manage BIG-IP devices and deployments',
      'monitoring': 'Monitor certificate status and expiration'
    }
    return subtitleMap[activeSection] || ''
  }

  // Dynamic content rendering based on active section
const renderContent = () => {
  // For issue and renew sections, render the Certificate Wizard
  if (activeSection === 'issue' || activeSection === 'renew') {
    return <CertificateWizard mode={activeSection} />
  }
  
  // For inventory section, render the Certificate Inventory
  if (activeSection === 'inventory') {
    return <CertificateInventory />
  }
  
  // For other sections, show placeholder
  return (
    <div className="card">
      <div className="card-title">{getPageTitle()}</div>
      <p>This section is under development.</p>
    </div>
  )
}

  return (
    <div className="app">
      {/* Top Navigation */}
      <div className="top-nav">
        <div className="logo">
          <div className="logo-icon">A</div>
          <span>ACME Certificate Manager</span>
        </div>
        <div className="user-menu">
          <button className="support-btn">Support</button>
          <div className="user-avatar">
            <span>U</span>
          </div>
        </div>
      </div>

      <div className="layout">
        {/* Sidebar */}
        <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {navSections.map((section, idx) => (
            <div key={idx} className="nav-section">
              <div className="nav-title">{section.title}</div>
              {section.items.map(item => (
                <div
                  key={item.id}
                  className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                  onClick={() => handleNavClick(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="main-content">
          {/* Breadcrumb */}
          <div className="breadcrumb">
            <span>Home</span>
            <span className="separator">›</span>
            <span className="current">{getBreadcrumb()}</span>
          </div>

          {/* Page Header */}
          <div className="page-header">
            <div className="header-content">
              <div className="page-title">{getPageTitle()}</div>
              <div className="page-subtitle">{getPageSubtitle()}</div>
            </div>

            {/* Tabs (only show for certain sections) */}
            {(activeSection === 'issue' || activeSection === 'renew') && (
              <div className="tabs">
                <div 
                  className={`tab ${activeTab === 'configuration' ? 'active' : ''}`}
                  onClick={() => setActiveTab('configuration')}
                >
                  Configuration
                </div>
                <div 
                  className={`tab ${activeTab === 'review' ? 'active' : ''}`}
                  onClick={() => setActiveTab('review')}
                >
                  Review
                </div>
                <div 
                  className={`tab ${activeTab === 'history' ? 'active' : ''}`}
                  onClick={() => setActiveTab('history')}
                >
                  History
                </div>
              </div>
            )}
          </div>

          {/* Error Display */}
          {err && (
            <div className="alert alert-error">
              <span className="alert-icon">⚠️</span>
              <span>{err}</span>
            </div>
          )}

          {/* Status Display */}
          {status === 'checking' && (
            <div className="card">
              <div className="loading">
                <div className="spinner"></div>
                <span>Checking system status...</span>
              </div>
            </div>
          )}

          {/* Main Content Area - This is where the wizard appears */}
          {status === 'ok' && renderContent()}
        </div>
      </div>
    </div>
  )
}
