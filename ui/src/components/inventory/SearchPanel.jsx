import React, { useState, useEffect } from 'react'
import './SearchPanel.css'

export default function SearchPanel({
  searchQuery,
  onSearchChange,
  filters,
  onFilterChange,
  onSearch,
  stats
}) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [availableProviders, setAvailableProviders] = useState([
    'lets-encrypt',
    'google',
    'zerossl',
    'sectigo',
    'digicert'
  ])
  const [availableTags, setAvailableTags] = useState([
    'production',
    'staging',
    'development',
    'test',
    'critical'
  ])
  const [availableBigIPs, setAvailableBigIPs] = useState([
    '192.168.3.55',
    '192.168.3.56',
    '192.168.3.57'
  ])

  const handleFilterChange = (filterName, value) => {
    onFilterChange({
      ...filters,
      [filterName]: value
    })
  }

  const handleTagToggle = (tag) => {
    const currentTags = filters.tags || []
    if (currentTags.includes(tag)) {
      handleFilterChange('tags', currentTags.filter(t => t !== tag))
    } else {
      handleFilterChange('tags', [...currentTags, tag])
    }
  }

  const clearFilters = () => {
    onFilterChange({
      status: 'all',
      provider: 'all',
      tags: [],
      bigipHost: 'all',
      expirationRange: 'all'
    })
    onSearchChange('')
  }

  const hasActiveFilters = () => {
    return searchQuery || 
           filters.status !== 'all' || 
           filters.provider !== 'all' || 
           filters.tags.length > 0 ||
           filters.bigipHost !== 'all' ||
           filters.expirationRange !== 'all'
  }

  return (
    <div className="search-panel">
      {/* Main Search Bar */}
      <div className="search-bar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by domain, certificate ID, or provider..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onSearch()}
          />
          {searchQuery && (
            <button
              className="clear-search"
              onClick={() => onSearchChange('')}
            >
              ✕
            </button>
          )}
        </div>
        <button 
          className="btn btn-primary search-btn"
          onClick={onSearch}
        >
          Search
        </button>
      </div>

      {/* Quick Filters */}
      <div className="quick-filters">
        <div className="filter-group">
          <label className="filter-label">Status:</label>
          <div className="filter-buttons">
            <button
              className={`filter-btn ${filters.status === 'all' ? 'active' : ''}`}
              onClick={() => handleFilterChange('status', 'all')}
            >
              All
              {stats.total > 0 && <span className="count">{stats.total}</span>}
            </button>
            <button
              className={`filter-btn status-active ${filters.status === 'active' ? 'active' : ''}`}
              onClick={() => handleFilterChange('status', 'active')}
            >
              Active
              {stats.active > 0 && <span className="count">{stats.active}</span>}
            </button>
            <button
              className={`filter-btn status-warning ${filters.status === 'expiring' ? 'active' : ''}`}
              onClick={() => handleFilterChange('status', 'expiring')}
            >
              Expiring Soon
              {stats.expiringSoon > 0 && <span className="count">{stats.expiringSoon}</span>}
            </button>
            <button
              className={`filter-btn status-expired ${filters.status === 'expired' ? 'active' : ''}`}
              onClick={() => handleFilterChange('status', 'expired')}
            >
              Expired
              {stats.expired > 0 && <span className="count">{stats.expired}</span>}
            </button>
            <button
              className={`filter-btn status-revoked ${filters.status === 'revoked' ? 'active' : ''}`}
              onClick={() => handleFilterChange('status', 'revoked')}
            >
              Revoked
              {stats.revoked > 0 && <span className="count">{stats.revoked}</span>}
            </button>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">Expiration:</label>
          <select
            className="filter-select"
            value={filters.expirationRange}
            onChange={(e) => handleFilterChange('expirationRange', e.target.value)}
          >
            <option value="all">All dates</option>
            <option value="expired">Already expired</option>
            <option value="30days">Within 30 days</option>
            <option value="60days">Within 60 days</option>
            <option value="90days">Within 90 days</option>
          </select>
        </div>

        <div className="filter-actions">
          <button
            className="btn-link"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          >
            <span>{showAdvancedFilters ? '▼' : '▶'}</span>
            Advanced Filters
          </button>
          {hasActiveFilters() && (
            <button
              className="btn-link clear-all"
              onClick={clearFilters}
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <div className="advanced-filters">
          <div className="filter-row">
            <div className="filter-group">
              <label className="filter-label">Provider:</label>
              <select
                className="filter-select"
                value={filters.provider}
                onChange={(e) => handleFilterChange('provider', e.target.value)}
              >
                <option value="all">All providers</option>
                {availableProviders.map(provider => (
                  <option key={provider} value={provider}>
                    {provider.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">BIG-IP Device:</label>
              <select
                className="filter-select"
                value={filters.bigipHost}
                onChange={(e) => handleFilterChange('bigipHost', e.target.value)}
              >
                <option value="all">All devices</option>
                {availableBigIPs.map(host => (
                  <option key={host} value={host}>{host}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">Tags:</label>
            <div className="tag-filters">
              {availableTags.map(tag => (
                <button
                  key={tag}
                  className={`tag-filter-btn ${filters.tags.includes(tag) ? 'active' : ''}`}
                  onClick={() => handleTagToggle(tag)}
                >
                  {filters.tags.includes(tag) && <span>✓</span>}
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters() && (
        <div className="active-filters">
          <span className="active-filters-label">Active filters:</span>
          <div className="active-filter-tags">
            {searchQuery && (
              <span className="filter-tag">
                Search: "{searchQuery}"
                <button onClick={() => onSearchChange('')}>✕</button>
              </span>
            )}
            {filters.status !== 'all' && (
              <span className="filter-tag">
                Status: {filters.status}
                <button onClick={() => handleFilterChange('status', 'all')}>✕</button>
              </span>
            )}
            {filters.provider !== 'all' && (
              <span className="filter-tag">
                Provider: {filters.provider}
                <button onClick={() => handleFilterChange('provider', 'all')}>✕</button>
              </span>
            )}
            {filters.bigipHost !== 'all' && (
              <span className="filter-tag">
                BIG-IP: {filters.bigipHost}
                <button onClick={() => handleFilterChange('bigipHost', 'all')}>✕</button>
              </span>
            )}
            {filters.expirationRange !== 'all' && (
              <span className="filter-tag">
                Expiration: {filters.expirationRange}
                <button onClick={() => handleFilterChange('expirationRange', 'all')}>✕</button>
              </span>
            )}
            {filters.tags.map(tag => (
              <span key={tag} className="filter-tag">
                Tag: {tag}
                <button onClick={() => handleTagToggle(tag)}>✕</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
