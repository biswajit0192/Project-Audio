import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';
import './Settings.scss';
import { scanAndCacheFolder } from '../../utils/scanner';
import { useAuth } from '../../context/AuthContext';
import ProfileIcon from '../../assets/Profile-icon.svg?react';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import AvatarCropModal from '../Account/AvatarCropModal';
import ShortcutsSettings from './ShortcutsSettings';

interface SavedDevice {
  hardware_name: string;
  nickname: string;
  threshold_db: number;
}

const DeviceThresholdRow = ({ device, onUpdate }: { device: SavedDevice, onUpdate: () => void }) => {
  const [valStr, setValStr] = useState(Math.abs(device.threshold_db).toFixed(1));

  const handleBlur = async () => {
    let val = parseFloat(valStr);
    if (isNaN(val)) val = Math.abs(device.threshold_db);
    else {
      if (val > 40) val = 40.0;
      if (val < 0) val = 0.0;
    }
    setValStr(val.toFixed(1));
    if (-val !== device.threshold_db) {
      try {
        await invoke('set_device_nickname', {
          hardwareName: device.hardware_name,
          nickname: device.nickname,
          thresholdDb: -val
        });
        onUpdate();
      } catch (err) {
        console.error('Failed to update device threshold', err);
      }
    }
  };

  return (
    <div className="setting-row sub-row" style={{ padding: '8px 0', borderBottom: 'none' }}>
      <div className="setting-label">
        <span className="title" style={{ fontSize: '14px' }}>{device.nickname}</span>
        <span className="desc" style={{ fontSize: '12px' }}>{device.hardware_name}</span>
      </div>
      <div className="setting-action input-action">
        <div className="numeric-input-wrapper">
          <span className="prefix">-</span>
          <input
            type="text"
            value={valStr}
            onChange={(e) => setValStr(e.target.value)}
            onBlur={handleBlur}
            className="numeric-input"
          />
          <span className="suffix">dB</span>
        </div>
      </div>
    </div>
  );
};

