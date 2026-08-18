import './Sidebar.scss';
import LogoMain from '../../assets/logo-main.svg?react';
import LogoSymbol from '../../assets/logo-symbol.svg?react';
import IconConnectedDevice from '../../assets/Connected Device.svg?react';
import IconHome from '../../assets/Nav/Home.svg?react';
import IconLibrary from '../../assets/Library.svg?react';
import IconEqualizer from '../../assets/Equalizer.svg?react';
import IconLiked from '../../assets/Nav/Liked.svg?react';
import IconPlaylist from '../../assets/Nav/PlayList.svg?react';
import IconSettings from '../../assets/Settings.svg?react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { usePlaylists } from '../../context/PlaylistContext';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import DeviceModal, { AudioDeviceInfo } from '../DeviceModal/DeviceModal';

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ activeView, onNavigate, isCollapsed, onToggleCollapse }: SidebarProps) {
  const { playlists, favoritePaths, playlistCounts } = usePlaylists();
  const [audioDevice, setAudioDevice] = useState<AudioDeviceInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchDevice = async () => {
    try {
      const device = await invoke<AudioDeviceInfo | null>('get_current_audio_device');
      setAudioDevice(device);
    } catch (err) {
      console.error("Failed to fetch audio device:", err);
    }
  };

  useEffect(() => {
    fetchDevice();

    const unlisten = listen('audio-devices-changed', () => {
      fetchDevice();
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  return (
    <div className={`dashboard-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header" data-tauri-drag-region>
        {isCollapsed ? (
          <LogoSymbol className="sidebar-logo" data-tauri-drag-region />
        ) : (
          <LogoMain className="sidebar-logo" data-tauri-drag-region />
        )}
        <button className="collapse-btn" onClick={onToggleCollapse}>
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <div className="sidebar-content">

        {/* Connected Section */}
        <div className="sidebar-section">
          <ul className="nav-list">
            <li
              className="nav-item"
              onClick={() => {
                if (audioDevice) setIsModalOpen(true);
              }}
              style={{ cursor: audioDevice ? 'pointer' : 'default' }}
            >
              <div className="nav-item-content">
                <IconConnectedDevice
                  className="nav-icon"
                  style={{ opacity: audioDevice ? 1 : 0.4 }}
                /><span style={{ color: audioDevice ? 'inherit' : '#94a3b8' }}>
                  {audioDevice ? (audioDevice.nickname || audioDevice.hardware_name) : 'No Device'}
                </span>
              </div>
            </li>
          </ul>
        </div>

        <hr className="sidebar-divider" />

        {/* Menu Section */}
        <div className="sidebar-section">
          {!isCollapsed && (
            <div className="section-header">
              <h3>Menu</h3>
            </div>
          )}
          <ul className="nav-list">
            <li
              className={`nav-item ${activeView === 'home' ? 'active' : ''}`}
              onClick={() => onNavigate('home')}
            >
              <div className="nav-item-content">
                <IconHome className="nav-icon" />
                <span>Home</span>
              </div>
            </li>
            <li
              className={`nav-item ${activeView === 'library' ? 'active' : ''}`}
              onClick={() => onNavigate('library')}
            >
              <div className="nav-item-content">
                <IconLibrary className="nav-icon" />
                <span>Library</span>
              </div>
            </li>
            <li className={`nav-item ${activeView === 'equalizer' ? 'active' : ''}`} onClick={() => onNavigate('equalizer')}>
              <div className="nav-item-content">
                <IconEqualizer className="nav-icon" />
                <span>Equalizer</span>
              </div>
            </li>
            {/* <li className="nav-item">
              <div className="nav-item-content">
                <IconConvert className="nav-icon" />
                <span>Convert Files</span>
              </div>
            </li> */}
            {/* <li className="nav-item">
              <div className="nav-item-content">
                <IconCompare className="nav-icon" />
                <span>Compare Files</span>
              </div>
            </li> */}
          </ul>
        </div>

        <hr className="sidebar-divider" />

        {/* Playlists Section */}
        <div className="sidebar-section">
          {!isCollapsed && (
            <div className="section-header">
              <h3>Playlists</h3>
              <span className="view-all" onClick={() => onNavigate('all_playlists')} style={{ cursor: 'pointer' }}>View All</span>
            </div>
          )}
          <ul className="nav-list">
            {isCollapsed ? (
              <li className="nav-item">
                <IconPlaylist className="nav-icon" />
              </li>
            ) : (
              <>
                {/* Pinned Default Playlists */}
                <li
                  className={`nav-item ${activeView === 'playlist_favorites' ? 'active' : ''}`}
                  onClick={() => onNavigate('playlist_favorites')}
                >
                  <div className="nav-item-content">
                    <IconLiked className="nav-icon" />
                    <span>Favorites</span>
                  </div>
                  <span className="nav-badge">{favoritePaths.size}</span>
                </li>

                {/* Dynamic Custom Playlists */}
                {playlists.map((playlist) => (
                  <li
                    key={playlist.id}
                    className={`nav-item ${activeView === `playlist_${playlist.id}` ? 'active' : ''}`}
                    onClick={() => onNavigate(`playlist_${playlist.id}`)}
                  >
                    <div className="nav-item-content">
                      <IconPlaylist className="nav-icon" />
                      <span>{playlist.name}</span>
                    </div>
                    <span className="nav-badge">{playlistCounts[playlist.id] || 0}</span>
                  </li>
                ))}
              </>
            )}
          </ul>
        </div>

        <hr className="sidebar-divider" />

        {/* Settings Section */}
        <div className="sidebar-section settings-section">
          <ul className="nav-list">
            <li
              className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
              onClick={() => onNavigate('settings')}
            >
              <div className="nav-item-content">
                <IconSettings className="nav-icon" />
                <span>Settings</span>
              </div>
            </li>
          </ul>
        </div>

      </div>

      {isModalOpen && audioDevice && (
        <DeviceModal
          currentDevice={audioDevice}
          onClose={() => setIsModalOpen(false)}
          onNicknameUpdated={fetchDevice}
        />
      )}
    </div>
  );
}
