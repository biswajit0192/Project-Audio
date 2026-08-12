import './TrackRow.scss';
import { Cloud, Folder, PlusCircle, Heart, MoreVertical } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import playIndicatorAnime from '../../assets/play-indicator-anime.json';
import { usePlaylists } from '../../context/PlaylistContext';
import { useQueue } from '../../context/QueueContext';
import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface TrackRowProps {
  trackNumber?: number;
  coverArt?: string;
  title: string;
  artist: string;
  album?: string;
  duration?: string;
  sampleRate?: number | null;
  bitDepth?: number | null;
  bitrate?: number | null;
  filePath?: string;
  variant?: 'compact' | 'wide';
  isActive?: boolean;
  isCloud?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}

export default function TrackRow({
  trackNumber,
  coverArt,
  title,
  artist,
  album,
  duration,
  sampleRate,
  bitDepth,
  bitrate,
  filePath,
  variant = 'wide',
  isActive = false,
  isCloud = false,
  onRemove,
  onClick
}: TrackRowProps) {
  const { playlists, favoritePaths, toggleFavorite, addTrackToPlaylist, createPlaylist } = usePlaylists();
  const { queue, playNext, addToQueue, removeFromQueue } = useQueue();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [useTrash, setUseTrash] = useState(true);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  useEffect(() => {
    const handlePlayerState = (e: Event) => {
      const customEvent = e as CustomEvent;
      const playing = customEvent.detail?.isPlaying;
      setIsPlayerPlaying(playing);
      if (playing) {
        lottieRef.current?.play();
      } else {
        lottieRef.current?.pause();
      }
    };
    window.addEventListener('player-state-changed', handlePlayerState);
    
    // Request current state immediately on mount
    window.dispatchEvent(new Event('request-player-state'));

    return () => window.removeEventListener('player-state-changed', handlePlayerState);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setIsCreating(false);
      }
    };
    if (showDropdown || showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown, showContextMenu]);

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (filePath) {
      await toggleFavorite(filePath);
    }
  };

  const handleAddTrack = async (e: React.MouseEvent, playlistId: string) => {
    e.stopPropagation();
    if (filePath) {
      await addTrackToPlaylist(playlistId, filePath);
      setShowDropdown(false);
    }
  };

  const handleCreateAndAdd = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newPlaylistName.trim() || !filePath) return;

    try {
      const p = await createPlaylist(newPlaylistName.trim());
      await addTrackToPlaylist(p.id, filePath);
      setNewPlaylistName('');
      setIsCreating(false);
      setShowDropdown(false);
    } catch (err) {
      console.error("Failed to create playlist", err);
    }
  };

  const audioBadge = (() => {
    if ((sampleRate && sampleRate >= 88200) || (bitDepth && bitDepth > 16)) {
      return 'HR'; // Hi-Res
    } else if (bitDepth === 16 || (bitrate && bitrate >= 320)) {
      return 'SQ'; // Standard Quality
    }
    return null;
  })();

  // Close context menu if clicked outside
  useEffect(() => {
    const handleContextClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
      }
    };
    if (showContextMenu) {
      document.addEventListener('mousedown', handleContextClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleContextClickOutside);
  }, [showContextMenu]);

  const handlePlayNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowContextMenu(false);
    if (filePath) {
      playNext({
        id: filePath,
        path: filePath,
        fileName: title,
        title,
        artist,
        album: album || 'Unknown Album',
        durationSecs: 0, // This is mock since we don't have exact secs here easily, but it works for queue
        coverArt: coverArt ?? null,
        sampleRate: sampleRate ?? null,
        bitDepth: bitDepth ?? null,
        bitrate: bitrate ?? null
      });
    }
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowContextMenu(false);
    if (filePath) {
      addToQueue({
        id: filePath,
        path: filePath,
        fileName: title,
        title,
        artist,
        album: album || 'Unknown Album',
        durationSecs: 0,
        coverArt: coverArt ?? null,
        sampleRate: sampleRate ?? null,
        bitDepth: bitDepth ?? null,
        bitrate: bitrate ?? null
      });
    }
  };

  const handleGoToArtist = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowContextMenu(false);
    window.dispatchEvent(new CustomEvent('navigate-library', { detail: { tab: 'artists', filter: artist } }));
  };

  const handleGoToAlbum = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowContextMenu(false);
    if (album) {
      window.dispatchEvent(new CustomEvent('navigate-library', { detail: { tab: 'albums', filter: album } }));
    }
  };

  const handleShowInFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowContextMenu(false);
    if (filePath) {
      await invoke('reveal_track_in_explorer', { path: filePath }).catch(console.error);
    }
  };

  const handleRemoveFromPlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowContextMenu(false);
    if (onRemove) onRemove();
  };

  const handleDeleteTrack = async () => {
    setShowDeleteModal(false);
    if (filePath) {
      await invoke('delete_track', { filePath, useTrash }).catch(console.error);
      
      // Iterate backward to remove all instances from queue seamlessly
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].path === filePath) {
          removeFromQueue(i);
        }
      }
      
      window.dispatchEvent(new Event('library-updated'));
    }
  };

  return (
    <div className={`track-row ${variant} ${isActive ? 'active' : ''}`} onClick={onClick}>
      {/* 1. Track Number or Playing Indicator */}
      {variant === 'wide' && trackNumber && (
        <div className="track-number-col">
          {isActive ? (
            <div className="playing-indicator-icon">
              <Lottie 
                lottieRef={lottieRef}
                animationData={playIndicatorAnime} 
                loop={true} 
                autoplay={isPlayerPlaying} 
              />
            </div>
          ) : (
            <span className="number">{trackNumber}</span>
          )}
        </div>
      )}

      {/* 2. Cover Art & Info Wrapper for Title column */}
      <div className="track-title-col">
        {coverArt ? (
          <img src={coverArt.startsWith('data:') ? coverArt : convertFileSrc(coverArt)} alt={`${title} art`} className="track-art" />
        ) : (
          <div className="track-art-placeholder">
            <span className="music-note">♪</span>
          </div>
        )}

        {/* 3. Title & Artist */}
        <div className="track-info">
          <span className="track-title">{title}</span>
          <div className="track-artist-wrapper">
            {audioBadge && <span className={`audio-badge badge-${audioBadge.toLowerCase()}`}>{audioBadge}</span>}
            <span className="track-artist">{artist}</span>
          </div>
        </div>
      </div>

      {/* 4. Album (Wide Only) */}
      {variant === 'wide' && (
        <div className="track-album-col">
          <span className="track-album">{album || 'Unknown Album'}</span>
        </div>
      )}

      {/* 5. Duration */}
      {duration && (
        <div className="track-duration-col">
          <span className="track-duration">{duration}</span>
        </div>
      )}

      {/* 6. Source (Wide Only) */}
      {variant === 'wide' && (
        <div className="track-source-col">
          <button className="action-btn">
            {isCloud ? <Cloud size={18} /> : <Folder size={18} />}
          </button>
        </div>
      )}

      {/* 7. Actions (Wide Only) */}
      {variant === 'wide' && (
        <div className="track-action-col">
          <div className="dropdown-container" ref={dropdownRef}>
            <button className="action-btn" onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }}>
              <PlusCircle size={18} />
            </button>
            {showDropdown && (
              <div className="playlist-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="dropdown-header">Add to Playlist</div>
                <div className="dropdown-list">
                  {playlists.map(p => (
                    <div key={p.id} className="dropdown-item" onClick={(e) => handleAddTrack(e, p.id)}>
                      {p.name}
                    </div>
                  ))}
                </div>
                <div className="dropdown-footer">
                  {isCreating ? (
                    <form className="new-playlist-form" onSubmit={handleCreateAndAdd}>
                      <input 
                        autoFocus
                        type="text" 
                        value={newPlaylistName} 
                        onChange={e => setNewPlaylistName(e.target.value)} 
                        placeholder="Playlist name..."
                      />
                      <button type="submit" className="save-btn">Save</button>
                    </form>
                  ) : (
                    <div className="new-playlist-trigger" onClick={(e) => { e.stopPropagation(); setIsCreating(true); }}>
                      + New Playlist
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button 
            className={`action-btn fav-btn ${filePath && favoritePaths.has(filePath) ? 'is-fav' : ''}`}
            onClick={handleFavoriteClick}
            title="Toggle Favorite"
          >
            <Heart 
              size={18} 
              fill={filePath && favoritePaths.has(filePath) ? 'currentColor' : 'none'} 
            />
          </button>
          
          <div style={{ position: 'relative' }} ref={contextMenuRef}>
            <button className="action-btn" onClick={(e) => { e.stopPropagation(); setShowContextMenu(!showContextMenu); setShowDropdown(false); }}>
              <MoreVertical size={18} />
            </button>

            {showContextMenu && (
              <div className="track-context-menu" onClick={(e) => e.stopPropagation()}>
                <button className="context-menu-item" onClick={handlePlayNext}>Play Next</button>
                <button className="context-menu-item" onClick={handleAddToQueue}>Add to Queue</button>
                
                <div className="context-menu-divider" />
                
                <button className="context-menu-item" onClick={handleGoToArtist}>Go to Artist</button>
                {album && <button className="context-menu-item" onClick={handleGoToAlbum}>Go to Album</button>}
                <button className="context-menu-item" onClick={handleShowInFolder}>Show in File Explorer</button>
                
                <div className="context-menu-divider" />
                
                <button className="context-menu-item" onClick={(e) => { e.stopPropagation(); setShowInfoModal(true); setShowContextMenu(false); }}>Audio File Info</button>
                {onRemove && (
                  <button className="context-menu-item" onClick={handleRemoveFromPlaylist}>Remove from Playlist</button>
                )}
                <button className="context-menu-item danger" onClick={(e) => { e.stopPropagation(); setShowDeleteModal(true); setShowContextMenu(false); }}>Delete Track</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="delete-track-modal-overlay" onClick={(e) => { e.stopPropagation(); setShowDeleteModal(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Track</h3>
            <p>Are you sure you want to remove '{title}'? This will remove it from your library.</p>
            
            <div className="delete-options" style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '20px 0', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="deleteType" 
                  checked={useTrash} 
                  onChange={() => setUseTrash(true)} 
                  style={{ accentColor: '#e53935', cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)' }}>Move to Recycle Bin</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="deleteType" 
                  checked={!useTrash} 
                  onChange={() => setUseTrash(false)} 
                  style={{ accentColor: '#e53935', cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)' }}>Delete Permanently</span>
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn-delete" onClick={handleDeleteTrack}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Audio File Info Modal */}
      {showInfoModal && (
        <div className="track-info-modal-overlay" onClick={(e) => { e.stopPropagation(); setShowInfoModal(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Audio File Info</h3>
            <div className="info-list">
              <div className="info-row">
                <span className="label">Format</span>
                <span className="value">{filePath?.split('.').pop()?.toUpperCase() || 'UNKNOWN'}</span>
              </div>
              <div className="info-row">
                <span className="label">Sample Rate</span>
                <span className="value">{sampleRate ? `${sampleRate / 1000} kHz` : 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="label">Bit Depth</span>
                <span className="value">{bitDepth ? `${bitDepth}-bit` : 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="label">Bitrate</span>
                <span className="value">{bitrate ? `${bitrate} kbps` : 'N/A'}</span>
              </div>
              <div className="info-row" style={{ flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                <span className="label">File Path</span>
                <span className="value" style={{ fontSize: '11px', wordBreak: 'break-all', opacity: 0.8 }}>{filePath}</span>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowInfoModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
