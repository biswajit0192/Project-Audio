import { useState, useEffect } from 'react';
import { ShortcutConfig, ShortcutAction, defaultShortcuts, actionLabels } from '../../types/shortcuts';

interface ShortcutsSettingsProps {
  onBack: () => void;
}

export default function ShortcutsSettings({ onBack }: ShortcutsSettingsProps) {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(() => {
    const saved = localStorage.getItem('hertzsonic_shortcuts');
    return saved ? JSON.parse(saved) : defaultShortcuts;
  });
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null);

  useEffect(() => {
    if (!recordingAction) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape') {
        setRecordingAction(null);
        return;
      }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      const newConfig: ShortcutConfig = {
        action: recordingAction,
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey
      };
      
      const newShortcuts = shortcuts.filter(s => s.action !== recordingAction);
      newShortcuts.push(newConfig);
      setShortcuts(newShortcuts);
      localStorage.setItem('hertzsonic_shortcuts', JSON.stringify(newShortcuts));
      window.dispatchEvent(new CustomEvent('shortcuts-updated'));
      setRecordingAction(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recordingAction, shortcuts]);

  const handleResetShortcuts = () => {
    setShortcuts(defaultShortcuts);
    localStorage.setItem('hertzsonic_shortcuts', JSON.stringify(defaultShortcuts));
    window.dispatchEvent(new CustomEvent('shortcuts-updated'));
  };

  const formatKeyConfig = (s?: ShortcutConfig) => {
    if (!s) return 'Not bound';
    const parts = [];
    if (s.ctrlKey) parts.push('Ctrl');
    if (s.altKey) parts.push('Alt');
    if (s.shiftKey) parts.push('Shift');
    let keyLabel = s.key;
    if (keyLabel === ' ') keyLabel = 'Space';
    if (keyLabel === 'ArrowRight') keyLabel = 'Right Arrow';
    if (keyLabel === 'ArrowLeft') keyLabel = 'Left Arrow';
    if (keyLabel === 'ArrowUp') keyLabel = 'Up Arrow';
    if (keyLabel === 'ArrowDown') keyLabel = 'Down Arrow';
    parts.push(keyLabel.length === 1 ? keyLabel.toUpperCase() : keyLabel);
    return parts.join(' + ');
  };

  return (
    <div className="shortcuts-settings-view settings-page" style={{ animation: 'fadeIn 0.3s' }}>
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button 
          className="back-nav-btn" 
          onClick={onBack}
        >
          <span>&larr;</span> Back
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="secondary-btn" onClick={handleResetShortcuts}>
            Reset Defaults
          </button>
          <button className="primary-btn" onClick={onBack} style={{ padding: '8px 20px', borderRadius: '20px', border: 'none', background: '#fff', color: '#000', fontWeight: 600 }}>
            Done
          </button>
        </div>
      </div>
      
      <div className="settings-list">
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Configure Hotkeys</h2>
            <p className="desc" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginLeft: '16px', margin: 0 }}>
              Click remap to start recording your custom shortcut.
            </p>
          </div>
          <div className="section-content">
            {(Object.keys(actionLabels) as ShortcutAction[]).map(action => {
              const currentConfig = shortcuts.find(s => s.action === action);
              const isRecording = recordingAction === action;
              return (
                <div className="setting-row" key={action}>
                  <div className="setting-label">
                    <span className="title">{actionLabels[action]}</span>
                  </div>
                  <div className="setting-action flex-actions">
                    <span 
                      className={`badge ${isRecording ? 'active' : ''}`} 
                      style={{ 
                        fontFamily: 'monospace', 
                        background: isRecording ? 'rgba(229, 57, 53, 0.15)' : 'rgba(255, 255, 255, 0.1)',
                        color: isRecording ? '#ff5252' : 'rgba(255, 255, 255, 0.7)',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '12px'
                      }}
                    >
                      {isRecording ? 'Listening (Press Esc to cancel)...' : formatKeyConfig(currentConfig)}
                    </span>
                    <button 
                      className="secondary-btn"
                      onClick={() => setRecordingAction(isRecording ? null : action)}
                    >
                      {isRecording ? 'Cancel' : 'Remap'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
