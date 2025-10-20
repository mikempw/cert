import React, { useState } from 'react';
import './ExportModal.css';

const ExportModal = ({ isOpen, certificates, onClose, onExport }) => {
  const [exportFormat, setExportFormat] = useState('json');
  const [includeOptions, setIncludeOptions] = useState({
    privateKeys: false,
    deploymentInfo: true,
    tags: true,
    history: false
  });

  if (!isOpen) return null;

  const handleExport = () => {
    onExport(exportFormat, includeOptions);
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="export-modal">
        <div className="modal-header">
          <h3>Export Certificates</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-content">
          <div className="export-section">
            <h4>Export Format</h4>
            <div className="format-options">
              <label className="format-option">
                <input
                  type="radio"
                  value="json"
                  checked={exportFormat === 'json'}
                  onChange={(e) => setExportFormat(e.target.value)}
                />
                <span>JSON</span>
              </label>
              <label className="format-option">
                <input
                  type="radio"
                  value="csv"
                  checked={exportFormat === 'csv'}
                  onChange={(e) => setExportFormat(e.target.value)}
                />
                <span>CSV</span>
              </label>
              <label className="format-option">
                <input
                  type="radio"
                  value="yaml"
                  checked={exportFormat === 'yaml'}
                  onChange={(e) => setExportFormat(e.target.value)}
                />
                <span>YAML</span>
              </label>
            </div>
          </div>

          <div className="export-section">
            <h4>Include in Export</h4>
            <div className="include-options">
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={includeOptions.deploymentInfo}
                  onChange={(e) => setIncludeOptions({
                    ...includeOptions,
                    deploymentInfo: e.target.checked
                  })}
                />
                <span>Deployment Information</span>
              </label>
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={includeOptions.tags}
                  onChange={(e) => setIncludeOptions({
                    ...includeOptions,
                    tags: e.target.checked
                  })}
                />
                <span>Tags</span>
              </label>
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={includeOptions.history}
                  onChange={(e) => setIncludeOptions({
                    ...includeOptions,
                    history: e.target.checked
                  })}
                />
                <span>Certificate History</span>
              </label>
              <label className="checkbox-option disabled">
                <input
                  type="checkbox"
                  checked={includeOptions.privateKeys}
                  disabled
                />
                <span>Private Keys (Requires Authorization)</span>
              </label>
            </div>
          </div>

          <div className="export-summary">
            <p>Exporting <strong>{certificates.length}</strong> certificate(s)</p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleExport}>
            Export
          </button>
        </div>
      </div>
    </>
  );
};

export default ExportModal;
