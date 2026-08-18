import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MainContent from './MainContent';
import RightPanel from './RightPanel';
import PlayerBar from './PlayerBar';
import Settings from '../pages/Settings';
import Library from '../pages/Library';
import AllPlaylists from '../pages/AllPlaylists';
import PlaylistDetail from '../Playlist/PlaylistDetail';
import EqualizerView from './EqualizerView';
import './Dashboard.scss';
import { invoke } from '@tauri-apps/api/core';

import { Track } from '../../types';
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
        // 1. Gather all album cover arts
        const albumCovers = new Map<string, string>();
        for (const meta of cachedTracks) {
          if (meta.cover_art && meta.album) {
            albumCovers.set(meta.album, meta.cover_art);
          }
        }

        // 2. Map tracks, falling back to album cover art if missing
        const mapped = cachedTracks.map((meta: any, idx: number) => ({
          id: idx.toString(),
          path: meta.file_path,
          fileName: meta.file_path.split('\\').pop()?.split('/').pop() || 'Unknown',
          title: meta.title || 'Unknown Title',
          artist: meta.artist || 'Unknown Artist',
          album: meta.album || 'Unknown Album',
          durationSecs: meta.duration,
          sampleRate: meta.sample_rate,
          bitDepth: meta.bit_depth,
          bitrate: meta.bitrate,
          dateAdded: meta.date_added,
          coverArt: meta.cover_art || (meta.album ? albumCovers.get(meta.album) : null) || null,
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

  const [rightPanelMode, setRightPanelMode] = useState<'queue' | 'equalizer'>('queue');
  const [libraryFilter, setLibraryFilter] = useState<{tab: string, filter: string} | null>(null);

  useEffect(() => {
    if (location.state?.activeView) {
      setCurrentView(location.state.activeView);
    }
  }, [location.state]);

  useEffect(() => {
    const handleNavigateLibrary = (e: Event) => {
      const customEvent = e as CustomEvent;
      setCurrentView('library');
      setLibraryFilter(customEvent.detail);
    };
    window.addEventListener('navigate-library', handleNavigateLibrary);
    return () => window.removeEventListener('navigate-library', handleNavigateLibrary);
  }, []);

  useEffect(() => {
    const handleNavigateEqualizer = () => {
      setCurrentView('equalizer');
    };
    window.addEventListener('navigate-equalizer', handleNavigateEqualizer);
    return () => window.removeEventListener('navigate-equalizer', handleNavigateEqualizer);
  }, []);

  useEffect(() => {
    let lastTime = Date.now();
    
    // Check every second if the system has resumed from sleep
    const interval = setInterval(() => {
      const currentTime = Date.now();
      // If more than 10 seconds have elapsed since the last tick, the system likely went to sleep
      if (currentTime - lastTime > 10000) {
        console.log("System resume detected! Forcing resize to fix Webview2 buffer...");
        window.dispatchEvent(new Event('resize'));
      }
      lastTime = currentTime;
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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
                initialFilter={libraryFilter}
              />
            ) : currentView === 'equalizer' ? (
              <EqualizerView />
            ) : currentView === 'all_playlists' ? (
              <AllPlaylists 
                musicFiles={musicFiles} 
                onNavigate={setCurrentView} 
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
        <RightPanel mode={rightPanelMode} />
      </div>
      
      <div className="dashboard-bottom">
        <PlayerBar 
          rightPanelMode={rightPanelMode} 
          onSetRightPanelMode={setRightPanelMode} 
        />
      </div>
    </div>
  );
}
