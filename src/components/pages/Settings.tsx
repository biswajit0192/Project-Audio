import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Track, BackendTrackMetadata } from '../../types';
import './Settings.scss';

export default function Settings() {
  const [hqAudio, setHqAudio] = useState(true);
  const [autoSync, setAutoSync] = useState(false);

  // Account State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user] = useState({ name: 'Biswajit', email: 'biswajit@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Biswajit' });

  // Library State
  const [libraryPath, setLibraryPath] = useState<string | null>(localStorage.getItem('hertzsonic_library_path'));
  const [isRescanning, setIsRescanning] = useState(false);
  const [isScanningSystem, setIsScanningSystem] = useState(false);
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate('/auth/login', { state: { from: 'settings' } });
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
      const rawPaths: string[] = await invoke('scan_for_music', { folderPath: path });
      const tracks: Track[] = [];

      for (let i = 0; i < rawPaths.length; i++) {
        const filePath = rawPaths[i];
        const fileName = filePath.split('\\').pop()?.split('/').pop() || 'Unknown';
        
        try {
          const meta: BackendTrackMetadata = await invoke('get_track_metadata', { filePath });
          
          try {
            await invoke('save_track_to_cache', { track: meta });
          } catch (dbErr) {
            console.error('DB save error:', dbErr);
          }

          tracks.push({
            id: i,
            path: filePath,
            fileName,
            title: meta.title || fileName,
            artist: meta.artist || 'Unknown Artist',
            album: meta.album || 'Unknown Album',
            durationSecs: meta.duration,
            coverArt: meta.cover_art,
            sampleRate: meta.sample_rate,
            bitDepth: meta.bit_depth,
            bitrate: meta.bitrate
          });
        } catch (e) {
          console.error(`Failed to read metadata for ${filePath}:`, e);
          const fallbackMeta: BackendTrackMetadata = {
            file_path: filePath,
            title: fileName,
            artist: null,
            album: null,
            duration: 0,
            cover_art: null,
            sample_rate: null,
            bit_depth: null,
            bitrate: null
          };
          
          try {
            await invoke('save_track_to_cache', { track: fallbackMeta });
          } catch (dbErr) {
            console.error('DB save error:', dbErr);
          }

          tracks.push({
            id: i,
            path: filePath,
            fileName,
            title: fileName,
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            durationSecs: 0,
            coverArt: null,
            sampleRate: null,
            bitDepth: null,
            bitrate: null
          });
        }
      }
      
      // Stop loading spinners
      if (isSystemScan) setIsScanningSystem(false);
      else setIsRescanning(false);

      // Navigate to dashboard with the scanned track objects to update the library, using replace to avoid pushing history
      navigate('/dashboard', { state: { musicFiles: tracks }, replace: true });
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

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      
      <div className="settings-list">
        
        {/* Account & Profile */}
        <div className="settings-section">
          <div className="section-header">
            <h2>Account</h2>
          </div>
          <div className="section-content">
            {!isLoggedIn ? (
              <div className="login-callout">
                <div className="callout-text">
                  <span className="title">Sign in to sync your data</span>
                  <span className="desc">Access your playlists and preferences across all your devices.</span>
                </div>
                <button className="primary-btn" onClick={handleLogin}>Log In / Register</button>
              </div>
            ) : (
              <div className="profile-row">
                <div className="profile-info">
                  <img src={user.avatar} alt="Avatar" className="avatar" />
                  <div className="user-details">
                    <span className="name">{user.name}</span>
                    <span className="email">{user.email}</span>
                  </div>
                </div>
                <div className="profile-actions">
                  <button className="secondary-btn">Manage Account</button>
                  <button className="danger-btn" onClick={() => setIsLoggedIn(false)}>Sign Out</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Music Library & Storage */}
        <div className="settings-section">
          <div className="section-header">
            <h2>Music Library</h2>
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
          </div>
        </div>

        {/* Cloud & External Storage */}
        <div className="settings-section">
          <div className="section-header">
            <h2>Cloud Storage</h2>
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
            <h2>Audio Engine</h2>
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