export default function Settings() {
  const [hqAudio, setHqAudio] = useState(true);
  const [autoSync, setAutoSync] = useState(false);
  const [fadeDuration, setFadeDuration] = useState(250);

  useEffect(() => {
    invoke<number>('get_fade_duration').then(setFadeDuration).catch(console.error);
  }, []);

  const handleFadeDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setFadeDuration(val);
    invoke('set_fade_duration', { durationMs: val }).catch(console.error);
  };

  const [highVolumeWarning, setHighVolumeWarning] = useState(() => {
    return localStorage.getItem('hertzsonic_high_volume_warning') !== 'false';
  });

  const toggleHighVolumeWarning = () => {
    const newVal = !highVolumeWarning;
    setHighVolumeWarning(newVal);
    localStorage.setItem('hertzsonic_high_volume_warning', newVal ? 'true' : 'false');
  };

  const [volumeProtectionMode, setVolumeProtectionMode] = useState<'global' | 'dynamic'>(() => {
    return (localStorage.getItem('hertzsonic_volume_protection_mode') as 'global' | 'dynamic') || 'global';
  });

  const handleModeChange = (mode: 'global' | 'dynamic') => {
    setVolumeProtectionMode(mode);
    localStorage.setItem('hertzsonic_volume_protection_mode', mode);
  };

  const [highVolumeThresholdDb, setHighVolumeThresholdDb] = useState(() => {
    const saved = localStorage.getItem('hertzsonic_high_volume_threshold');
    return saved ? parseFloat(saved) : -17.0;
  });

  const [thresholdInputStr, setThresholdInputStr] = useState(() => {
    const saved = localStorage.getItem('hertzsonic_high_volume_threshold');
    const numeric = saved ? parseFloat(saved) : -17.0;
    return Math.abs(numeric).toFixed(1);
  });

  const [useWaveformSeekbar, setUseWaveformSeekbar] = useState(() => {
    return localStorage.getItem('hertzsonic_use_waveform') !== 'false';
  });

  const toggleWaveformSeekbar = () => {
    const newVal = !useWaveformSeekbar;
    setUseWaveformSeekbar(newVal);
    localStorage.setItem('hertzsonic_use_waveform', newVal ? 'true' : 'false');
    window.dispatchEvent(new Event('waveform-setting-changed'));
  };

  const handleThresholdInputBlur = () => {
    let val = parseFloat(thresholdInputStr);
    if (isNaN(val)) {
      val = Math.abs(highVolumeThresholdDb);
    } else {
      if (val > 40) val = 40.0;
      if (val < 0) val = 0.0;
    }
    setThresholdInputStr(val.toFixed(1));
    setHighVolumeThresholdDb(-val);
    localStorage.setItem('hertzsonic_high_volume_threshold', (-val).toString());
  };

  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);

  useEffect(() => {
    if (highVolumeWarning && volumeProtectionMode === 'dynamic') {
      invoke<SavedDevice[]>('get_saved_devices').then(devices => {
        setSavedDevices(devices);
      }).catch(console.error);
    }
  }, [highVolumeWarning, volumeProtectionMode]);

  // Account State
  const { isLoggedIn, user, logout, reloadUser } = useAuth();

  const [currentTab, setCurrentTab] = useState<'main' | 'shortcuts'>('main');

  // Library State
  const [libraryPath, setLibraryPath] = useState<string | null>(localStorage.getItem('hertzsonic_library_path'));
  const [isRescanning, setIsRescanning] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanningSystem, setIsScanningSystem] = useState(false);
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate('/auth/login', { state: { from: 'settings' } });
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result?.toString() || null);
      });
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleCropComplete = async (base64Avatar: string) => {
    setImageSrc(null);
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.displayName) return;

    setIsUploading(true);
    try {
      const currentUsername = currentUser.displayName.toLowerCase().trim();

      // Update Firestore document with merge
      await setDoc(doc(db, "usernames", currentUsername), { photoURL: base64Avatar }, { merge: true });

      await reloadUser(); // Refresh to reflect updated user profile locally without window reload
    } catch (err: any) {
      console.error("Failed to upload avatar", err);
      alert(`Failed to upload avatar: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleChangeFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        setLibraryPath(selected);
        localStorage.setItem('hertzsonic_library_path', selected);
      }
    } catch (err) {
      console.error('Failed to open dialog:', err);
    }
  };

  const performScan = async (path: string, isSystemScan: boolean = false) => {
    if (isSystemScan) {
      setIsScanningSystem(true);
    } else {
      setIsRescanning(true);
    }

    try {
      await scanAndCacheFolder(path);

      // Stop loading spinners
      if (isSystemScan) setIsScanningSystem(false);
      else setIsRescanning(false);

      // Notify the dashboard to silently fetch the fresh database
      window.dispatchEvent(new CustomEvent('library-updated'));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Error scanning folder:', error);
      if (isSystemScan) setIsScanningSystem(false);
      else setIsRescanning(false);
    }
  };

  const handleRescan = async () => {
    if (!libraryPath) return;
    await performScan(libraryPath, false);
  };

  const handleScanSystem = async () => {
    // We default to the user's Music directory or let them pick
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        setLibraryPath(selected);
        localStorage.setItem('hertzsonic_library_path', selected);
        await performScan(selected, true);
      }
    } catch (err) {
      console.error('Failed to open dialog:', err);
    }
  };

  const handleHardReload = () => {
    window.location.reload();
  };

  if (currentTab === 'shortcuts') {
    return <ShortcutsSettings onBack={() => setCurrentTab('main')} />;
  }

  return (
    <div className="settings-page">

      <div className="settings-list">

        {/* Account & Profile */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-heading">Account</h2>
          </div>
          <div className="section-content">
            {!isLoggedIn || !user ? (
              <div className="setting-row">
                <div className="setting-label">
                  <span className="title">Sign in to sync your data</span>
                  <span className="desc">Access your playlists and preferences across all your devices.</span>
                </div>
                <div className="setting-action">
                  <button className="secondary-btn" onClick={handleLogin}>Log In / Register</button>
                </div>
              </div>
            ) : (
              <div className="setting-row">
                <div className="setting-label" style={{ flexDirection: 'row', alignItems: 'center', gap: '16px' }}>
                  <div
                    className="avatar-wrapper"
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                    style={{ position: 'relative', cursor: 'pointer' }}
                    title="Change Avatar"
                  >
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt="Avatar"
                        className="avatar"
                        style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', objectFit: 'cover', opacity: isUploading ? 0.5 : 1 }}
                      />
                    ) : (
                      <ProfileIcon
                        className="avatar"
                        style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', opacity: isUploading ? 0.5 : 1 }}
                      />
                    )}
                    {isUploading && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '10px' }}>...</span>
                      </div>
                    )}
                  </div>
                  <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={onFileChange} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="title">{user.name}</span>
                    <span className="desc">{user.email}</span>
                  </div>
                </div>
                <div className="setting-action">
                  <button className="secondary-btn" onClick={() => window.dispatchEvent(new CustomEvent('open-manage-account'))}>Manage Account</button>
                  <button className="danger-btn" onClick={() => logout()}>Sign Out</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {imageSrc && (
          <AvatarCropModal
            imageSrc={imageSrc}
            onCropComplete={handleCropComplete}
            onCancel={() => setImageSrc(null)}
          />
        )}

        {/* Music Library & Storage */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-heading">Music Library</h2>
          </div>
          <div className="section-content">
            <div className="setting-row">
              <div className="setting-label">
                <span className="title">Local Library Path</span>
                <span className="desc" title={libraryPath || 'No folder selected'}>
                  {libraryPath ? (libraryPath.length > 50 ? libraryPath.substring(0, 50) + '...' : libraryPath) : 'Not configured'}
                </span>
              </div>
              <div className="setting-action">
                <button className="secondary-btn" onClick={handleChangeFolder}>Change Folder</button>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <span className="title">Library Sync</span>
                <span className="desc">Scan folders for new audio files</span>
              </div>
              <div className="setting-action flex-actions">
                <button
                  className={`secondary-btn ${isRescanning ? 'loading' : ''}`}
                  onClick={handleRescan}
                  disabled={isRescanning || isScanningSystem || !libraryPath}
                >
                  {isRescanning ? 'Scanning...' : 'Rescan Library'}
                </button>
                <button
                  className={`secondary-btn ${isScanningSystem ? 'loading' : ''}`}
                  onClick={handleScanSystem}
                  disabled={isScanningSystem || isRescanning}
                >
                  {isScanningSystem ? 'Scanning...' : 'Scan Whole System'}
                </button>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">
                <span className="title">App Reload</span>
                <span className="desc">Perform a full hard-reload of the UI</span>
              </div>
              <div className="setting-action">
                <button
                  className="secondary-btn"
                  onClick={handleHardReload}
                >
                  Hard Reload UI
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Cloud & External Storage */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-heading">Cloud Storage</h2>
          </div>
          <div className="section-content">
            <div className="setting-row">
              <div className="setting-label">
                <span className="title">Cloud Storage Connection</span>
                <span className="desc">Google Drive, WebDAV, Nextcloud</span>
              </div>
              <div className="setting-action flex-actions">
                <span className="badge inactive">Coming Soon</span>
                <button className="secondary-btn" disabled style={{ opacity: 0.5 }}>Connect Service</button>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">
                <span className="title">Auto-Sync Library</span>
                <span className="desc">Sync local files with cloud storage</span>
              </div>
              <div className="setting-action">
                <div
                  className={`toggle ${autoSync ? 'active' : ''}`}
                  onClick={() => setAutoSync(!autoSync)}
                >
                  <div className="knob"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-heading">Appearance</h2>
          </div>
          <div className="section-content">
            <div className="setting-row">
              <div className="setting-label">
                <span className="title">Waveform Seekbar</span>
                <span className="desc">Use the dynamic waveform instead of the minimalist progress bar</span>
              </div>
              <div className="setting-action">
                <div
                  className={`toggle ${useWaveformSeekbar ? 'active' : ''}`}
                  onClick={toggleWaveformSeekbar}
                >
                  <div className="knob"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-heading">Keyboard Shortcuts</h2>
          </div>
          <div className="section-content">
            <div className="setting-row">
              <div className="setting-label">
                <span className="title">Keyboard Shortcuts</span>
                <span className="desc">Customize hotkeys for playback, seeking, and volume control.</span>
              </div>
              <div className="setting-action">
                <button 
                  className="secondary-btn" 
                  onClick={() => setCurrentTab('shortcuts')}
                >
                  Configure Shortcuts &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Engine Preferences */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-heading">Audio Engine</h2>
          </div>
          <div className="section-content">
            <div className="setting-row">
              <div className="setting-label">
                <span className="title">Play / Pause Fade Duration</span>
                <span className="desc">Smoothly fades volume in and out when pausing and resuming to prevent abrupt audio cuts and clicks.</span>
              </div>
              <div className="setting-action" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-prime)', minWidth: '40px', textAlign: 'right' }}>
                  {fadeDuration === 0 ? 'Off' : `${fadeDuration} ms`}
                </span>
                <input 
                  type="range" 
                  min="0" 
                  max="1000" 
                  step="25" 
                  value={fadeDuration} 
                  onChange={handleFadeDurationChange}
                  className="settings-range-slider"
                  style={{ 
                    '--track-bg': `linear-gradient(to right, #F92E16 ${(fadeDuration / 1000) * 100}%, #2b2b2b ${(fadeDuration / 1000) * 100}%)`
                  } as React.CSSProperties}
                />
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">
                <span className="title">Exclusive Mode (WASAPI)</span>
                <span className="desc">Bypass OS mixer for bit-perfect audio</span>
              </div>
              <div className="setting-action">
                <div
                  className={`toggle ${hqAudio ? 'active' : ''}`}
                  onClick={() => setHqAudio(!hqAudio)}
                >
                  <div className="knob"></div>
                </div>
              </div>
            </div>
            <div className="setting-row" style={highVolumeWarning ? { borderBottom: 'none' } : undefined}>
              <div className="setting-label">
                <span className="title">High Volume Warning</span>
                <span className="desc">Show a warning dialog before playback if the current volume level exceeds the threshold</span>
              </div>
              <div className="setting-action">
                <div
                  className={`toggle ${highVolumeWarning ? 'active' : ''}`}
                  onClick={toggleHighVolumeWarning}
                >
                  <div className="knob"></div>
                </div>
              </div>
            </div>
            {highVolumeWarning && (
              <div className="sub-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: '16px', paddingLeft: '16px', borderLeft: '1px solid #3B3B3B', paddingBottom: '16px', marginTop: '8px' }}>
                <div className="setting-row" style={{ borderBottom: 'none', paddingTop: 0, paddingBottom: '8px' }}>
                  <div className="setting-label">
                    <span className="title">Protection Mode</span>
                    <span className="desc">Choose how the warning threshold is evaluated</span>
                  </div>
                  <div className="setting-action">
                    <select 
                      value={volumeProtectionMode} 
                      onChange={(e) => handleModeChange(e.target.value as 'global' | 'dynamic')}
                      className="styled-select"
                    >
                      <option value="global">Global Adjustment</option>
                      <option value="dynamic">Dynamic Adjustment</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginLeft: '16px', paddingLeft: '16px', borderLeft: '1px solid #3B3B3B', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {volumeProtectionMode === 'global' ? (
                    <div className="setting-row" style={{ borderBottom: 'none', padding: '8px 0' }}>
                      <div className="setting-label">
                        <span className="title">Warning Threshold</span>
                        <span className="desc">Adjust the volume level (-40.0 to 0.0) that triggers the warning</span>
                      </div>
                      <div className="setting-action input-action">
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
                    </div>
                  ) : (
                    <div className="dynamic-devices-list" style={{ display: 'flex', flexDirection: 'column' }}>
                      <div className="setting-row sub-row" style={{ padding: '8px 0', borderBottom: 'none' }}>
                        <div className="setting-label">
                          <span className="title" style={{ fontSize: '14px' }}>Default / Laptop Jack / Bluetooth</span>
                          <span className="desc" style={{ fontSize: '12px', maxWidth: '450px' }}>Fallback limit used when no external USB DAC is connected</span>
                        </div>
                        <div className="setting-action input-action">
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
                      </div>

                      {savedDevices.map(dev => (
                        <DeviceThresholdRow 
                          key={dev.hardware_name} 
                          device={dev} 
                          onUpdate={() => {
                            invoke<SavedDevice[]>('get_saved_devices').then(setSavedDevices).catch(console.error);
                          }} 
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
