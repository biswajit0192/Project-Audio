import { useState, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';
import './Settings.scss';
import { scanAndCacheFolder } from '../../utils/scanner';
import { useAuth } from '../../context/AuthContext';
import profileIcon from '../../assets/Profile-icon.svg';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import AvatarCropModal from '../Account/AvatarCropModal';

export default function Settings() {
  const [hqAudio, setHqAudio] = useState(true);
  const [autoSync, setAutoSync] = useState(false);

  // Account State
  const { isLoggedIn, user, logout, reloadUser } = useAuth();

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

  return (
    <div className="settings-page">

      <div className="settings-list">

        {/* Account & Profile */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Account</h2>
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
                    <img 
                      src={user.avatar || profileIcon} 
                      alt="Avatar" 
                      className="avatar" 
                      style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', objectFit: 'cover', opacity: isUploading ? 0.5 : 1 }} 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = profileIcon;
                      }}
                    />
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
            <h2 className="section-title">Music Library</h2>
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
            <h2 className="section-title">Cloud Storage</h2>
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

        {/* Audio Engine Preferences */}
        <div className="settings-section">
          <div className="section-header">
            <h2 className="section-title">Audio Engine</h2>
          </div>
          <div className="section-content">
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
            <div className="setting-row">
              <div className="setting-label">
                <span className="title">Resampling Quality</span>
                <span className="desc">Sinc Interpolation (Highest)</span>
              </div>
              <div className="setting-action">
                <span className="badge active">Ultra</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
