import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './App.scss'; // ensure SCSS is imported
import GetStarted from './components/GetStarted/GetStarted';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/Auth/Login/Login';
import CreateAccount from './components/Auth/CreateAccount/CreateAccount';
import ForgotPassword from './components/Auth/ForgotPassword/ForgotPassword';
import SyncPage from './components/Sync/SyncPage';
import Dashboard from './components/Dashboard/Dashboard';
import searchIcon from './assets/search-icon.svg';

export default function App() {
  const appWindow = getCurrentWindow();
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';
  const [isMaximized, setIsMaximized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasFinishedSetup] = useState(() => localStorage.getItem('hertzsonic_setup_complete') === 'true');

  useEffect(() => {
    const updateMaximizedState = async () => {
      setIsMaximized(await appWindow.isMaximized());
    };

    updateMaximizedState();
    const unlisten = appWindow.onResized(updateMaximizedState);

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appWindow]);

  const handleMinimize = () => appWindow.minimize();
  const handleToggleMaximize = async () => {
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  };
  const handleClose = () => appWindow.close();

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag on primary left click and when not clicking controls or searchbar
    if (e.buttons === 1 && 
        !(e.target as HTMLElement).closest('.titlebar-controls') &&
        !(e.target as HTMLElement).closest('.titlebar-search-container')) {
      appWindow.startDragging();
    }
  };

  return (
    // MAIN APP WRAPPER: Must be completely transparent
    <div className="glass-wrapper">
      {/* CUSTOM SCSS TITLEBAR */}
      <div 
        className="custom-titlebar" 
        data-tauri-drag-region 
        onMouseDown={handleMouseDown}
        onDoubleClick={handleToggleMaximize}
      >
        {isDashboard && (
          <div className="titlebar-search-container">
            <img src={searchIcon} alt="Search" className="titlebar-search-icon" />
            <input 
              type="text" 
              className="titlebar-search-input" 
              placeholder="Search for music, artist or album"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        <div className="titlebar-drag-space" data-tauri-drag-region style={{ flex: 1, height: '100%' }}></div>

        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={handleMinimize} title="Minimize">
            &#8722;
          </button>
          <button className="titlebar-btn" onClick={handleToggleMaximize} title={isMaximized ? "Restore Down" : "Maximize"}>
            {isMaximized ? '❐' : '□'}
          </button>
          <button className="titlebar-btn close-btn" onClick={handleClose} title="Close">
            &#10005;
          </button>
        </div>
      </div>

      {/* MAIN CONTENT LAYER */}
      <Routes>
        <Route path="/" element={hasFinishedSetup ? <Navigate to="/dashboard" replace /> : <GetStarted />} />
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/create-account" element={<CreateAccount />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/sync" element={<SyncPage />} />
        <Route path="/dashboard" element={<Dashboard searchQuery={searchQuery} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}