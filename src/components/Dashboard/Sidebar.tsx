import './Sidebar.scss';
import logoMain from '../../assets/logo-main.svg';
import logoSymbol from '../../assets/logo-symbol.svg';
import iconConnectedDevice from '../../assets/Connected Device.svg';
import iconHome from '../../assets/Nav/Home.svg';
import iconLibrary from '../../assets/Library.svg';
import iconEqualizer from '../../assets/Equalizer.svg';
import iconConvert from '../../assets/Convert File.svg';
import iconCompare from '../../assets/Compare.svg';
import iconLiked from '../../assets/Nav/Liked.svg';
import iconPlaylist from '../../assets/Nav/PlayList.svg';
import iconSettings from '../../assets/Settings.svg';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { usePlaylists } from '../../context/PlaylistContext';

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ activeView, onNavigate, isCollapsed, onToggleCollapse }: SidebarProps) {
  const { playlists, favoritePaths, playlistCounts } = usePlaylists();

  return (
    <div className={`dashboard-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header" data-tauri-drag-region>
        <img 
          src={isCollapsed ? logoSymbol : logoMain} 
          alt="HertzSonic" 
          className="sidebar-logo" 
          data-tauri-drag-region 
        />
        <button className="collapse-btn" onClick={onToggleCollapse}>
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <div className="sidebar-content">

        {/* Connected Section */}
        <div className="sidebar-section">
          <ul className="nav-list">
            <li className="nav-item">
              <div className="nav-item-content">
                <img src={iconConnectedDevice} alt="Connected" className="nav-icon" />
                <span>JCally JM12</span>
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
                <img src={iconHome} alt="Home" className="nav-icon" />
                <span>Home</span>
              </div>
            </li>
            <li
              className={`nav-item ${activeView === 'library' ? 'active' : ''}`}
              onClick={() => onNavigate('library')}
            >
              <div className="nav-item-content">
                <img src={iconLibrary} alt="Library" className="nav-icon" />
                <span>Library</span>
              </div>
            </li>
            <li className="nav-item">
              <div className="nav-item-content">
                <img src={iconEqualizer} alt="Equalizer" className="nav-icon" />
                <span>Equalizer</span>
              </div>
            </li>
            <li className="nav-item">
              <div className="nav-item-content">
                <img src={iconConvert} alt="Convert Files" className="nav-icon" />
                <span>Convert Files</span>
              </div>
            </li>
            <li className="nav-item">
              <div className="nav-item-content">
                <img src={iconCompare} alt="Compare Files" className="nav-icon" />
                <span>Compare Files</span>
              </div>
            </li>
          </ul>
        </div>

        <hr className="sidebar-divider" />

        {/* Playlists Section */}
        <div className="sidebar-section">
          {!isCollapsed && (
            <div className="section-header">
              <h3>Playlists</h3>
              <span className="view-all">View All</span>
            </div>
          )}
          <ul className="nav-list">
            {isCollapsed ? (
              <li className="nav-item">
                <img src={iconPlaylist} alt="All Playlists" className="nav-icon" />
              </li>
            ) : (
              <>
                {/* Pinned Default Playlists */}
                <li 
                  className={`nav-item ${activeView === 'playlist_favorites' ? 'active' : ''}`}
                  onClick={() => onNavigate('playlist_favorites')}
                >
                  <div className="nav-item-content">
                    <img src={iconLiked} alt="Favorites" className="nav-icon" />
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
                      <img src={iconPlaylist} alt={playlist.name} className="nav-icon" />
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
                <img src={iconSettings} alt="Settings" className="nav-icon" />
                <span>Settings</span>
              </div>
            </li>
          </ul>
        </div>

      </div>
    </div>
  );
}
