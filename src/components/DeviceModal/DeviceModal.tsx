import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Trash2, ChevronLeft } from 'lucide-react';
import './DeviceModal.scss';

export interface AudioDeviceInfo {
  hardware_name: string;
  nickname: string | null;
  threshold_db: number;
}

interface SavedDevice {
  hardware_name: string;
  nickname: string;
  threshold_db: number;
}

interface DeviceModalProps {
  currentDevice: AudioDeviceInfo;
  onClose: () => void;
  onNicknameUpdated: () => void;
}

export default function DeviceModal({ currentDevice, onClose, onNicknameUpdated }: DeviceModalProps) {
  const [view, setView] = useState<'active' | 'saved'>('active');
  const [nicknameInput, setNicknameInput] = useState(currentDevice.nickname || '');
  const [thresholdInputStr, setThresholdInputStr] = useState(
    currentDevice.threshold_db ? Math.abs(currentDevice.threshold_db).toFixed(1) : '17.0'
  );
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleThresholdInputBlur = () => {
    let val = parseFloat(thresholdInputStr);
    if (isNaN(val)) {
      val = currentDevice.threshold_db ? Math.abs(currentDevice.threshold_db) : 17.0;
    } else {
      if (val > 40) val = 40.0;
      if (val < 0) val = 0.0;
    }
    setThresholdInputStr(val.toFixed(1));
  };

  const fetchSavedDevices = async () => {
    try {
      const devices = await invoke<SavedDevice[]>('get_saved_devices');
      setSavedDevices(devices);
    } catch (err) {
      console.error("Failed to fetch saved devices", err);
    }
  };

  useEffect(() => {
    if (view === 'saved') {
      fetchSavedDevices();
    }
  }, [view]);

  const handleSaveNickname = async () => {
    if (!nicknameInput.trim()) return;
    setIsSaving(true);
    try {
      let val = parseFloat(thresholdInputStr);
      if (isNaN(val)) val = 17.0;

      await invoke('set_device_nickname', {
        hardwareName: currentDevice.hardware_name,
        nickname: nicknameInput.trim(),
        thresholdDb: -val
      });
      onNicknameUpdated();
    } catch (err) {
      console.error("Failed to save nickname", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDevice = async (hardwareName: string) => {
    try {
      await invoke('delete_device_nickname', { hardwareName });
      fetchSavedDevices();
      if (hardwareName === currentDevice.hardware_name) {
        onNicknameUpdated();
      }
    } catch (err) {
      console.error("Failed to delete device", err);
    }
  };

  return (
    <div className="device-modal-overlay" onClick={onClose}>
      <div className="device-modal" onClick={e => e.stopPropagation()}>
        {view === 'active' ? (
          <>
            <div className="modal-header">
              <h2 className="modal-title">Connected Device</h2>
              <button className="close-btn" onClick={onClose}><X size={20} /></button>
            </div>
            
            <div className="active-device-info">
              <label>Hardware Name</label>
              <div className="hardware-name">{currentDevice.hardware_name}</div>
              
              <label>Nickname</label>
              <div className="nickname-input-group">
                <input 
                  type="text" 
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="Enter a nickname (e.g. JCally JM12)"
                />
                <button 
                  className="save-btn" 
                  onClick={handleSaveNickname}
                  disabled={isSaving || !nicknameInput.trim()}
                >
                  Save
                </button>
              </div>

              <label>Device Warning Threshold</label>
              <div className="numeric-input-wrapper">
                <span className="prefix">-</span>
                <input
                  type="text"
                  value={thresholdInputStr}
                  onChange={(e) => setThresholdInputStr(e.target.value)}
                  onBlur={handleThresholdInputBlur}
                  className="numeric-input"
                />
                <span className="suffix">dB</span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="view-saved-btn" onClick={() => setView('saved')}>
                View Saved Devices
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-header">
              <button className="back-btn" onClick={() => setView('active')}><ChevronLeft size={20} /></button>
              <h2 className="modal-title">Saved Devices</h2>
              <button className="close-btn" onClick={onClose}><X size={20} /></button>
            </div>
            
            <div className="saved-devices-list">
              {savedDevices.length === 0 ? (
                <div className="empty-state">No saved devices found.</div>
              ) : (
                savedDevices.map((dev) => (
                  <div key={dev.hardware_name} className="saved-device-item">
                    <div className="device-names">
                      <div className="nickname">
                        {dev.nickname}
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginLeft: '8px' }}>
                          Threshold: {dev.threshold_db.toFixed(1)} dB
                        </span>
                      </div>
                      <div className="hardware">{dev.hardware_name}</div>
                    </div>
                    <button className="delete-btn" onClick={() => handleDeleteDevice(dev.hardware_name)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
