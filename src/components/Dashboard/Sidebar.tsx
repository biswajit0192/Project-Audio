import './Sidebar.scss';
import logoMain from '../../assets/logo-main.svg';
import iconConnectedDevice from '../../assets/Connected Device.svg';
import iconHome from '../../assets/Nav/Home.svg';
import iconLibrary from '../../assets/Library.svg';
import iconEqualizer from '../../assets/Equalizer.svg';
import iconConvert from '../../assets/Convert File.svg';
import iconCompare from '../../assets/Compare.svg';
import iconLiked from '../../assets/Nav/Liked.svg';
import iconPlaylist from '../../assets/Nav/PlayList.svg';
import iconSettings from '../../assets/Settings.svg';

interface SidebarProps {
  activeView: 'home' | 'settings';
  onNavigate: (view: 'home' | 'settings') => void;
}

export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <div className="dashboard-sidebar">
      {/* Draggable header area containing the logo */}
      <div className="sidebar-header" data-tauri-drag-region>
        <img src={logoMain} alt="HertzSonic" className="sidebar-logo" data-tauri-drag-region />
      </div>
      
      <div className="sidebar-content">
        
        {/* Connected Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <h3>Connected</h3>
            <span className="view-all">View All</span>
          </div>
          <ul className="nav-list">
            <li className="nav-item">
              <img src={iconConnectedDevice} alt="Connected" className="nav-icon" />
              <span>JCally JM12</span>
            </li>
          </ul>
        </div>

        <hr className="sidebar-divider" />

        {/* Menu Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <h3>Menu</h3>
          </div>
          <ul className="nav-list">
            <li 
              className={`nav-item ${activeView === 'home' ? 'active' : ''}`}
              onClick={() => onNavigate('home')}
            >
              <img src={iconHome} alt="Home" className="nav-icon" />
              <span>Home</span>
            </li>
            <li className="nav-item">
              <img src={iconLibrary} alt="Library" className="nav-icon" />
              <span>Library</span>
            </li>
            <li className="nav-item">
              <img src={iconEqualizer} alt="Equalizer" className="nav-icon" />
              <span>Equalizer</span>
            </li>
            <li className="nav-item">
              <img src={iconConvert} alt="Convert Files" className="nav-icon" />
              <span>Convert Files</span>
            </li>
            <li className="nav-item">
              <img src={iconCompare} alt="Compare Files" className="nav-icon" />
              <span>Compare Files</span>
            </li>
          </ul>
        </div>

        <hr className="sidebar-divider" />

        {/* Playlists Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <h3>Playlists</h3>
            <span className="view-all">View All</span>
          </div>
          <ul className="nav-list">
            <li className="nav-item">
              <img src={iconLiked} alt="Favorites" className="nav-icon" />
              <span>Favorites</span>
            </li>
            <li className="nav-item">
              <img src={iconPlaylist} alt="Vocals" className="nav-icon" />
              <span>Vocals</span>
            </li>
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
              <img src={iconSettings} alt="Settings" className="nav-icon" />
              <span>Settings</span>
            </li>
          </ul>
        </div>

      </div>
    </div>
  );
}
