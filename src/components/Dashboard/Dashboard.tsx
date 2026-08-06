import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MainContent from './MainContent';
import RightPanel from './RightPanel';
import PlayerBar from './PlayerBar';
import Settings from '../pages/Settings';
import Library from '../pages/Library';
import PlaylistDetail from '../Playlist/PlaylistDetail';
import './Dashboard.scss';
import { invoke } from '@tauri-apps/api/core';

import { Track, BackendTrackMetadata } from '../../types';
import { useQueue } from '../../context/QueueContext';

interface DashboardProps {
  searchQuery?: string;
}

export default function Dashboard({ searchQuery }: DashboardProps) {
  const location = useLocation();
  const { currentTrack } = useQueue();
  
  // Retrieve the scanned track objects passed from SyncPage, or initialize empty
  const [musicFiles, setMusicFiles] = useState<Track[]>(location.state?.musicFiles || []);
  
  const loadCachedLibrary = () => {
    invoke('get_cached_library')
      .then((cachedTracks: any) => {
        const mapped = cachedTracks.map((meta: any, idx: number) => ({
          id: idx.toString(),
          path: meta.file_path,
          fileName: meta.file_path.split('\\').pop()?.split('/').pop() || 'Unknown',
          title: meta.title || 'Unknown Title',
          artist: meta.artist || 'Unknown Artist',
          album: meta.album || 'Unknown Album',
          durationSecs: meta.duration,
          coverArt: meta.cover_art,
          sampleRate: meta.sample_rate,
          bitDepth: meta.bit_depth,
          bitrate: meta.bitrate
        }));
        setMusicFiles(mapped);
      })
      .catch(err => console.error("Failed to load cached library:", err));
  };

  useEffect(() => {
    if (!location.state?.musicFiles || location.state.musicFiles.length === 0) {
      loadCachedLibrary();
    } else {
      setMusicFiles(location.state.musicFiles);
    }
  }, [location.state?.musicFiles]);

  useEffect(() => {
    window.addEventListener('library-updated', loadCachedLibrary);
    return () => window.removeEventListener('library-updated', loadCachedLibrary);
  }, []);

  const [currentView, setCurrentView] = useState<string>(
    location.state?.activeView || 'home'
  );

  useEffect(() => {
    if (location.state?.activeView) {
      setCurrentView(location.state.activeView);
    }
  }, [location.state]);

  // Track selection is handled directly inside MainContent now
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className={`dashboard-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="dashboard-left">
        <Sidebar 
          activeView={currentView} 
          onNavigate={setCurrentView} 
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
      </div>
      
      <div className="dashboard-center">
        <div className="dashboard-main-wrapper">
          <div className="dashboard-main-content">
            {currentView === 'settings' ? (
              <Settings />
            ) : currentView === 'library' ? (
              <Library 
                musicFiles={musicFiles} 
                currentTrackId={currentTrack?.id}
              />
            ) : currentView.startsWith('playlist_') ? (
              <PlaylistDetail 
                playlistId={currentView.replace('playlist_', '')} 
                musicFiles={musicFiles} 
              />
            ) : (
              <MainContent 
                musicFiles={musicFiles} 
                currentTrackId={currentTrack?.id} 
                searchQuery={searchQuery}
              />
            )}
          </div>
        </div>
      </div>
      
      <div className="dashboard-right">
        <RightPanel />
      </div>
      
      <div className="dashboard-bottom">
        <PlayerBar />
      </div>
    </div>
  );
}
