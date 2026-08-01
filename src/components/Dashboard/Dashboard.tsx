import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MainContent from './MainContent';
import RightPanel from './RightPanel';
import PlayerBar from './PlayerBar';
import Settings from '../pages/Settings';
import './Dashboard.scss';
import { invoke } from '@tauri-apps/api/core';

import { Track, BackendTrackMetadata } from '../../types';
import { useQueue } from '../../context/QueueContext';

interface DashboardProps {
  searchQuery?: string;
}

export default function Dashboard({ searchQuery }: DashboardProps) {
  const location = useLocation();
  const { currentTrack, playContext, enrichQueue } = useQueue();
  
  // Retrieve the scanned track objects passed from SyncPage, or initialize empty
  const [musicFiles, setMusicFiles] = useState<Track[]>(location.state?.musicFiles || []);
  
  useEffect(() => {
    if (!location.state?.musicFiles || location.state.musicFiles.length === 0) {
      invoke('get_cached_library')
        .then((cachedMetadata: any) => {
          const tracks: Track[] = cachedMetadata.map((meta: BackendTrackMetadata) => ({
            id: meta.file_path,
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
          setMusicFiles(tracks);
        })
        .catch(console.error);
    } else {
      setMusicFiles(location.state.musicFiles);
    }
  }, [location.state?.musicFiles]);

  useEffect(() => {
    if (musicFiles.length > 0) {
      enrichQueue(musicFiles);
    }
  }, [musicFiles]);

  const [currentView, setCurrentView] = useState<'home' | 'settings'>(
    location.state?.activeView || 'home'
  );

  useEffect(() => {
    if (location.state?.activeView) {
      setCurrentView(location.state.activeView);
    }
  }, [location.state]);

  // Track selection is handled directly inside MainContent now

  return (
    <div className="dashboard-layout">
      <div className="dashboard-left">
        <Sidebar activeView={currentView} onNavigate={setCurrentView} />
      </div>
      
      <div className="dashboard-center">
        <div className="dashboard-main-wrapper">
          <div className="dashboard-main-content">
            {currentView === 'settings' ? (
              <Settings />
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
