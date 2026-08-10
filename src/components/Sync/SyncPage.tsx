import { useState } from 'react';
import { Search, FolderOpen, Cloud } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { Track, BackendTrackMetadata } from '../../types';
import './SyncPage.scss';

export default function SyncPage() {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(false);
  const [scanTotal, setScanTotal] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);

  const handleSelectFolder = async () => {
    if (isScanning) return;
    try {
      const selected = await open({
        multiple: false,
        directory: true,
      });

      if (selected && typeof selected === 'string') {
        setIsScanning(true);
        setScanProgress(0);
        // Invoke our custom Rust command to scan the folder recursively
        const rawPaths: string[] = await invoke('scan_for_music', { folderPath: selected });
        setScanTotal(rawPaths.length);
        const tracks: Track[] = [];

        for (let i = 0; i < rawPaths.length; i++) {
          setScanProgress(i + 1);
          const path = rawPaths[i];
          const fileName = path.split('\\').pop()?.split('/').pop() || 'Unknown';
          
          try {
            const meta: BackendTrackMetadata = await invoke('get_track_metadata', { filePath: path });
            
            try {
              await invoke('save_track_to_cache', { track: meta });
            } catch (dbErr) {
              console.error('DB save error:', dbErr);
            }

            tracks.push({
              id: path,
              path,
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
            console.error(`Failed to read metadata for ${path}:`, e);
            const fallbackMeta: BackendTrackMetadata = {
              file_path: path,
              title: fileName,
              artist: null,
              album: null,
              duration: 0,
              cover_art: null,
              sample_rate: null,
              bit_depth: null,
              bitrate: null,
              date_added: null
            };
            
            try {
              await invoke('save_track_to_cache', { track: fallbackMeta });
            } catch (dbErr) {
              console.error('DB save error:', dbErr);
            }

            // Fallback
            tracks.push({
              id: path,
              path,
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

        // Navigate to dashboard with the scanned track objects first
        localStorage.setItem('hertzsonic_setup_complete', 'true');
        navigate('/dashboard', { state: { musicFiles: tracks } });
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      setIsScanning(false);
    }
  };
  return (
    <div className="sync-container">
      <div className="sync-header">
        <h1 className="sync-title">Where is your music?</h1>
        <p className="sync-subtitle">Let's get your library set up and ready to play.</p>
      </div>

      {isScanning ? (
        <div className="sync-progress-container">
          <div className="progress-icon">
            <Search size={48} className="pulse-icon" />
          </div>
          <h2 className="progress-title">Scanning your library...</h2>
          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${scanTotal > 0 ? (scanProgress / scanTotal) * 100 : 0}%` }}
            ></div>
          </div>
          <p className="progress-text">
            Processed {scanProgress} of {scanTotal} files
          </p>
        </div>
      ) : (
        <div className="sync-options">
          {/* Option 1: Scan System */}
          <div className="sync-card">
            <div className="sync-card-icon">
              <Search size={28} />
            </div>
            <div className="sync-card-content">
              <h3 className="sync-card-title">Scan the whole system</h3>
              <p className="sync-card-desc">Automatically find all supported audio files across your local drives.</p>
            </div>
          </div>

          {/* Option 2: Select Folder */}
          <div className="sync-card" onClick={handleSelectFolder}>
            <div className="sync-card-icon">
              <FolderOpen size={28} />
            </div>
            <div className="sync-card-content">
              <h3 className="sync-card-title">Select specific folder</h3>
              <p className="sync-card-desc">Manually choose the exact directory where your music collection lives.</p>
            </div>
          </div>

          {/* Option 3: Connect Cloud */}
          <div className="sync-card">
            <div className="sync-card-icon">
              <Cloud size={28} />
            </div>
            <div className="sync-card-content">
              <h3 className="sync-card-title">Connect to a server/cloud</h3>
              <p className="sync-card-desc">Link your external sources like WebDAV, Plex, or cloud storage.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
