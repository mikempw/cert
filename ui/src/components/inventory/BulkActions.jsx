import React, { useState } from 'react';
import './BulkActions.css';

const BulkActions = ({ selectedCount, onBulkAction, onClearSelection }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  if (selectedCount === 0) return null;

  const handleAction = (action) => {
    if (action === 'revoke' || action === 'delete') {
      setPendingAction(action);
      setShowConfirm(true);
    } else {
      onBulkAction(action);
    }
  };

  const confirmAction = () => {
    if (pendingAction) {
      onBulkAction(pendingAction);
      setShowConfirm(false);
      setPendingAction(null);
    }
  };

  const cancelAction = () => {
    setShowConfirm(false);
    setPendingAction(null);
  };

  return (
    <>
      <div className="bulk-actions-bar">
        <div className="bulk-selection-info">
          <span className="selection-count">{selectedCount} certificate{selectedCount > 1 ? 's' : ''} selected</span>
          <button className="clear-selection" onClick={onClearSelection}>
            Clear selection
          </button>
        </div>

        <div className="bulk-actions-buttons">
          <button 
            className="bulk-action-btn"
            onClick={() => handleAction('export')}
            title="Export selected certificates"
          >
            <span className="action-icon">📤</span>
            Export
          </button>

          <button 
            className="bulk-action-btn"
            onClick={() => handleAction('renew')}
            title="Renew selected certificates"
          >
            <span className="action-icon">🔄</span>
            Renew
          </button>

          <button 
            className="bulk-action-btn"
            onClick={() => handleAction('redeploy')}
            title="Redeploy selected certificates"
          >
            <span className="action-icon">🚀</span>
            Redeploy
          </button>

          <button 
            className="bulk-action-btn"
            onClick={() => handleAction('tag')}
            title="Add tags to selected"
          >
            <span className="action-icon">🏷️</span>
            Tag
          </button>

          <div className="bulk-actions-separator"></div>

          <button 
            className="bulk-action-btn danger"
            onClick={() => handleAction('revoke')}
            title="Revoke selected certificates"
          >
            <span className="action-icon">❌</span>
            Revoke
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <>
          <div className="confirm-backdrop" onClick={cancelAction} />
          <div className="confirm-dialog">
            <div className="confirm-header">
              <span className="confirm-icon">⚠️</span>
              <h3>Confirm Bulk Action</h3>
            </div>
            <div className="confirm-content">
              <p>
                Are you sure you want to <strong>{pendingAction}</strong> {selectedCount} certificate{selectedCount > 1 ? 's' : ''}?
              </p>
              {pendingAction === 'revoke' && (
                <div className="warning-box">
                  <p>⚠️ <strong>Warning:</strong> Revoking certificates is permanent and cannot be undone.</p>
                  <p>This will immediately invalidate the selected certificates.</p>
                </div>
              )}
            </div>
            <div className="confirm-actions">
              <button className="confirm-btn cancel" onClick={cancelAction}>
                Cancel
              </button>
              <button 
                className={`confirm-btn ${pendingAction === 'revoke' ? 'danger' : 'primary'}`}
                onClick={confirmAction}
              >
                {pendingAction === 'revoke' ? 'Yes, Revoke' : 'Confirm'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default BulkActions;
